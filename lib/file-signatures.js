'use strict';
function matches(bytes, mime) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 12) return false;
  if (mime === 'audio/mpeg') return bytes.toString('ascii', 0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  if (mime === 'audio/mp4' || mime === 'audio/x-m4a') return bytes.toString('ascii', 4, 8) === 'ftyp';
  if (mime === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  if (mime === 'image/webp') return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  return false;
}
async function verifyStoredPrefix(url, mime, fetcher = fetch) {
  const r = await fetcher(url, { headers: { Range: 'bytes=0-63' }, signal: AbortSignal.timeout(15000) });
  if (!r.ok || !r.body) throw Object.assign(Error('Could not verify the stored file'), { status: 502 });
  const reader = r.body.getReader(); let bytes = Buffer.alloc(0);
  try { while (bytes.length < 12) { const part = await reader.read(); if (part.done) break; bytes = Buffer.concat([bytes, Buffer.from(part.value).subarray(0, 64)]); } }
  finally { await reader.cancel().catch(() => {}); }
  if (!matches(bytes, mime)) throw Object.assign(Error('Stored file contents do not match the selected format'), { status: 415 });
}
module.exports = { matches, verifyStoredPrefix };
