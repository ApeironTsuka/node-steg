import fs from 'fs';
import { createGzip, createGunzip, createBrotliCompress, createBrotliDecompress, constants } from 'zlib';
import { createCipheriv, createDecipheriv, pbkdf2, createSecretKey, createHash, randomBytes } from 'crypto';
import seedrandom from 'seedrandom';
export const Channels = { DEBUG: 4, VVERBOSE: 3, VERBOSE: 2, NORMAL: 1, SILENT: 0 };
let _debug = false, _channel = Channels.NORMAL;
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
export default { debug, Channels, setChannel, print };
