import fs from 'fs';
import { createGzip, createGunzip, createBrotliCompress, createBrotliDecompress, constants } from 'zlib';
import { createCipheriv, createDecipheriv, pbkdf2, createSecretKey, createHash, randomBytes } from 'crypto';
import { Transform } from 'stream';
import seedrandom from 'seedrandom';
import argon2 from 'argon2';
import consts from './consts.mjs';

export const Channels = { DEBUG: 4, VVERBOSE: 3, VERBOSE: 2, NORMAL: 1, SILENT: 0 };
const utilSalt = '9cec15573a52086a0266af3b05deabf8503421ca49de1a4625b8e4a585ba7f4d';
const fileTypes = { NONE: 0, FILE: 1, BUFFER: 2 };

let _debug = false, _channel = Channels.NORMAL, _log = console.log;

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
    val += m * vod(digit, src);
    n = n.substr(0, n.length-1);
    m *= srclen;
  }
  while (val >= dstlen) {
    digit = dst.charAt(val % dstlen);
    ret = digit + ret;
    val /= dstlen;
  }
  digit = dst.charAt(val);
  ret = digit + ret;
  if (ret.length < k) { ret = strrep(dst[0], k - ret.length) + ret; }
  return ret;
}
export function decToBin(d) { return baseConv(d.toString(), '0123456789', '01'); }
export function binToDec(b) { return parseInt(baseConv(b, '01', '0123456789')); }
export function hashToDec(h) {
  if (typeof h == 'number') { return Math.floor(h); }
  return parseInt(baseConv(h, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ', '0123456789'));
}
export function decToHash(d) { return baseConv(d.toString(), '0123456789', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 '); }
export function pad(s, l, c) { let o = s; for (let i = s.length; i < l; i++) { o = c + o; } return o; }
export function setChannel(chan) { _channel = chan; }
export function print(chan, s) { if (chan <= _channel) { _log(s); } }
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
export class fileReader {
  constructor(p) { this.type = fileTypes.NONE; this.init(p);}
  init(source) {
    if (typeof source === 'string') { this.type = fileTypes.FILE; this.fp = fs.openSync(this.path = source, 'r'); }
    else { this.type = fileTypes.BUFFER; this.buffer = source; this.cursor = 0; }
  }
  get size() { return this.type == fileTypes.FILE ? fs.statSync(this.path).size : this.buffer.length; }
  close() { if ((this.type == fileTypes.FILE) && (this.fd)) { fs.closeSync(this.fd); } }
  async readBytes(n) {
    switch (this.type) {
      case fileTypes.FILE:
        {
          if (!this.fp) { return undefined; }
          let b = Buffer.alloc(n), br;
          br = fs.readSync(this.fp, b, 0, n);
          if (!br) { fs.closeSync(this.fp); this.fp = undefined; return undefined; }
          return { bytesRead: br, buffer: b };
        }
        break;
      case fileTypes.BUFFER:
        {
          if (this.cursor >= this.buffer.length) { return undefined; }
          let b = this.buffer.slice(this.cursor, this.cursor + n);
          this.cursor += n;
          return { bytesRead: b.length, buffer: b };
        }
        break;
      default: throw new Error('Reader not initialized');
    }
  }
}
export class fileWriter {
  constructor(p) { this.type = fileTypes.NONE; this.chunks = []; this.init(p); }
  init(source) {
    if (source === undefined) { this.type = fileTypes.NONE; }
    else if (typeof source === 'string') { this.type = fileTypes.FILE; this.fp = fs.openSync(source, 'w'); }
    else { this.type = fileTypes.BUFFER; }
    this.chunks.length = 0;
  }
  writeBytes(...chunks) {
    if (this.type == fileTypes.NONE) { throw new Error('Writer not initialized'); }
    this.chunks.push(...chunks);
  }
  async commit() {
    let { chunks } = this, ret = undefined;
    switch (this.type) {
      case fileTypes.FILE:
        for (let i = 0, l = chunks.length; i < l; i++) { fs.writeSync(this.fp, chunks[i]); }
        fs.closeSync(this.fp);
        break;
      case fileTypes.BUFFER:
        ret = Buffer.concat(chunks);
        break;
      default: throw new Error('Writer not initialized');
    }
    this.init(undefined);
    return ret;
  }
}
export async function copyf(p, o, m) {
  let input, output, s, res, prom;
  prom = new Promise((r) => { res = r; });
  if (typeof o === 'string') {
    output = fs.createWriteStream(o);
    output.once('finish', () => res(o));
  } else if (o === null) {
    output = new Transform({ transform: (d, enc, cb) => { cb(null, d); } });
    let chunks = [];
    output.on('data', (chk) => { chunks.push(chk); });
    output.once('finish', () => res(Buffer.concat(chunks)));
  }
  if (typeof p === 'string') {
    if (!fs.existsSync('tmp/')) { fs.mkdirSync('tmp'); }
    input = s = fs.createReadStream(p);
  } else { input = s = new Transform({ transform: (d, enc, cb) => { cb(null, d); } }); }
  if (m) { for (let i = 0, l = m.length; i < l; i++) { s.pipe(m[i]); s = m[i]; } }
  s.pipe(output);
  if (typeof p !== 'string') { input.write(p); input.end(); }
  return prom;
}
export function gzip(l) { return createGzip({ level: l ? l : -1 }); }
export function gunzip() { return createGunzip(); }
export function brotli(l, t) {
  return createBrotliCompress({
    params: {
      [constants.BROTLI_PARAM_QUALITY]: l ? l : constants.BROTLI_DEFAULT_QUALITY,
      [constants.BROTLI_PARAM_MODE]: t ? constants.BROTLI_MODE_TEXT : constants.BROTLI_MODE_GENERIC
    }
  });
}
export function unbrotli() { return createBrotliDecompress(); }
export function getMD5Key(pw) {
  let hash = createHash('md5');
  hash.update(pw);
  return hash.digest('hex');
}
export async function getCryptKey(...args) { return getCryptKeyPBKDF2(...args); } // DEPRECATED to be removed in 1.5
export async function getCryptKeyPBKDF2(pass, salt, digest = 'sha1', iterations = 100000) {
  let res, rej, p = new Promise((a,b) => { res = a; rej = b; });
  pbkdf2(pass, salt, iterations, 32, digest, (err, key) => {
    if (err) { rej(err); return; }
    res(createSecretKey(key));
  });
  return p;
}
export async function getCryptKeyArgon2(type, pass, salt, pepper, memoryCost = 2 ** 16 /* 64mb */, timeCost = 50, parallelism = 8) {
  let arr, hash, osalt;
  let ftype = () => {
    switch (type) {
      case consts.KDF_ARGON2I: return argon2.argon2i;
      case consts.KDF_ARGON2D: return argon2.argon2d;
      case consts.KDF_ARGON2ID: return argon2.argon2id;
    }
  };
  hash = await argon2.hash(pass, {
    type: ftype(),
    memoryCost,
    hashLength: 32,
    timeCost,
    parallelism,
    salt,
    secret: pepper
  });
  arr = hash.split('$');
  osalt = Buffer.from(arr[4], 'base64');
  hash = Buffer.from(arr[5], 'base64');
  return { hash, salt: osalt };
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
  let fmods = [], buf = Buffer.from(s, 'binary'), bufs = [];
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
  let out = [], i = 0, k, n = uint, s = chkSize - 1, mask = (1 << s) - 1;
  while (true) {
    k = n & (mask << (s * i));
    n -= k;
    k = k >> s * i;
    out.push(k);
    if (n == 0) { break; }
    i++;
  }
  out[out.length - 1] |= 1 << s;
  return out;
}
export class randr {
  constructor(s) { this._seed = 0; if (s) { this.seed = s; } }
  fgen(v) {
    if (!this._alg) { this._alg = seedrandom(this._seed, { state: true }); }
    return (v || 1) * this._alg();
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
function shuffleOrder(rand, len) {
  let out = new Array(len), n = len, i = 0;
  while (n) { let x = rand.gen(n--); out[i++] = [ n, x ]; }
  return out;
}
export function bitShuffle(rand, bits) {
  let arr = bits.split(''), order = shuffleOrder(rand, bits.length);
  for (let i = 0, l = order.length; i < l; i++) {
    let [ left, right ] = order[i];
    let t = arr[left];
    arr[left] = arr[right];
    arr[right] = t;
  }
  return arr.join('');
}
export function bitUnshuffle(rand, bits) {
  let arr = bits.split(''), order = shuffleOrder(rand, bits.length);
  for (let i = order.length - 1; i >= 0; i--) {
    let [ left, right ] = order[i];
    let t = arr[left];
    arr[left] = arr[right];
    arr[right] = t;
  }
  return arr.join('');
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
export default { debug, Channels, setChannel, print, get printFunc() { return _log; }, set printFunc(f) { _log = f; } };
