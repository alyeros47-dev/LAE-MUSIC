#!/usr/bin/env bash
# Run interactively on the owner's trusted computer. No password is placed in argv or source control.
set -euo pipefail
if [ "$#" -ne 1 ]; then echo 'Usage: create-upload-key.sh /private/path/lae-upload.jks' >&2; exit 2; fi
if [ -e "$1" ]; then echo 'Refusing to replace an existing signing key.' >&2; exit 2; fi
umask 077
keytool -genkeypair -keystore "$1" -alias lae-upload -keyalg RSA -keysize 3072 -validity 10000
printf '%s\n' 'Back up this key and its password securely. Do not commit or send them in chat.'
