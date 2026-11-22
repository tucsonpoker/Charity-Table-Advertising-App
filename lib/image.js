'use strict';
// Reads pixel size from common image headers (no external libraries) and grades print quality.
function dimensions(buf, mime) {
  try {
    if (mime === 'image/png' && buf.readUInt32BE(0) === 0x89504e47) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    if (mime === 'image/gif') return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
    if (mime === 'image/jpeg') {
      let i = 2;
      while (i < buf.length) {
        if (buf[i] !== 0xff) { i++; continue; }
        const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
        if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
        i += 2 + len;
      }
    }
    if (mime === 'image/webp' && buf.toString('ascii', 0, 4) === 'RIFF') {
      const kind = buf.toString('ascii', 12, 16);
      if (kind === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
      if (kind === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
      if (kind === 'VP8L') { const b = buf.readUInt32LE(21); return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 }; }
    }
  } catch { /* fall through */ }
  return null;
}
const ALLOWED = { 'image/png': 1, 'image/jpeg': 1, 'image/gif': 1, 'image/webp': 1, 'image/svg+xml': 1, 'application/pdf': 1 };
// Logos are enlarged a lot on a 74 x 32 inch playing surface, so small files are flagged early.
function grade(buf, mime) {
  if (mime === 'image/svg+xml' || mime === 'application/pdf') return { quality: 'review', message: 'Vector or PDF file received. Cactus will confirm it prints sharply.' };
  const d = dimensions(buf, mime);
  if (!d) return { quality: 'review', message: 'We could not measure this file. Cactus will check it.' };
  const longest = Math.max(d.w, d.h);
  if (longest < 800) return { ...d, quality: 'low', message: `This image is only ${d.w} × ${d.h} pixels, which is too small to print clearly on a table. Ask the sponsor or their designer for the original logo (vector, PDF, or a large PNG).` };
  if (longest < 2000) return { ...d, quality: 'review', message: `${d.w} × ${d.h} pixels. Usable for smaller spaces. Cactus will review it.` };
  return { ...d, quality: 'good', message: `${d.w} × ${d.h} pixels. Initial quality check passed. Awaiting Cactus approval.` };
}
// Checks the file's first bytes, so a renamed text file or program is not stored as a logo.
function looksLike(buf, mime) {
  if (!buf || buf.length < 8) return false;
  const head = buf.subarray(0, 16);
  switch (mime) {
    case 'image/png': return head.readUInt32BE(0) === 0x89504e47;
    case 'image/jpeg': return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    case 'image/gif': return head.toString('ascii', 0, 4) === 'GIF8';
    case 'image/webp': return head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP';
    case 'application/pdf': return buf.subarray(0, 1024).toString('latin1').includes('%PDF-');
    case 'image/svg+xml': return /<svg[\s>]/i.test(buf.subarray(0, 4096).toString('utf8'));
    default: return false;
  }
}
module.exports = { dimensions, grade, looksLike, ALLOWED };
