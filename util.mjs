import fs from 'fs';
import { createGzip, createGunzip, createBrotliCompress, createBrotliDecompress, constants } from 'zlib';
import { createCipheriv, createDecipheriv, pbkdf2, createSecretKey, createHash, randomBytes } from 'crypto';
import seedrandom from 'seedrandom';
export const Channels = { DEBUG: 4, VVERBOSE: 3, VERBOSE: 2, NORMAL: 1, SILENT: 0 };
let _debug = false, _channel = Channels.NORMAL;
const utilSalt = '9cec15573a52086a0266af3b05deabf8503421ca49de1a4625b8e4a585ba7f4d';
export function debug(v) {
  if (v === undefined) { return _debug; }
  _debug = !!v;
};
export function baseConv(n, src, dst, k) {
  let srclen = src.length, dstlen = dst.length, val = 0, m = 1, digit, ret = '';
  let vod = (d, a) => a.indexOf(d);
  let strrep = (a, z) => { let out = ''; for (let i = 0; i < z; i++) { out += a; } return out; };
  while (n.length) {
    digit = n.charAt(n.length-1);
    val += m*vod(digit, src);
    n = n.substr(0, n.length-1);
    m *= srclen;
  }
  while (val >= dstlen) {
    digit = dst.charAt(val%dstlen);
    ret = digit + ret;
    val /= dstlen;
  }
  digit = dst.charAt(val);
  ret = digit + ret;
  if (ret.length < k) { ret = strrep(dst[0], k-ret.length)+ret; }
  return ret;
}
export function decToBin(d) { return baseConv(d.toString(), '0123456789', '01'); }
export function binToDec(b) { return parseInt(baseConv(b, '01', '0123456789')); }
export function hashToDec(h) { return parseInt(baseConv(h, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ', '0123456789')); }
export function decToHash(d) { return baseConv(d.toString(), '0123456789', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 '); }
export function pad(s, l, c) { let o = s; for (let i = s.length; i < l; i++) { o = c+o; } return o; }
export function setChannel(chan) { _channel = chan; }
export function print(chan, s) { if (chan <= _channel) { console.log(s); } }
export function alphaToBits(a) {
  switch (a) {
    case 255: return '000';
    case 220: return '001';
    case 184: return '010';
    case 148: return '011';
    case 112: return '100';
    case 76: return '101';
    case 40: return '110';
    case 0: return '111';
    default: return '000';
  }
}
export function bitsToAlpha(b) {
  switch (b) {
    case '000': return 255;
    case '001': return 220;
    case '010': return 184;
    case '011': return 148;
    case '100': return 112;
    case '101': return 76;
    case '110': return 40;
    case '111': return 0;
    default: return 255;
  }
}
export async function copyf(p, o, m) {
  if (!fs.existsSync('tmp/')) { fs.mkdirSync('tmp'); }
  let s = fs.createReadStream(p),
      out = fs.createWriteStream(/^tmp\//.test(o)?o:`tmp/${o}`);
  if (m) { for (let i = 0, l = m.length; i < l; i++) { s.pipe(m[i]); s = m[i]; } }
  s.pipe(out);
  return new Promise(res => out.once('finish', res));
}
export function gzip(l) { return createGzip({ level: l?l:-1 }); }
export function gunzip() { return createGunzip(); }
export function brotli(l, t) {
  return createBrotliCompress({
    params: {
      [constants.BROTLI_PARAM_QUALITY]: l?l:constants.BROTLI_DEFAULT_QUALITY,
      [constants.BROTLI_PARAM_MODE]: t?constants.BROTLI_MODE_TEXT:constants.BROTLI_MODE_GENERIC
    }
  });
}
export function unbrotli() { return createBrotliDecompress(); }
export function getMD5Key(pw) {
  let hash = createHash('md5');
  hash.update(pw);
  return hash.digest('hex');
}
export async function getCryptKey(pass, salt) {
  let res, rej, p = new Promise((a,b) => { res = a; rej = b; });
  pbkdf2(pass, salt, 100000, 32, 'sha1', (err, key) => {
    if (err) { rej(err); return; }
    res(createSecretKey(key));
  });
  return p;
}
export function generateIV() { return randomBytes(16); }
export function cryptaes256(key, iv) { return createCipheriv('aes-256-cbc', key, iv); }
export function decryptaes256(key, iv) { return createDecipheriv('aes-256-cbc', key, iv); }
export function cryptcamellia256(key, iv) { return createCipheriv('camellia-256-cbc', key, iv); }
export function decryptcamellia256(key, iv) { return createDecipheriv('camellia-256-cbc', key, iv); }
export function cryptaria256(key, iv) { return createCipheriv('aria-256-cbc', key, iv); }
export function decryptaria256(key, iv) { return createDecipheriv('aria-256-cbc', key, iv); }
export function cryptchacha20(key, iv) { return createCipheriv('chacha20', key, iv); }
export function decryptchacha20(key, iv) { return createDecipheriv('chacha20', key, iv); }
export function cryptblowfish(key, iv) { return createCipheriv('bf-cbc', key, iv); }
export function decryptblowfish(key, iv) { return createDecipheriv('bf-cbc', key, iv); }
export async function packString(s, pw, salt) {
  let fmods = [ ], bufs = [], b, st;
  if (pw) {
    let key = await getCryptKey(pw, salt || utilSalt), iv = generateIV();
    b = Buffer.alloc(17);
    b[0] = 1;
    iv.copy(b, 1);
    bufs.push(b);
    fmods.push(cryptaes256(key, iv)); }
  else {
    b = Buffer.alloc(1);
    b[0] = 0;
    bufs.push(b);
  }
  if (fmods.length > 0) {
    b = st = fmods[0];
    for (let i = 1, l = fmods.length; i < l; i++) { b.pipe(fmods[i]); b = fmods[i]; }
    st.write(s, 'utf8');
    st.end();
    for await (const chunk of b) { bufs.push(chunk); }
  } else { bufs.push(Buffer.from(s, 'binary')); }
  return Buffer.concat(bufs);
}
export async function unpackString(s, pw, salt) {
  let fmods = [ ], buf = Buffer.from(s, 'binary'), bufs = [];
  if ((buf[0]) && (!pw)) { throw new Error('Input blob is encrypted but no key provided'); }
  else if ((buf[0]) && (pw)) {
    let key = await getCryptKey(pw, salt || utilSalt), iv = buf.slice(1, 17);
    buf = buf.slice(16);
    fmods.unshift(decryptaes256(key, iv));
  }
  buf = buf.slice(1);
  if (fmods.length > 0) {
    let b = fmods[0], st = b, txt = '';
    for (let i = 1, l = fmods.length; i < l; i++) { b.pipe(fmods[i]); b = fmods[i]; }
    st.write(buf);
    st.end();
    for await (const chunk of b) { txt += chunk; }
    return txt;
  } else { return buf.toString(); }
}
export function uintToVLQ(uint, chkSize) {
  let out = [], i = 0, k, n = uint, s = chkSize-1, mask = (1<<s)-1;
  while (true) {
    k = n & (mask<<(s*i));
    n -= k;
    k = k >> s*i;
    out.push(k);
    if (n == 0) { break; }
    i++;
  }
  out[out.length-1] |= 1<<s;
  return out;
}
export class randr {
  constructor(s) { this._seed = 0; if (s) { this.seed = s; } }
  fgen(v) {
    if (!this._alg) { this._alg = seedrandom(this._seed, { state: true }); }
    return (v||1)*this._alg();
  }
  gen(v) { return Math.floor(this.fgen(v)); }
  get state() { return this._alg.state(); }
  get seed() { return this._seed; }
  set seed(v) {
    if ((typeof v === 'string') || (v instanceof String) ||
        (typeof v === 'number') || (v instanceof Number)) { this._alg = seedrandom(v, { state: true }); this._seed = v; }
    else { this._alg = seedrandom('', { state: v }); this._seed = v; }
  }
}
export function convertSalt(salt, raw) {
  let s = salt;
  if ((raw) && (typeof s !== 'string') && (s.length != 64)) { throw new Error('Salt must be a hex string of length 64'); }
  else if (typeof s === 'string') {
    let hash = createHash('sha256');
    hash.update(s);
    s = hash.digest('hex');
  } else { s = randomBytes(32).toString('hex'); }
  return s;
}
export default { debug, Channels, setChannel, print };
