"""Read only the fresh reset email addressed to this verification's exact alias.
Credentials and the recovered link stay in process pipes; never print exceptions.
No mailbox flags or messages are changed.
"""
import email, email.policy, email.utils, imaplib, json, re, ssl, sys, time

def main():
    data = json.load(sys.stdin)
    user, recipient = data['user'], data['recipient']
    if user != 'laemusic067@gmail.com' or not re.fullmatch(r'laemusic067\+lae-reset-[a-f0-9]{16}@gmail\.com', recipient):
        return {'received': False, 'reason': 'unexpected_test_recipient'}
    client = None
    try:
        client = imaplib.IMAP4_SSL('imap.gmail.com', 993, ssl_context=ssl.create_default_context(), timeout=15)
        client.login(user, data['password'])
        status, _ = client.select('INBOX', readonly=True)
        if status != 'OK':
            return {'received': False, 'reason': 'inbox_unavailable'}
        until = time.monotonic() + 75
        while time.monotonic() < until:
            status, matches = client.uid('search', None, 'HEADER', 'To', '"' + recipient + '"', 'HEADER', 'Subject', '"Reset your LAE-MUSIC password"')
            if status == 'OK':
                for uid in matches[0].split()[-3:]:
                    status, rows = client.uid('fetch', uid, '(BODY.PEEK[])')
                    if status != 'OK':
                        continue
                    raw = next((row[1] for row in rows if isinstance(row, tuple)), None)
                    if not raw:
                        continue
                    message = email.message_from_bytes(raw, policy=email.policy.default)
                    addresses = [address.lower() for _, address in email.utils.getaddresses(message.get_all('to', []))]
                    if recipient not in addresses or str(message['subject']) != 'Reset your LAE-MUSIC password':
                        continue
                    date = email.utils.parsedate_to_datetime(str(message['date']))
                    if date.timestamp() < data['not_before'] - 5:
                        continue
                    part = message.get_body(preferencelist=('plain',))
                    text = part.get_content() if part else ''
                    links = re.findall(r'https://lae-music\.com/recover#token=[a-f0-9]{64}&role=listener', text)
                    if len(links) == 1:
                        return {'received': True, 'url': links[0], 'mailbox_flags_changed': False}
            time.sleep(3)
        return {'received': False, 'reason': 'reset_email_not_in_inbox_yet'}
    except imaplib.IMAP4.error:
        return {'received': False, 'reason': 'imap_access_not_available'}
    except Exception:
        return {'received': False, 'reason': 'mailbox_check_unavailable'}
    finally:
        if client:
            try:
                client.logout()
            except Exception:
                pass

try:
    print(json.dumps(main()))
except Exception:
    print(json.dumps({'received': False, 'reason': 'mailbox_check_unavailable'}))
