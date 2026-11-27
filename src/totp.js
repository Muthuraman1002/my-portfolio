// Time-based one-time codes (RFC 6238), so the app can log in with your saved TOTP secret.
function sha1(bytes) {
  const ml = bytes.length * 8;
  const withOne = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6);
  withOne.set(bytes); withOne[bytes.length] = 0x80;
  const dv = new DataView(withOne.buffer);
  dv.setUint32(withOne.length - 4, ml >>> 0); dv.setUint32(withOne.length - 8, Math.floor(ml / 2 ** 32));
  let [h0, h1, h2, h3, h4] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const w = new Uint32Array(80);
  for (let i = 0; i < withOne.length; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4);
    for (let t = 16; t < 80; t++) { const x = w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16]; w[t] = (x << 1) | (x >>> 31); }
    let [a, b, c, d, e] = [h0, h1, h2, h3, h4];
    for (let t = 0; t < 80; t++) {
      const [f, k] = t < 20 ? [(b & c) | (~b & d), 0x5a827999] : t < 40 ? [b ^ c ^ d, 0x6ed9eba1] : t < 60 ? [(b & c) | (b & d) | (c & d), 0x8f1bbcdc] : [b ^ c ^ d, 0xca62c1d6];
      const tmp = (((a << 5) | (a >>> 27)) + f + e + k + w[t]) >>> 0;
      e = d; d = c; c = ((b << 30) | (b >>> 2)) >>> 0; b = a; a = tmp;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  const out = new Uint8Array(20), o = new DataView(out.buffer);
  [h0, h1, h2, h3, h4].forEach((h, i) => o.setUint32(i * 4, h));
  return out;
}

function hmacSha1(key, msg) {
  if (key.length > 64) key = sha1(key);
  const k = new Uint8Array(64); k.set(key);
  const ipad = k.map((b) => b ^ 0x36), opad = k.map((b) => b ^ 0x5c);
  const inner = new Uint8Array(64 + msg.length); inner.set(ipad); inner.set(msg, 64);
  const ih = sha1(inner);
  const outer = new Uint8Array(84); outer.set(opad); outer.set(ih, 64);
  return sha1(outer);
}

function base32(s) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = s.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0, val = 0;
  const out = [];
  for (const ch of clean) {
    const i = A.indexOf(ch);
    if (i < 0) throw new Error("The TOTP secret has characters that aren't valid.");
    val = (val << 5) | i; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out);
}

export function totp(secret, time = Date.now(), step = 30, digits = 6) {
  const counter = Math.floor(time / 1000 / step);
  const msg = new Uint8Array(8), dv = new DataView(msg.buffer);
  dv.setUint32(0, Math.floor(counter / 2 ** 32)); dv.setUint32(4, counter >>> 0);
  const h = hmacSha1(base32(secret), msg);
  const off = h[19] & 15;
  const code = ((h[off] & 127) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(code % 10 ** digits).padStart(digits, "0");
}
