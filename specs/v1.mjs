import fs from 'fs';
import { basename, dirname, normalize, join as pathJoin } from 'path';
import { Image } from '../image.mjs';
import { Builder as _Builder } from '../builder.mjs';
import consts from '../consts.mjs';
import { pad, randr,
         decToBin, binToDec,
         hashToDec,
         alphaToBits, bitsToAlpha,
         gzip, gunzip,
         brotli, unbrotli,
         getCryptKey, getMD5Key, generateIV,
         cryptaes256, decryptaes256,
         cryptcamellia256, decryptcamellia256,
         cryptaria256, decryptaria256,
         cryptchacha20, decryptchacha20,
         cryptblowfish, decryptblowfish,
         packString, unpackString,
         copyf, convertSalt,
         print, Channels, debug
       } from '../util.mjs';
import { Steg, StegFile, StegPartialFile, StegText } from '../stubs.mjs';
const VERSION_MAJOR = 1, VERSION_MINOR = 2;
const CRYPT_SALT = {
  v11: '546ac12e6786afb81045a6401a0e0342cb341b450cfc06f87e081b7ec4cae6a7',
  v12: '192f8633473d2a6e8a35e886d3f5c29bdf807bab22c73630efb54cc11d9aed23',
  v13: 'cbd55f4182df039b40b20473528f2a658a102d20b87eedfe5b82f13dc414fe03'
};
function getSalt(a,b,h) {
  switch (a) { case 1: break; default: throw new Error(`Unknown major verion ${a}`); }
  if ((b >= 2) && (h)) { return h; }
  switch (b) {
    case 1: return CRYPT_SALT.v11;
    case 2: return CRYPT_SALT.v12;
    case 3: return CRYPT_SALT.v13;
    default: throw new Error(`Unknown minor version ${b}`);
  }
}
function fixMode(m) {
  if (((m&consts.MODE_32BPP) == consts.MODE_32BPP) ||
      ((m&consts.MODE_A32BPP) == consts.MODE_A32BPP)) { return consts.MODE_A32BPP|consts.MODE_32BPP; }
  return m;
}
export class v1 extends Steg {
  get #VERSION_MAJOR() { return VERSION_MAJOR; }
  get #VERSION_MINOR() { return VERSION_MINOR; }
  async #requestPassword() {
    if (!this.pwcb) { throw new Error('No callback registered for handling passwords'); }
    return await this.pwcb();
  }
  async save(input) {
    let img = this.img = new Image(), headmode = input.headmode||consts.HEADMODE, headmodeMask = input.headmodeMask||consts.HEADMODEMASK, { mode, modeMask, secs, dryrun, dryrunComp, rand, x = 0, y = 0, salt, maps, bufferMap } = input, verMajor = input.verMajor||this.#VERSION_MAJOR, verMinor = input.verMinor||this.#VERSION_MINOR;
    if (verMajor != this.#VERSION_MAJOR) { throw new Error(`Trying to build a version ${verMajor}.x with a ${this.#VERSION_MAJOR}.x constructor`); }
    switch (verMinor) {
      case 0: case 1: case 2: case 3: break;
      default: throw new Error(`Trying to build an unsupported version ${verMajor}.${verMinor}`);
    }
    this.verMajor = verMajor;
    this.verMinor = verMinor;
    this.dryrun = dryrun;
    this.dryrunComp = dryrunComp;
    this.salt = salt;
    this.bufferMap = bufferMap || {};
    if (dryrun) { print(Channels.NORMAL, 'DOING A DRY RUN! No changes to any images will be saved.'); if (!dryrunComp) { print(Channels.NORMAL, 'No files will be created or modified.'); } }
    headmode = fixMode(headmode);
    mode = fixMode(mode);
    print(Channels.VERBOSE, `Packing version ${verMajor}.${verMinor}...`);
    {
      let { path, buffer, name, map, frame } = input.in, mapPath, mapName, mapBuffer;
      if (map) {
        mapPath = typeof map == 'string' ? map : map.path;
        mapName = map.name;
        mapBuffer = bufferMap ? bufferMap[map.name] : undefined;
        map = { path: mapPath, name: mapName, buffer: mapBuffer };
      }
      if (typeof input.in == 'string') { path = input.in; }
      if ((bufferMap) && (bufferMap[name])) { buffer = bufferMap[name]; }
      await img.load({ path, buffer, name, map, frame });
    }
    if (verMinor >= 2) { // remove for 1.4.0
      let p = input.in.path || input.in;
      if (typeof p == 'string') {
        let bn = basename(p);
        if ((maps) && (maps[bn])) { img.loadMap(maps[bn]); }
        this.maps = maps;
      }
    } else {
      if (x !== 0) { x = 0; }
      if (y !== 0) { y = 0; }
    }
    img.master = this.master = img;
    this.master.modeMask = this.modeMask = headmodeMask;
    img.writing = true;
    if (rand) { img.rand.seed = hashToDec(rand); img.resetCursor(); }
    else {
      img.setCursor(x, y);
      if (img.used[`${img.cursor.x},${img.cursor.y}`]) { img.advanceCursor(); }
    }
    this.mode = mode;
    if ((headmodeMask&0b111 == 0) && (headmode&consts.MODE_32BPP != consts.MODE_32BPP)) { throw new Error('Cannot use mode mask 000 unless mode 32BPP is active (header)'); }
    img.setMode(headmode);
    img.setModeMask(headmodeMask);
    print(Channels.VERBOSE, 'Setting version...');
    img.writeInt(verMajor, 6);
    img.writeInt(verMinor, 6);
    print(Channels.VERBOSE, 'Setting mode...');
    img.writeInt(mode, 6);
    if ((headmodeMask&0b111 == 0) && (mode&consts.MODE_32BPP != consts.MODE_32BPP)) { throw new Error('Cannot use mode mask 000 unless mode 32BPP is active (global)'); }
    img.setMode(mode);
    print(Channels.VERBOSE, 'Setting settings...');
    this.alphaThresh = img.alphaThresh = bitsToAlpha(alphaToBits(input.alpha));
    switch (verMinor) {
      case 0: img.writeBits(alphaToBits(this.alphaThresh)+'00000000000'); break;
      case 1: case 2: img.writeBits(alphaToBits(this.alphaThresh)+pad(decToBin(modeMask), 3, '0')+'00000000'); break;
      case 3: default: img.writeBits(alphaToBits(this.alphaThresh)+pad(decToBin(modeMask), 3, '0')); break;
    }
    if (headmodeMask != modeMask) { img.flush(); }
    this.master.modeMask = this.modeMask = modeMask;
    img.setModeMask(modeMask);
    print(Channels.VERBOSE, `Setting sec count (${secs.length})...`);
    if (verMinor >= 2) { img.writeVLQ(secs.length, 4); }
    else { img.writeInt(secs.length, 9); }
    print(Channels.VERBOSE, 'Saving secs...');
    this.fullTable = {};
    for (let i = 0, l = secs.length; i < l; i++) {
      if (!await this.#packSec(secs[i])) { throw new Error(`Unknown sec id ${sec.id}`); }
    }
    let ret = await this.#saveImages(input.out);
    print(Channels.NORMAL, `Number of pixels changed in ${input.out.path||input.out.name||input.out}: ${img.used.count} of ${img.width*img.height} (${Math.floor(img.used.count/(img.width*img.height)*10000)/100}%)`);
    if (!input.keep) { // remove for 1.4.0
      delete this.table;
      delete this.fullTable;
    }
    return ret;
  }
  async load(input) {
    let img = this.img = new Image(), headmode = input.headmode||consts.HEADMODE, headmodeMask = input.headmodeMask||consts.HEADMODEMASK, { in: image, rand, modeMask, x, y, salt, maps, bufferMap } = input, v, verMajor, verMinor, mode, secCount, ret;
    let usingInitPos = x !== undefined || y !== undefined;
    x = x !== undefined ? x : 0; y = y !== undefined ? y : 0;
    this._files = [];
    this._partialFiles = [];
    this._texts = [];
    this.fullTable = {};
    this.bufferMap = bufferMap || {};
    {
      let { path, buffer, name, map, frame } = image, mapPath, mapName, mapBuffer;
      if (map) {
        mapPath = typeof map == 'string' ? map : map.path;
        mapName = map.name;
        mapBuffer = bufferMap ? bufferMap[map.name] : undefined;
        map = { path: mapPath, name: mapName, buffer: mapBuffer };
      }
      if (typeof image == 'string') { path = image; }
      if ((bufferMap) && (bufferMap[name])) { buffer = bufferMap[name]; }
      await img.load({ path, buffer, name, map, frame });
    }
    if (!img.check()) { throw new Error(`Error loading ${image}: Not lossless`); }
    if (maps) { let bn = basename(image); if (maps[bn]) { img.loadMap(maps[bn]); } } // remove for 1.4.0
    img.master = this.master = img;
    this.master.modeMask = this.modeMask = headmodeMask;
    img.state.pws = input.pws || [];
    if (rand) { img.rand.seed = hashToDec(rand); img.resetCursor(); }
    else {
      img.setCursor(x, y);
      if (img.used[`${img.cursor.x},${img.cursor.y}`]) { img.advanceCursor(); }
    }
    headmode = fixMode(headmode);
    if ((headmodeMask&0b111 == 0) && (headmode&consts.MODE_32BPP != consts.MODE_32BPP)) { throw new Error('Cannot use mode mask 000 unless mode 32BPP is active (header)'); }
    img.setMode(headmode);
    img.setModeMask(headmodeMask);
    print(Channels.VERBOSE, 'Unpacking...\nReading version...');
    verMajor = img.readInt(6);
    switch (verMajor) {
      case this.#VERSION_MAJOR: break;
      default: throw new Error(`Trying to extract version ${verMajor}.x with ${this.#VERSION_MAJOR}.x`);
    }
    verMinor = img.readInt(6);
    switch (verMinor) {
      case 0: case 1: case 2: case 3: break;
      default: throw new Error(`Unsupported version ${verMajor}.${verMinor}`);
    }
    print(Channels.VVERBOSE, `Got version ${verMajor}.${verMinor}`);
    if (verMinor == 1) {
      if (map) { print(Channels.NORMAL, 'Warning: Version 1.1 found but `map` is in use, which is a 1.2 feature'); }
      if (usingInitPos) { print(Channels.NORMAL, 'Warning: Version 1.1 found but initial cursor is in use'); }
    }
    this.verMajor = verMajor;
    this.verMinor = verMinor;
    if (verMinor >= 2) { this.salt = salt; }
    print(Channels.VERBOSE, 'Reading mode...');
    mode = this.mode = img.readInt(6);
    print(Channels.VVERBOSE, `Got mode ${mode}`);
    if ((headmodeMask&0b111 == 0) && (mode&consts.MODE_32BPP != consts.MODE_32BPP)) { throw new Error('Cannot use mode mask 000 unless mode 32BPP is active (global)'); }
    img.setMode(mode);
    print(Channels.VERBOSE, 'Reading settings...');
    switch (verMinor) {
      case 0:
        v = img.readBits(14);
        if (v.substr(3) != '00000000000') { throw new Error(`Reserved settings space expected to be empty, but got ${v.substr(3)}. Is this a valid Steg image?`); }
        this.alphaThresh = img.alphaThresh = bitsToAlpha(v.substr(0, 3));
        print(Channels.VVERBOSE, `Got settings: threshhold ${this.alphaThresh}`);
        break;
      case 1: case 2:
        v = img.readBits(14);
        if (v.substr(6) != '00000000') { throw new Error(`Reserved settings space expected to be empty, but got ${v.substr(6)}. Is this a valid Steg image?`); }
        this.alphaThresh = img.alphaThresh = bitsToAlpha(v.substr(0, 3));
        this.master.modeMask = this.modeMask = binToDec(v.substr(3, 3));
        print(Channels.VVERBOSE, `Got settings: threshhold ${this.alphaThresh}, mode mask ${this.modeMask}`);
        break;
      case 3: default:
        v = img.readBits(6);
        this.alphaThresh = img.alphaThresh = bitsToAlpha(v.substr(0, 3));
        this.master.modeMask = this.modeMask = binToDec(v.substr(3, 3));
        print(Channels.VVERBOSE, `Got settings: threshhold ${this.alphaThresh}, mode mask ${this.modeMask}`);
        break;
    }
    img.setModeMask(this.modeMask);
    if (headmodeMask != this.modeMask) { img.clear(); }
    print(Channels.VERBOSE, 'Reading sec count...');
    if (verMinor >= 2) { secCount = img.readVLQ(4); }
    else { secCount = img.readBits(9); }
    print(Channels.VVERBOSE, `Got count ${secCount}`);
    for (let i = 0; i < secCount; i++) {
      ret = await this.#readSec();
      if (!ret.v) { throw new Error(`Unknown sec id ${ret.secId}`); }
    }
    return [ ...this._files, ...this._partialFiles, ...this._texts ];
  }
  async #switchImage(index) {
    if (!this.table) { return false; }
    if ((index < 0) || (index >= this.table.length)) { return false; }
    if (index == this.imageIndex) { return false; }
    let i = this.table[index];
    if (!i.img.loaded) {
      let input = i.input || { name: i.name, path: i.path }, p = input.path || input.name || input, mapIn = i.mapIn;
      if (this.bufferMap[input.name]) { i.buffer = this.bufferMap[input.name]; }
      if ((this.verMinor >= 2) && (mapIn) && (this.bufferMap[mapIn.name || mapIn])) { mapIn = { name: mapIn.name || mapIn, buffer: this.bufferMap[mapIn.name || mapIn] }; }
      await i.img.load({ path: i.buffer ? undefined : p, buffer: i.buffer, name: basename(p), map: mapIn, frame: i.frame });
      if ((!this.master.writing) && (!i.img.check())) { throw new Error(`Error loading ${i.name}: Not lossless`); }
      if ((this.verMinor >= 2) && (this.maps) && (this.maps[input.name])) { i.img.loadMap(this.maps[input.name]); } // remove for 1.4.0
    }
    print(Channels.VERBOSE, `Switching to ${i.name}${i.frame?' frame '+i.frame:''}...`);
    if (this.img == i.img) { return false; }
    if (this.master.writing) { this.img.flush(); }
    else { this.img.clear(); }
    this.img = i.img;
    this.img.alphaThresh = this.alphaThresh;
    this.img.rand = this.master.rand;
    this.img.mode = this.master.state.mode || this.mode;
    this.img.modeMask = this.master.modeMask;
    this.imageIndex = index;
    return true;
  }
  async #saveImages(o) {
    let out = [], outmap = {}, img, t;
    let f = async ({ path, map: _map, mapOut, buffer, name, frame }, img, o = undefined) => {
      let map = mapOut || _map, mapPath, mapName, mapBuffer;
      let s = typeof o === 'string' ? { path: o } : { img, path, mapOut: map, buffer, name, frame };
      img.flush();
      await img.save(s);
      if (typeof o === 'string') { out.push({ path: o, img }); }
      else if (!outmap[path || name || o]) {
        if (map) {
          mapPath = typeof map == 'string' ? map : map.path;
          mapName = map.name;
          mapBuffer = map.buffer ? img.mapBuffer : undefined;
        }
        out.push({ path, map: { path: mapPath, name: mapName, buffer: mapBuffer }, buffer: img.buffer, name, frame });
        outmap[path || name || o] = true;
      }
    };
    if (!this.dryrun) { await f(o, this.master, o); }
    for (let i = 0, { fullTable } = this, keys = Object.keys(fullTable), l = keys.length; i < l; i++) {
      t = fullTable[keys[i]];
      img = t.img;
      if (!img.loaded) { continue; }
      if (img.master == img) { if (t.mapOut) { img.saveMap(typeof t.mapOut == 'string' ? { path: t.mapOut } : t.mapOut); } continue; }
      if (!this.dryrun) { await f(t, img); }
      print(Channels.NORMAL, `Number of pixels changed in ${t.name}: ${img.used.count} of ${img.width * img.height} (${Math.floor(img.used.count / (img.width * img.height) * 10000) / 100}%)`);
    }
    return out;
  }
  #prepFilePack(comp, crypt, text) {
    let { master } = this, fmods = []
    if ((comp) && (master.state.compress) && (master.state.compress.type)) {
      print(Channels.VERBOSE, `Need to compress ${text?'text':'file'}...`);
      let com = master.state.compress;
      switch (com.type) {
        case consts.COMP_GZIP: fmods.push(gzip(com.level)); break;
        case consts.COMP_BROTLI: fmods.push(brotli(com.level, com.text)); break;
        default: print(Channels.VERBOSE, 'Unknown or no compression type chosen, ignoring...'); break;
      }
    }
    if ((crypt) && (master.state.encrypt) && (master.state.encrypt.type)) {
      print(Channels.VERBOSE, `Need to encrypt ${text?'text':'file'}...`);
      let enc = master.state.encrypt;
      switch (enc.type) {
        case consts.CRYPT_AES256: fmods.push(cryptaes256(enc.key, enc.iv)); break;
        case consts.CRYPT_CAMELLIA256: fmods.push(cryptcamellia256(enc.key, enc.iv)); break;
        case consts.CRYPT_ARIA256: fmods.push(cryptaria256(enc.key, enc.iv)); break;
        case consts.CRYPT_CHACHA20: fmods.push(cryptchacha20(enc.key, enc.iv)); break;
        case consts.CRYPT_BLOWFISH: fmods.push(cryptblowfish(enc.key, enc.iv)); break;
        default: print(Channels.VERBOSE, 'Unknown or no encryption type chosen, ignoring...'); break;
      }
    }
    return fmods;
  }
  #prepFileUnpack(comp, crypt, text) {
    let { master } = this, fmods = [];
    if ((crypt) && (master.state.encrypt) && (master.state.encrypt.type)) {
      print(Channels.VERBOSE, `Need to decrypt ${text?'text':'file'}...`);
      let enc = master.state.encrypt;
      switch (enc.type) {
        case consts.CRYPT_AES256: fmods.push(decryptaes256(enc.key, enc.iv)); break;
        case consts.CRYPT_CAMELLIA256: fmods.push(decryptcamellia256(enc.key, enc.iv)); break;
        case consts.CRYPT_ARIA256: fmods.push(decryptaria256(enc.key, enc.iv)); break;
        case consts.CRYPT_CHACHA20: fmods.push(decryptchacha20(enc.key, enc.iv)); break;
        case consts.CRYPT_BLOWFISH: fmods.push(decryptblowfish(enc.key, enc.iv)); break;
        default: print(Channels.VERBOSE, 'Unknown encryption type specified, doing nothing...'); break;
      }
    }
    if ((comp) && (master.state.compress) && (master.state.compress.type)) {
      print(Channels.VERBOSE, `Need to decompress ${text?'text':'file'}...`);
      let com = master.state.compress;
      switch (com.type) {
        case consts.COMP_GZIP: fmods.push(gunzip()); break;
        case consts.COMP_BROTLI: fmods.push(unbrotli()); break;
        default: print(Channels.VERBOSE, 'Unknown compression type specified, doing nothing...'); break;
      }
    }
    return fmods;
  }
  #saveState(o) {
    let { img, master } = this, used = {};
    o.img = img;
    o.master = master;
    o.buf = img.buf;
    o.cursor = { x: img.cursor.x, y: img.cursor.y };
    o.rand = img.state.rand ? img.state.rand.state : master.rand.seed != -1 ? master.rand.state : undefined;
    o.rect = img.state.rect;
    o.enc = master.state.encrypt;
    o.com = master.state.compress;
    o.mode = master.state.mode || this.mode;
    o.alpha = img.alphaThresh;
    for (let i = 0, u = img.used, keys = Object.keys(u), l = keys.length; i < l; i++) { used[keys[i]] = u[keys[i]]; }
    o.used = used;
  }
  #loadState(state) {
    let { img, master } = state;
    print(Channels.VERBOSE, 'Loading state...');
    img.master = master;
    img.buf = state.buf;
    img.cursor = state.cursor;
    master.rand.seed = -1;
    img.state.rand = state.rand ? new randr(state.rand) : undefined;
    img.state.rect = state.rect;
    master.state.encrypt = state.enc;
    master.state.compress = state.com;
    img.mode = master.state.mode = state.mode;
    img.alphaThresh = state.alpha;
    img.used = state.used;
  }
  async #packSec(sec) {
    let { img } = this;
    print(Channels.VERBOSE, 'Saving sec id...');
    img.writeInt(sec.id | (sec.rem ? 1 << 8 : 0), 9);
    switch (sec.id) {
      case consts.SEC_FILE: await this.#packSecFile(sec); break;
      case consts.SEC_RAND: await this.#packSecRand(sec); break;
      case consts.SEC_IMAGETABLE: await this.#packSecTable(sec); break;
      case consts.SEC_RECT: await this.#packSecRect(sec); break;
      case consts.SEC_CURSOR: await this.#packSecCursor(sec); break;
      case consts.SEC_COMPRESSION: await this.#packSecCompression(sec); break;
      case consts.SEC_ENCRYPTION: await this.#packSecEncryption(sec); break;
      case consts.SEC_PARTIALFILE: await this.#packSecPartialFile(sec); break;
      case consts.SEC_PARTIALFILEPIECE: await this.#packSecPartialFilePiece(sec); break;
      case consts.SEC_MODE: await this.#packSecMode(sec); break;
      case consts.SEC_ALPHA: await this.#packSecAlpha(sec); break;
      case consts.SEC_TEXT: await this.#packSecText(sec); break;
      case consts.SEC_MODEMASK: if (this.verMinor < 1) { return false; } await this.#packSecModeMask(sec); break;
      default: return false;
    }
    return true;
  }
  async #packSecFile(sec) {
    let { img } = this, p = sec.path, s;
    if ((!this.dryrun) || (this.dryrunComp)) {
      let fmods = this.#prepFilePack(!sec.compressed, true);
      if (fmods.length) { await copyf(p, p = 'tmp/tmp', fmods); }
    }
    sec.len = fs.statSync(p).size;
    print(Channels.VERBOSE, `Packing SEC_FILE...\nPacking length (${sec.len})...`);
    if (this.verMinor >= 2) { img.writeVLQ(sec.len, 8); }
    else { img.writeInt(sec.len, 24); }
    print(Channels.VERBOSE, 'Packing file name...');
    img.writeString(sec.newName||basename(sec.path));
    print(Channels.VERBOSE, 'Packing file...');
    if (this.dryrun) {
      if (!this.dryrunComp) {
        if ((sec.compressed) || (this.master.state.compress)) { print(Channels.NORMAL, `Warning: Compression is active on file "${p}" during a dry-run. Using uncompressed size. Dry-run may fail when it otherwise would not as compressed size is unpredictable.`); }
      }
      s = sec.len;
      while (s > 0) { img.writeBits('00000000'); s--; }
    } else {
      let k = Buffer.alloc(1024), fd, r;
      fd = fs.openSync(p, 'r');
      if (!debug()) { print(Channels.VERBOSE, 'Processing...'); }
      while (r = fs.readSync(fd, k, 0, 900)) {
        s = '';
        for (let i = 0; i < r; i++) { s += pad(decToBin(k[i]), 8, '0'); }
        img.writeBits(s);
      }
      fs.closeSync(fd);
    }
    if (fs.existsSync('tmp/tmp')) { fs.unlinkSync('tmp/tmp'); }
  }
  async #packSecRand(sec) {
    let { img } = this, s;
    if (sec.rem) { print(Channels.VERBOSE, 'Clearing SEC_RAND...'); delete img.state.rand; return; }
    print(Channels.VERBOSE, 'Packing SEC_RAND...\nPacking seed...');
    s = pad(decToBin(hashToDec(sec.seed)).substr(0, 32), 32, '0');
    img.writeBits(s);
    img.flush();
    if (!img.state.rand) { img.state.rand = new randr(); }
    img.state.rand.seed = binToDec(s);
  }
  async #packSecTable(sec) {
    let { img, fullTable } = this, table = this.table = [], z, bn, bnk, p;
    if (sec.rem) {
      print(Channels.VERBOSE, 'Clearing SEC_IMAGETABLE...');
      await this.#saveImages();
      delete this.table;
      this.img = this.master;
      this.img.resetCursor();
      return;
    }
    print(Channels.VERBOSE, 'Packing SEC_IMAGETABLE...\nPacking file count...');
    switch (this.verMinor) {
      case 0: img.writeInt(sec.out.length, 8); break;
      case 1: img.writeInt(sec.out.length, 16); break;
      case 2: default: img.writeVLQ(sec.out.length, 4); break;
    }
    print(Channels.VERBOSE, 'Packing file table...');
    for (let i = 0, files = sec.out, l = files.length; i < l; i++) {
      let fname = files[i], fnamebn = basename(fname.path || fname.name || fname);
      p = sec.in[i];
      if (this.verMinor < 3) {
        if (/^frame\|[0-9]*\|/i.test(p)) {
          let arr = p.split('|');
          p = p.substr(arr[1].length+7);
          bn = `frame|${parseInt(arr[1])}|${basename(p)}`;
        } else { bn = basename(p); }
        if (/^frame\|[0-9]*\|/i.test(fname)) {
          let arr = fname.split('|');
          fname = fname.substr(arr[1].length+7);
          fnamebn = `frame|${parseInt(arr[1])}|${basename(fname)}`;
        }
        img.writeString(fnamebn);
        if (fullTable[bn]) { table.push(fullTable[bn]); continue; }
        table.push(z = fullTable[bn] = { path: fname, name: fnamebn, input: p.path || p });
        if (basename(img.src) == bn) { z.img = img; }
        else if (`frame|${img.frame}|${basename(img.src)}` == bn) { z.img = img; }
        else if (basename(this.master.src) == bn) { z.img = this.master; }
        else if (`frame|${this.master.frame}|${basename(this.master.src)}` == bn) { z.img = this.master; }
        else { z.img = new Image(); z.img.master = this.master; }
      } else {
        let hasFrame = typeof fname.frame !== 'undefined', hasMap = typeof p.map !== 'undefined';
        img.writeInt(hasFrame ? 1 : 0, 1);
        img.writeInt(hasMap ? 1 : 0, 1);
        if (hasFrame) { img.writeVLQ(fname.frame, 4); }
        if (hasMap) { img.writeString(typeof p.map == 'string' ? basename(p.map) : p.map.name || basename(p.map.path)); }
        img.writeString(fnamebn);
        bn = p.name || basename(p.path||p);
        bnk = bn+(hasFrame ? `-${fname.frame}` : '');
        if (fullTable[bnk]) { table.push(fullTable[bnk]); continue; }
        table.push(z = fullTable[bnk] = {
          path: fname.path,
          buffer: fname.buffer,
          name: fnamebn,
          frame: fname.frame,
          mapIn: p.map,
          mapOut: fname.map,
          input: p.path || p
        });
        if ((hasFrame) && (basename(img.src) == bn) && (img.frame == fname.frame)) { z.img = img; }
        else if ((!hasFrame) && (basename(img.src) == bn)) { z.img = img; }
        else if ((hasFrame) && (basename(this.master.src) == bn) && (this.master.frame == fname.frame)) { z.img = this.master; }
        else if ((!hasFrame) && (basename(this.master.src) == bn)) { z.img = this.master; }
        else { z.img = new Image(); z.img.master = this.master; }
      }
    }
  }
  async #packSecRect(sec) {
    let { img } = this;
    if (sec.rem) { print(Channels.VERBOSE, 'Clearing SEC_RECT...'); delete img.state.rect; return; }
    print(Channels.VERBOSE, 'Packing SEC_RECT...\nPacking x, y, w, h...');
    if (this.verMinor >= 2) {
      img.writeVLQ(sec.x, 8);
      img.writeVLQ(sec.y, 8);
      img.writeVLQ(sec.w, 8);
      img.writeVLQ(sec.h, 8);
    } else {
      img.writeInt(sec.x, 16);
      img.writeInt(sec.y, 16);
      img.writeInt(sec.w, 16);
      img.writeInt(sec.h, 16);
    }
    img.flush();
    img.state.rect = { x: sec.x, y: sec.y, w: sec.w, h: sec.h, max: sec.w*sec.h };
    img.resetCursor(true);
  }
  async #packSecCursor(sec) {
    let { img, master } = this, s, { cursorStack } = master.state;
    print(Channels.VERBOSE, 'Packing SEC_CURSOR...\nPacking command...');
    if (!cursorStack) { master.state.cursorStack = cursorStack = []; }
    if ((sec.command == consts.CURSOR_CMD_MOVE) && ((img.state.rand) || (master.rand.seed != -1))) { sec.command = consts.CURSOR_CMD_MOVEIMG; }
    img.writeInt(sec.command, 3);
    switch (sec.command) {
      case consts.CURSOR_CMD_PUSH: cursorStack.push([ this.imageIndex, img.cursor.x, img.cursor.y ]); break;
      case consts.CURSOR_CMD_POP:
        if (cursorStack.length == 0) { throw new Error('Empty cursor stack while trying to pop'); }
        s = cursorStack.pop();
        img.flush();
        await this.#switchImage(s[0]);
        img = this.img;
        img.cursor.x = s[1];
        img.cursor.y = s[2];
        img.advanceCursor();
        break;
      case consts.CURSOR_CMD_MOVE:
        print(Channels.VERBOSE, 'Packing index...');
        switch (this.verMinor) {
          case 0: img.writeInt(sec.index, 8); break;
          case 1: img.writeInt(sec.index, 16); break;
          case 2: default: img.writeVLQ(sec.index, 4); break;
        }
        print(Channels.VERBOSE, 'Packing x, y...');
        if (this.verMinor >= 2) {
          img.writeVLQ(sec.x, 8);
          img.writeVLQ(sec.y, 8);
        } else {
          img.writeInt(sec.x, 16);
          img.writeInt(sec.y, 16);
        }
        img.flush();
        await this.#switchImage(sec.index);
        img = this.img;
        if (img.state.rect) {
          let { rect } = img.state, { x, y } = sec;
          x += rect.x;
          y += rect.y;
          if ((x < rect.x) || (x >= rect.x+rect.w) ||
              (y < rect.y) || (y >= rect.y+rect.h)) { throw new Error('SEC_CURSOR movement out of SEC_RECT bounds'); }
          img.cursor.x = x;
          img.cursor.y = y;
        } else {
          img.cursor.x = sec.x;
          img.cursor.y = sec.y;
        }
        break;
      case consts.CURSOR_CMD_MOVEIMG:
        print(Channels.VERBOSE, 'Packing index...');
        switch (this.verMinor) {
          case 0: img.writeInt(sec.index, 8); break;
          case 1: img.writeInt(sec.index, 16); break;
          case 2: default: img.writeVLQ(sec.index, 4); break;
        }
        await this.#switchImage(sec.index);
        this.img.resetCursor();
        break;
      default: throw new Error(`Unknown SEC_CURSOR command ${sec.command}`);
    }
  }
  async #packSecCompression(sec) {
    let { img, master } = this, com = {};
    if (sec.rem) { print(Channels.VERBOSE, 'Clearing SEC_COMPRESSION...'); delete master.state.compress; return; }
    print(Channels.VERBOSE, 'Packing SEC_COMPRESSION...\nPacking type...');
    com.type = sec.type;
    switch (sec.type) {
      case consts.COMP_GZIP:
        img.writeInt(sec.type, 4);
        print(Channels.VERBOSE, 'Packing level...');
        img.writeInt(com.level = sec.level ? sec.level : 0, 4);
        break;
      case consts.COMP_BROTLI:
        img.writeInt(sec.type, 4);
        print(Channels.VERBOSE, 'Packing level...');
        img.writeInt(com.level = sec.level ? sec.level : 0, 4);
        print(Channels.VERBOSE, 'Packing text flag...');
        img.writeInt(com.text = sec.text ? 1 : 0, 1);
        break;
      default: img.writeInt(consts.COMP_NONE, 4); return;
    }
    master.state.compress = com;
  }
  async #packSecEncryption(sec) {
    let { img, master } = this, enc = {};
    if (sec.rem) { print(Channels.VERBOSE, 'Clearing SEC_ENCRYPTION...'); delete master.state.encrypt; return; }
    print(Channels.VERBOSE, 'Packing SEC_ENCRYPTION...');
    enc.type = sec.type;
    switch (sec.type) {
      case consts.CRYPT_CAMELLIA256:
      case consts.CRYPT_ARIA256:
        if (this.verMinor < 2) { img.writeInt(consts.CRYPT_NONE, 4); return; }
        break;
      case consts.CRYPT_CHACHA20:
      case consts.CRYPT_BLOWFISH:
        if (this.verMinor < 3) { img.writeInt(consts.CRYPT_NONE, 4); return; }
        break;
      case consts.CRYPT_AES256: break;
    }
    if (!sec.pw) { sec.pw = await this.#requestPassword(); }
    switch (this.verMinor) {
      case 0: enc.key = getMD5Key(sec.pw); break;
      default: enc.key = await getCryptKey(sec.pw, getSalt(this.verMajor, this.verMinor, this.salt)); break;
    }
    enc.iv = generateIV();
    print(Channels.VERBOSE, 'Packing type...');
    img.writeInt(sec.type, 4);
    print(Channels.VERBOSE, 'Packing IV...');
    for (let i = 0; i < 16; i++) { img.writeInt(enc.iv[i], 8); }
    master.state.encrypt = enc;
  }
  async #packSecPartialFile(sec) {
    let { img, master } = this, table = master.state.partialTable, p = sec.path;
    if (!table) { table = master.state.partialTable = {}; }
    if ((this.dryrun) && (!this.dryrunComp)) {
      if ((sec.compressed) || (this.master.state.compress)) { print(Channels.NORMAL, `Warning: Compression is active on partial file "${p}" during a dry-run. Using uncompressed size. Dry-run may fail when it otherwise would not as compressed size is unpredictable.`); }
    } else {
      let fmods = this.#prepFilePack(!sec.compressed, true);
      if (fmods.length) { await copyf(p, p = `tmp/${sec.index}`, fmods); }
    }
    let f = table[sec.index] = { size: fs.statSync(p).size, fd: fs.openSync(p, 'r'), pieces: 0, written: 0 };
    print(Channels.VERBOSE, `Packing SEC_PARTIALFILE...\nPacking size (${f.size})...`);
    if (this.verMinor >= 2) { img.writeVLQ(f.size, 8); }
    else { img.writeInt(f.size, 24); }
    print(Channels.VERBOSE, 'Packing file name...');
    img.writeString(sec.newName||basename(sec.path));
    print(Channels.VERBOSE, 'Packing file index...');
    if (this.verMinor >= 2) { img.writeVLQ(sec.index, 4); }
    else { img.writeInt(sec.index, 8); }
  }
  async #packSecPartialFilePiece(sec) {
    let { img, master } = this, f = master.state.partialTable[sec.index], w = 0, s;
    if ((!sec.size) || (sec.size > f.size-f.written)) { sec.size = f.size - f.written; sec.last = true; }
    if (f.done) { sec.size = 0; }
    print(Channels.VERBOSE, 'Packing SEC_PARTIALFILEPIECE...\nPacking file index...');
    if (this.verMinor >= 2) { img.writeVLQ(sec.index, 4); }
    else { img.writeInt(sec.index, 8); }
    print(Channels.VERBOSE, 'Packing piece index...');
    if (this.verMinor >= 2) { img.writeVLQ(f.pieces++, 4); }
    else { img.writeInt(f.pieces++, 8); }
    print(Channels.VERBOSE, 'Packing last piece flag...');
    img.writeInt(sec.last || f.done ? 1 : 0, 1);
    print(Channels.VERBOSE, 'Packing piece size...');
    if (this.verMinor >= 2) { img.writeVLQ(sec.size, 8); }
    else { img.writeInt(sec.size, 24); }
    print(Channels.VERBOSE, 'Packing piece...');
    if (sec.size > 0) {
      if (this.dryrun) {
        s = sec.size;
        while (s > 0) { img.writeBits('00000000'); s--; }
        if (sec.last) { f.done = true; if ((this.dryrunComp) && (fs.existsSync(`tmp/${sec.index}`))) { fs.unlinkSync(`tmp/${sec.index}`); } }
      } else {
        let k = Buffer.alloc(1024), v = Math.min(900, sec.size), r;
        if (!debug()) { print(Channels.VERBOSE, 'Processing...'); }
        while (r = fs.readSync(f.fd, k, 0, v)) {
          for (let i = 0; i < r; i++) { s += pad(decToBin(k[i]), 8, '0'); }
          img.writeBits(s);
          w += r;
          f.written += r;
          if (w+v > sec.size) { v = sec.size-w; }
        }
        if (sec.last) {
          fs.closeSync(f.fd);
          f.done = true;
          if (fs.existsSync(`tmp/${sec.index}`)) { fs.unlinkSync(`tmp/${sec.index}`); }
        }
      }
    }
  }
  async #packSecMode(sec) {
    let { img, master, modeMask } = this, m = sec.mode;
    if (sec.rem) {
      print(Channels.VERBOSE, 'Clearing SEC_MODE...');
      delete master.state.mode;
      img.flush();
      img.setMode(this.mode);
      return;
    }
    m = fixMode(m);
    if ((modeMask&0b111 == 0) && (sec.mode&consts.MODE_32BPP != consts.MODE_32BPP)) { throw new Error('Cannot use mode mask 000 unless mode 32BPP is active (sec)'); }
    print(Channels.VERBOSE, 'Packing SEC_MODE...\nPacking mode...');
    img.writeInt(m, 6);
    img.flush();
    img.setMode(master.state.mode = m);
  }
  async #packSecAlpha(sec) {
    let { img } = this, n;
    if (sec.rem) {
      print(Channels.VERBOSE, 'Clearing SEC_ALPHA...');
      img.alphaThresh = this.alphaThresh;
      return;
    }
    print(Channels.VERBOSE, 'Packing SEC_ALPHA...\nPacking threshhold...');
    n = bitsToAlpha(alphaToBits(sec.alpha));
    img.writeBits(pad(alphaToBits(n), 3, '0'));
    img.alphaThresh = n;
  }
  async #packSecText(sec) {
    let { img } = this, { text, honor } = sec, fmods, buf;
    print(Channels.VERBOSE, 'Packing SEC_TEXT...\nPacking honor mask...');
    img.writeInt(honor, 4);
    fmods = this.#prepFilePack(honor & consts.TEXT_HONOR_COMPRESSION, honor & consts.TEXT_HONOR_ENCRYPTION, true)
    if (fmods.length) {
      let b = fmods[0], st = b, bufs = [];
      for (let i = 1, l = fmods.length; i < l; i++) { b.pipe(fmods[i]); b = fmods[i]; }
      if (!debug()) { print(Channels.VERBOSE, 'Processing...'); }
      st.write(text, 'utf8');
      st.end();
      for await (const chunk of b) { bufs.push(chunk); }
      buf = Buffer.concat(bufs);
    } else { buf = Buffer.from(text, 'binary'); }
    print(Channels.VERBOSE, `Packing text length (${buf.length})...`);
    if (this.verMinor >= 2) { img.writeVLQ(buf.length, 8); }
    else { img.writeInt(buf.length, 16); }
    print(Channels.VERBOSE, 'Packing text...');
    for (let i = 0, l = buf.length; i < l; i++) { img.writeInt(buf[i], 8); }
  }
  async #packSecModeMask(sec) {
    let { img, master, mode, modeMask } = this, m;
    if (sec.rem) {
      print(Channels.VERBOSE, 'Clearing SEC_MODEMASK...');
      delete master.state.modeMask;
      img.flush();
      img.setModeMask(modeMask);
      return;
    }
    m = master.state.mode ? master.state.mode : mode;
    if ((sec.mask&0b111 == 0) && (m&consts.MODE_32BPP != consts.MODE_32BPP)) { throw new Error('Cannot use mode mask 000 unless mode 32BPP is active (sec)'); }
    print(Channels.VERBOSE, 'Packing SEC_MODEMASK...\nPacking mask...');
    img.writeInt(sec.mask, 3);
    img.flush();
    img.setModeMask(master.state.modeMask = sec.mask);
  }
  async #readSec() {
    let { img } = this, secId, rem;
    function err(id) { return { v: false, secId: id }; }
    print(Channels.VERBOSE, 'Reading sec id...');
    secId = img.readInt(9);
    print(Channels.VVERBOSE, `Got id ${secId}`);
    print(Channels.VERBOSE, 'Reading sec...');
    rem = secId&(1<<8);
    secId = secId&255;
    switch (secId) {
      case consts.SEC_FILE: await this.#readSecFile(rem); break;
      case consts.SEC_RAND: await this.#readSecRand(rem); break;
      case consts.SEC_IMAGETABLE: await this.#readSecTable(rem); break;
      case consts.SEC_RECT: await this.#readSecRect(rem); break;
      case consts.SEC_CURSOR: await this.#readSecCursor(rem); break;
      case consts.SEC_COMPRESSION: await this.#readSecCompress(rem); break;
      case consts.SEC_ENCRYPTION: await this.#readSecEncrypt(rem); break;
      case consts.SEC_PARTIALFILE: await this.#readSecPartialFile(rem); break;
      case consts.SEC_PARTIALFILEPIECE: await this.#readSecPartialFilePiece(rem); break;
      case consts.SEC_MODE: await this.#readSecMode(rem); break;
      case consts.SEC_ALPHA: await this.#readSecAlpha(rem); break;
      case consts.SEC_TEXT: await this.#readSecText(rem); break;
      case consts.SEC_MODEMASK: if (this.verMinor < 1) { return err(secId); } await this.#readSecModeMask(rem); break;
      default: return err(secId);
    }
    return { v: true };
  }
  async #readSecFile(rem) {
    let { img, master } = this, o = {}, s = 0;
    print(Channels.VERBOSE, 'Reading SEC_FILE...\nReading size...');
    if (this.verMinor >= 2) { o.size = img.readVLQ(8); }
    else { o.size = img.readInt(24); }
    print(Channels.VVERBOSE, `Got size ${o.size}`);
    print(Channels.VERBOSE, 'Reading name...');
    o.name = img.readString();
    print(Channels.VERBOSE, `Got name '${o.name}'`);
    print(Channels.VERBOSE, 'Saving current state...');
    this.#saveState(o);
    print(Channels.VERBOSE, 'Reading past file...');
    while (s < o.size) { img.readBits(8); s++; }
    this._files.push(new v1File(this, o));
  }
  async unpackFile(file, output = './extracted') {
    let { state } = file, { img, size } = state, s = 0, r = Buffer.alloc(1), fd, path, p, fmods;
    this.#loadState(state);
    print(Channels.NORMAL, `Extracting ${file.state.name}...`);
    path = normalize(`${output}/${file.state.name}`).replace(/^\.\.\/(\.\.\/)*/g, '');
    fs.mkdirSync(dirname(path), { recursive: true });
    fd = fs.openSync(path, 'w');
    while (s < size) {
      r[0] = img.readInt(8);
      fs.writeSync(fd, r);
      s++;
      if (!debug()) { process.stdout.write(`\rSaved ${s} of ${size}            `); }
    }
    if (!debug()) { process.stdout.write('\n'); }
    fs.closeSync(fd);
    fmods = this.#prepFileUnpack(!!state.com, !!state.enc);
    if (fmods.length) {
      if (!debug()) { print(Channels.VERBOSE, 'Processing...'); }
      await copyf(path, p = 'tmp/tmp', fmods);
      fs.unlinkSync(path);
      fs.renameSync(p, path);
    }
    state.realSize = fmods.length ? fs.statSync(path).size : size;
    if ((!debug()) && (state.realSize != size)) { print(Channels.NORMAL, `Processed size: ${state.realSize}`); }
  }
  async #readSecRand(rem) {
    let { img, master } = this, seed;
    if (rem) { print(Channels.VERBOSE, 'Clearing SEC_RAND...'); delete img.state.rand; return; }
    print(Channels.VERBOSE, 'Reading SEC_RAND...\nReading seed...');
    seed = img.readInt(32);
    img.clear();
    print(Channels.VVERBOSE, `Got seed ${seed}`);
    if (!img.state.rand) { img.state.rand = new randr(); }
    img.state.rand.seed = seed;
  }
  async #readSecTable(rem) {
    let { img, master, fullTable } = this, table = [], v, vv, z, n;
    if (rem) {
      print(Channels.VERBOSE, 'Clearing SEC_IMAGETABLE...');
      delete this.table;
      this.img = master;
      this.img.resetCursor();
      return;
    }
    print(Channels.VERBOSE, 'Reading SEC_IMAGETABLE...\nReading file count...');
    switch (this.verMinor) {
      case 0: n = img.readInt(8); break;
      case 1: n = img.readInt(16); break;
      case 2: default: n = img.readVLQ(4); break;
    }
    print(Channels.VVERBOSE, `Got count ${n}`);
    print(Channels.VERBOSE, 'Reading file table...');
    for (let i = 0; i < n; i++) {
      if (this.verMinor < 3) {
        v = img.readString();
        vv = v.split('|');
        print(Channels.VERBOSE, `Got ${v}`);
        if (fullTable[v]) { table.push(fullTable[v]); continue; }
        table.push(z = fullTable[v] = { name: v });
        if (v == basename(img.src)) { z.img = img; }
        else if (v == `frame|${img.frame}|${basename(img.src)}`) { z.img = img; }
        else if (v == basename(master.src)) { z.img = master; }
        else if (v == `frame|${master.frame}|${basename(master.src)}`) { z.img = master; }
        else { z.img = new Image(); z.img.master = master; }
        if (v == `frame|${vv[1]}|${basename(img.src)}`) { z.name = `frame|${vv[1]}|${img.src}`; }
        else if (v == `frame|${vv[1]}|${basename(master.src)}`) { z.name = `frame|${vv[1]}|${master.src}`; }
      } else {
        let hasFrame = img.readInt(1), hasMap = img.readInt(1), frame, map, bn;
        if (hasFrame) { frame = img.readVLQ(4); }
        if (hasMap) { map = img.readString(); }
        v = img.readString();
        bn = v+(hasFrame ? `-${frame}` : '');
        print(Channels.VERBOSE, `Got hasFrame ${hasFrame} hasMap ${hasMap}${hasFrame ? ' frame '+frame : ''}${hasMap ? ' map '+map : ''} name ${v}`);
        if (fullTable[bn]) { table.push(fullTable[bn]); continue; }
        table.push(z = fullTable[bn] = { name: v, frame, mapIn: map });
        if ((hasFrame) && (basename(img.src) == v) && (img.frame == frame)) { z.img = img; }
        else if ((!hasFrame) && (basename(img.src) == v)) { z.img = img; }
        else if ((hasFrame) && (basename(master.src) == v) && (master.frame == frame)) { z.img = master; }
        else if ((!hasFrame) && (basename(master.src) == v)) { z.img = master; }
        else { z.img = new Image(); z.img.master = master; }
      }
    }
    this.table = table;
  }
  async #readSecRect(rem) {
    let { img } = this, rect = {};
    if (rem) { print(Channels.VERBOSE, 'Clearing SEC_RECT...'); delete img.state.rect; return; }
    print(Channels.VERBOSE, 'Reading SEC_RECT...\nReading x, y, w, h...');
    if (this.verMinor >= 2) {
      rect.x = img.readVLQ(8);
      rect.y = img.readVLQ(8);
      rect.w = img.readVLQ(8);
      rect.h = img.readVLQ(8);
    } else {
      rect.x = img.readInt(16);
      rect.y = img.readInt(16);
      rect.w = img.readInt(16);
      rect.h = img.readInt(16);
    }
    img.clear();
    print(Channels.VVERBOSE, `Got x, y, w, h of ${rect.x}, ${rect.y}, ${rect.w}, ${rect.h}`);
    img.state.rect = rect;
    img.resetCursor();
  }
  async #readSecCursor(rem) {
    let { img, master } = this, { cursorStack } = master.state, v, cmd, ind, x, y;
    if (!cursorStack) { master.state.cursorStack = cursorStack = []; }
    print(Channels.VERBOSE, 'Reading SEC_CURSOR...\nReading command...');
    cmd = img.readInt(3);
    print(Channels.VVERBOSE, `Got command ${cmd}`);
    switch (cmd) {
      case consts.CURSOR_CMD_PUSH: cursorStack.push([ this.imageIndex, img.cursor.x, img.cursor.y ]); break;
      case consts.CURSOR_CMD_POP:
        if (cursorStack.length == 0) { throw new Error('Empty cursor stack while trying to pop'); }
        v = cursorStack.pop();
        img.clear();
        await this.#switchImage(v[0]);
        img = this.img;
        img.cursor.x = v[1];
        img.cursor.y = v[2];
        img.advanceCursor();
        break;
      case consts.CURSOR_CMD_MOVE:
        print(Channels.VERBOSE, 'Reading index...');
        switch (this.verMinor) {
          case 0: ind = img.readInt(8); break;
          case 1: ind = img.readInt(16); break;
          case 2: default: ind = img.readVLQ(4); break;
        }
        print(Channels.VVERBOSE, `Got index ${ind}`);
        print(Channels.VERBOSE, 'Reading x, y...');
        if (this.verMinor >= 2) { x = img.readVLQ(8); y = img.readVLQ(8); }
        else { x = img.readInt(16); y = img.readInt(16); }
        print(Channels.VVERBOSE, `Got x, y of ${x}, ${y}`);
        img.clear();
        await this.#switchImage(ind);
        img = this.img;
        if (img.state.rect) {
          let { rect } = img.state;
          x += rect.x;
          y += rect.y;
          if ((x < rect.x) || (x >= rect.x+rect.w) ||
              (y < rect.y) || (y >= rect.y+rect.h)) { throw new Error('SEC_CURSOR movement out of SEC_RECT bounds'); }
        }
        img.cursor.x = x;
        img.cursor.y = y;
        break;
      case consts.CURSOR_CMD_MOVEIMG:
        print(Channels.VERBOSE, 'Reading index...');
        switch (this.verMinor) {
          case 0: ind = img.readInt(8); break;
          case 1: ind = img.readInt(16); break;
          case 2: default: ind = img.readVLQ(4); break;
        }
        print(Channels.VVERBOSE, `Got index ${ind}`);
        await this.#switchImage(ind);
        this.img.resetCursor();
        break;
      default: throw new Error(`Unknown SEC_CURSOR command ${cmd}`);
    }
  }
  async #readSecCompress(rem) {
    let { img, master } = this, com = {};
    if (rem) { print(Channels.VERBOSE, 'Clearing SEC_COMPRESSION...'); delete master.state.compress; return; }
    print(Channels.VERBOSE, 'Reading SEC_COMPRESSION...\nReading type...');
    com.type = img.readInt(4);
    print(Channels.VVERBOSE, `Got type ${com.type}`);
    switch (com.type) {
      case consts.COMP_GZIP:
        print(Channels.VERBOSE, 'Reading level...');
        com.level = img.readInt(4);
        print(Channels.VVERBOSE, `Got level ${com.level}`);
        break;
      case consts.COMP_BROTLI:
        print(Channels.VERBOSE, 'Reading level...');
        com.level = img.readInt(4);
        print(Channels.VVERBOSE, `Got level ${com.level}`);
        print(Channels.VERBOSE, 'Reading text flag...');
        com.text = img.readInt(1);
        print(Channels.VVERBOSE, `Got flag ${com.text}`);
        break;
      default: print(Channels.VERBOSE, 'Unknown compression type specified, doing nothing...'); return;
    }
    master.state.compress = com;
  }
  async #readSecEncrypt(rem) {
    let { img, master } = this, enc = {};
    if (rem) { print(Channels.VERBOSE, 'Clearing SEC_ENCRYPTION...'); delete master.state.encrypt; return; }
    print(Channels.VERBOSE, 'Reading SEC_ENCRYPTION...\nReading type...');
    enc.type = img.readInt(4);
    print(Channels.VVERBOSE, `Got type ${enc.type}`);
    switch (enc.type) {
      case consts.CRYPT_CAMELLIA256:
      case consts.CRYPT_ARIA256:
        if (this.verMinor < 2) { throw new Error('SEC_ENCRYPTION found using CAMELLIA256 or ARIA256 in a version < 1.2; This is not valid and may be a sign of a corrupt or invalid image. Aborting.'); }
        break;
      case consts.CRYPT_CHACHA20:
      case consts.CRYPT_BLOWFISH:
        if (this.verMinor < 3) { throw new Error('SEC_ENCRYPTION found using CHACHA20 or BLOWFISH in a version < 1.3; This is not valid and may be a sign of a corrupt or invalid image. Aborting.'); }
        break;
      case consts.CRYPT_AES256: break;
      default: print(Channels.VERBOSE, 'Unknown encryption type specified, doing nothing...'); return;
    }
    switch (this.verMinor) {
      case 0:
        if (master.state.pws.length) { enc.key = getMD5Key(master.state.pws.shift()); }
        else { enc.key = getMD5Key(await this.#requestPassword()); }
        break;
      default:
        if (master.state.pws.length) { enc.key = await getCryptKey(master.state.pws.shift(), getSalt(this.verMajor, this.verMinor, this.salt)); }
        else { enc.key = await getCryptKey(await this.#requestPassword(), getSalt(this.verMajor, this.verMinor, this.salt)); }
    }
    enc.iv = new Buffer.alloc(16);
    print(Channels.VERBOSE, 'Reading IV...');
    for (let i = 0; i < 16; i++) { enc.iv[i] = img.readInt(8); }
    print(Channels.VVERBOSE, `Got IV ${enc.iv.toString('hex')}`);
    master.state.encrypt = enc;
  }
  async #readSecPartialFile(rem) {
    let { img, master } = this, f = { piece: 0 }, table = master.state.partialTable;
    if (!table) { table = master.state.partialTable = {}; }
    print(Channels.VERBOSE, 'Reading SEC_PARTIALFILE...\nReading file size...');
    if (this.verMinor >= 2) { f.size = img.readVLQ(8); }
    else { f.size = img.readInt(24); }
    print(Channels.VVERBOSE, `Got size ${f.size}`);
    print(Channels.VERBOSE, 'Reading file name...');
    f.name = img.readString();
    print(Channels.VERBOSE, `Got ${f.name}\nReading file index...`);
    if (this.verMinor >= 2) { table[binToDec(v)] = img.readVLQ(4); }
    else { table[binToDec(v)] = img.readInt(8); }
    print(Channels.VVERBOSE, `Got index ${table[binToDec(v)]}`);
    f.com = master.state.compress;
    f.enc = master.state.encrypt;
  }
  async #readSecPartialFilePiece(rem) {
    let { img, master } = this, table = master.state.partialTable, s = 0, o = {}, f;
    print(Channels.VERBOSE, 'Reading SEC_PARTIALFILEPIECE...\nReading file index...');
    if (this.verMinor >= 2) { f = img.readVLQ(4); }
    else { f = img.readInt(8); }
    print(Channels.VVERBOSE, `Got index ${f}`);
    f = table[f];
    if (!f.pieces) { f.pieces = []; }
    print(Channels.VERBOSE, 'Reading piece index...');
    if (this.verMinor >= 2) { o.ind = img.readVLQ(4); }
    else { o.ind = img.readInt(8); }
    print(Channels.VVERBOSE, `Got index ${o.ind}`);
    print(Channels.VERBOSE, 'Reading last piece flag...');
    o.last = !!img.readInt(1);
    print(Channels.VVERBOSE, `Got ${v}`);
    print(Channels.VERBOSE, 'Reading piece size...');
    if (this.verMinor >= 2) { o.size = img.readVLQ(8); }
    else { o.size = img.readInt(24); }
    print(Channels.VERBOSE, `Got size ${o.size}`);
    print(Channels.VERBOSE, 'Saving state...');
    this.#saveState(o);
    o.enc = f.enc;
    o.com = f.com;
    f.pieces.push(o);
    print(Channels.VERBOSE, 'Reading past piece...');
    while (s < o.size) { img.readBits(8); s++; }
    if (o.last) { this._partialFiles.push(new v1PartialFile(this, f)); }
  }
  async unpackPartialFile(file, output = './extracted') {
    let { state } = file, { img, pieces } = state, r = Buffer.alloc(1), path = `${output}/${state.name}`, p, fmods, size, fd, s;
    if (!fs.existsSync('tmp/')) { fs.mkdirSync('tmp'); }
    path = normalize(path).replace(/^\.\.\/(\.\.\/)*/g, '');
    fs.mkdirSync(dirname(path), { recursive: true });
    print(Channels.NORMAL, `Extracting pieces for ${state.name}...`);
    fd = fs.openSync(path, 'w');
    for (let i = 0, l = pieces.length; i < l; i++) {
      print(Channels.NORMAL, `Extracting piece ${i+1} of ${pieces.length}...`);
      s = 0;
      size = pieces[i].size;
      this.#loadState(pieces[i]);
      img = this.img;
      while (s < size) {
        r[0] = img.readInt(8);
        fs.writeSync(fd, r);
        s++;
        if (!debug()) { process.stdout.write(`\rSaved ${s} of ${size}             `); }
      }
      if (!debug()) { process.stdout.write('\n'); }
    }
    fs.closeSync(fd);
    fmods = this.#prepFileUnpack(!!state.com, !!state.enc);
    if (fmods.length) {
      if (!debug()) { print(Channels.VERBOSE, 'Processing...'); }
      await copyf(path, p = 'tmp/tmp', fmods);
      fs.unlinkSync(path);
      fs.renameSync(p, path);
    }
    state.realSize = fmods.length ? fs.statSync(path).size : state.size;
    if ((!debug()) && (state.realSize != size)) { print(Channels.NORMAL, `Processed size: ${state.realSize}`); }
  }
  async #readSecMode(rem) {
    let { img, master, modeMask } = this, mode;
    if (rem) {
      print(Channels.VERBOSE, 'Clearing SEC_MODE...');
      delete master.state.mode;
      img.clear();
      img.setMode(this.mode);
      return;
    }
    print(Channels.VERBOSE, 'Reading SEC_MODE...\nReading mode...');
    mode = fixMode(img.readInt(6));
    if ((modeMask&0b111 == 0) && (mode&consts.MODE_32BPP != consts.MODE_32BPP)) { throw new Error('Cannot use mode mask 000 unless mode 32BPP is active (sec)'); }
    img.setMode(master.state.mode = mode);
    img.clear();
    print(Channels.VVERBOSE, `Got mode ${master.state.mode}`);
  }
  async #readSecAlpha(rem) {
    let { img } = this, v;
    if (rem) {
      print(Channels.VERBOSE, 'Clearing SEC_ALPHA...');
      img.alphaThresh = this.alphaThresh;
      return;
    }
    print(Channels.VERBOSE, 'Reading SEC_ALPHA...\nReading threshhold...');
    v = img.readBits(3); img.alphaThresh = bitsToAlpha(v);
    print(Channels.VVERBOSE, `Got threshhold ${v} (${img.alphaThresh})`);
  }
  async #readSecText(rem) {
    let { img, master } = this, o = {}, s = 0;
    print(Channels.VERBOSE, 'Reading SEC_TEXT...\nReading honor mask...');
    o.mask = img.readInt(4);
    print(Channels.VVERBOSE, `Got mask ${o.mask}`);
    print(Channels.VERBOSE, 'Reading length...');
    if (this.verMinor >= 2) { o.len = img.readVLQ(8); }
    else { o.len = img.readInt(16); }
    print(Channels.VVERBOSE, `Got length ${o.len}`);
    print(Channels.VERBOSE, 'Saving state...');
    this.#saveState(o);
    print(Channels.VERBOSE, 'Reading past text...');
    while (s < o.len) { img.readBits(8); s++; }
    this._texts.push(new v1Text(this, o));
  }
  async unpackText(text) {
    let { state } = text, { img, len } = state, fmods, s, buf, txt;
    print(Channels.NORMAL, 'Extracting text...');
    this.#loadState(state);
    buf = Buffer.alloc(len);
    for (let i = 0; i < len; i++) { buf[i] = img.readInt(8); }
    fmods = this.#prepFileUnpack(state.mask & consts.TEXT_HONOR_COMPRESSION, state.mask & consts.TEXT_HONOR_ENCRYPTION, true);
    if (fmods.length) {
      let b = fmods[0], st = b;
      if (!debug()) { print(Channels.VERBOSE, 'Processing...'); }
      for (let i = 1, l = fmods.length; i < l; i++) { b.pipe(fmods[i]); b = fmods[i]; }
      st.write(buf);
      st.end();
      txt = '';
      for await (const chunk of b) { txt += chunk; }
    } else { txt = buf.toString(); }
    state.realSize = fmods.length ? txt.length : len;
    return txt;
  }
  async #readSecModeMask(rem) {
    let { img, master, mode, modeMask } = this, mask, m;
    if (rem) {
      print(Channels.VERBOSE, 'Clearing SEC_MODEMASK...');
      delete master.state.modeMask;
      img.clear();
      img.setModeMask(this.modeMask);
      return;
    }
    m = master.state.mode ? master.state.mode : mode;
    print(Channels.VERBOSE, 'Reading SEC_MODEMASK...\nReading mask...');
    mask = img.readInt(3);
    if ((mask&0b111 == 0) && (m&consts.MODE_32BPP != consts.MODE_32BPP)) { throw new Error('Cannot use mode mask 000 unless mode 32BPP is active (sec)'); }
    img.setModeMask(master.state.modeMask = mask);
    img.clear();
    print(Channels.VVERBOSE, `Got mask ${v} (${master.state.modeMask})`);
  }
}
class v1File extends StegFile {
  #state = null;
  #steg = null;
  constructor(steg, o) {
    super();
    this.#state = o;
    this.#steg = steg;
  }
  get name() { return this.#state.name; }
  get size() { return this.#state.size; }
  get realSize() { return this.#state.realSize; }
  get state() { return this.#state; }
  async extract(path = './extracted') { await this.#steg.unpackFile(this, path); }
}
class v1PartialFile extends StegPartialFile {
  #state = null;
  #steg = null;
  constructor(steg, o) {
    super();
    this.#state = o;
    this.#steg = steg;
  }
  get name() { return this.#state.name; }
  get size() { return this.#state.size; }
  get realSize() { return this.#state.realSize; }
  get state() { return this.#state; }
  get count() { return this.#state.pieces.length; }
  async extract(path = './extracted') { await this.#steg.unpackPartialFile(this, path); }
}
class v1Text extends StegText {
  #state = null;
  #steg = null;
  constructor(steg, o) {
    super();
    this.#state = o;
    this.#steg = steg;
  }
  get size() { return this.#state.len; }
  get realSize() { return this.#state.realSize; }
  get state() { return this.#state; }
  async extract() { return await this.#steg.unpackText(this); }
}
export class Builder extends _Builder {
  #out = null;
  #secs = null;
  #steg = null;
  constructor(verMajor, verMinor) {
    super();
    this.verMajor = verMajor;
    this.verMinor = verMinor;
    switch (verMajor) { case 1: break; default: throw new Error(`Unknown version ${verMajor}.x`); }
    switch (verMinor) { case 0: case 1: case 2: case 3: break; default: throw new Error(`Unknown version ${verMajor}.${verMinor}`); }
    this.clear();
  }
  get #VERSION_MAJOR() { return VERSION_MAJOR; }
  get #VERSION_MINOR() { return VERSION_MINOR; }
  clear() {
    this.#secs = null;
    this.#out = {
      verMajor: this.verMajor, verMinor: this.verMinor,
      headmode: consts.HEADMODE,
      headmodeMask: consts.HEADMODEMASK,
      mode: consts.HEADMODE,
      modeMask: consts.HEADMODEMASK,
      alpha: 255,
      rand: 0,
      in: '',
      out: '',
      secs: [],
      pws: undefined,
      dryrun: false,
      dryrunComp: false,
      keep: false, // remove for 1.4.0
      x: undefined,
      y: undefined,
      salt: undefined,
      maps: undefined, // remove for 1.4.0
      bufferMap: undefined
    };
    Image.resetMap();
    return this;
  }
  dryrun(comp = false) { this.#out.dryrun = true; this.#out.dryrunComp = !!comp; return this; }
  realrun() { if (this.#out.dryrun) { delete this.#out.dryrun; delete this.#out.dryrunComp; } return this; }
  keep(s = true) { console.warn('keep is deprecated as of 1.3.0 and will be removed in 1.4.0'); this.#out.keep = !!s; return this; }
  setHeaderMode(mode) { this.#out.headmode = mode&0b111111; return this; }
  setGlobalMode(mode) { this.#out.mode = mode&0b111111; return this; }
  setHeaderModeMask(mask) { if (mask <= 0) { throw new Error('Mode mask must be greater than 0'); } this.#out.headmodeMask = mask&0b111; return this; }
  setGlobalModeMask(mask) { if (mask <= 0) { throw new Error('Mode mask must be greater than 0'); } this.#out.modeMask = mask&0b111; return this; }
  setGlobalSeed(seed) { this.#out.rand = seed; return this; }
  setInitialCursor(x, y) { this.#out.x = x; this.#out.y = y; return this; }
  setPasswords(pws) { this.#out.pws = pws; return this; }
  setSalt(salt, raw = false) { this.#out.salt = convertSalt(salt, raw); return this; }
  inputImage(path) { this.#out.in = path; return this; }
  outputImage(path) { this.#out.out = path; return this; }
  setGlobalAlphaBounds(b) {
    switch (b) {
      case consts.ALPHA_255: case 255: this.#out.alpha = 255; break;
      case consts.ALPHA_220: case 220: this.#out.alpha = 220; break;
      case consts.ALPHA_184: case 184: this.#out.alpha = 184; break;
      case consts.ALPHA_148: case 148: this.#out.alpha = 148; break;
      case consts.ALPHA_112: case 112: this.#out.alpha = 112; break;
      case consts.ALPHA_76: case 76: this.#out.alpha = 76; break;
      case consts.ALPHA_40: case 40: this.#out.alpha = 40; break;
      case consts.ALPHA_0: this.#out.alpha = 0; break;
      default: this.#out.alpha = 255; break;
    }
    return this;
  }
  setAlphaBounds(b) {
    let v;
    switch (b) {
      case consts.ALPHA_255: case 255: v = 255; break;
      case consts.ALPHA_220: case 220: v = 220; break;
      case consts.ALPHA_184: case 184: v = 184; break;
      case consts.ALPHA_148: case 148: v = 148; break;
      case consts.ALPHA_112: case 112: v = 112; break;
      case consts.ALPHA_76: case 76: v = 76; break;
      case consts.ALPHA_40: case 40: v = 40; break;
      case consts.ALPHA_0: v = 0; break;
      default: v = 255; break;
    }
    this.#out.secs.push({ id: consts.SEC_ALPHA, alpha: v });
    return this;
  }
  clearAlphaBounds() { this.#out.secs.push({ id: consts.SEC_ALPHA, rem: true }); return this; }
  setRect(x, y, w, h) { this.#out.secs.push({ id: consts.SEC_RECT, x, y, w, h }); return this; }
  clearRect() { this.#out.secs.push({ id: consts.SEC_RECT, rem: true }); return this; }
  setMode(mode) { this.#out.secs.push({ id: consts.SEC_MODE, mode: mode&0b111111 }); return this; }
  clearMode() { this.#out.secs.push({ id: consts.SEC_MODE, rem: true }); return this; }
  setModeMask(mask) { if (mask <= 0) { throw new Error('Mode mask must be greater than 0'); } this.#out.secs.push({ id: consts.SEC_MODEMASK, mask: mask&0b111 }); return this; }
  clearModeMask() { this.#out.secs.push({ id: consts.SEC_MODEMASK, rem: true }); return this; }
  setSeed(seed) { this.#out.secs.push({ id: consts.SEC_RAND, seed }); return this; }
  clearSeed() { this.#out.secs.push({ id: consts.SEC_RAND, rem: true }); return this; }
  pushCursor() { this.#out.secs.push({ id: consts.SEC_CURSOR, command: consts.CURSOR_CMD_PUSH }); return this; }
  popCursor() { this.#out.secs.push({ id: consts.SEC_CURSOR, command: consts.CURSOR_CMD_POP }); return this; }
  moveCursor(x, y, index = 0) { this.#out.secs.push({ id: consts.SEC_CURSOR, command: consts.CURSOR_CMD_MOVE, index, x, y }); return this; }
  moveImage(index = 0) { this.#out.secs.push({ id: consts.SEC_CURSOR, command: consts.CURSOR_CMD_MOVEIMG, index }); return this; }
  setImageTable(inputFiles, outputFiles) { this.#out.secs.push({ id: consts.SEC_IMAGETABLE, in: inputFiles, out: outputFiles }); return this; }
  clearImageTable() { this.#out.secs.push({ id: consts.SEC_IMAGETABLE, rem: true }); return this; }
  setCompression(type, level = 0, text = false) {
    switch (type) {
      case consts.COMP_GZIP:
        if ((level < 0) || (level > 9)) { throw new Error(`Compression level ${level} out of bounds`); }
        this.#out.secs.push({ id: consts.SEC_COMPRESSION, type, level });
        break;
      case consts.COMP_BROTLI:
        if ((level < 0) || (level > 11)) { throw new Error(`Compression level ${level} out of bounds`); }
        this.#out.secs.push({ id: consts.SEC_COMPRESSION, type, level, text: !!text });
        break;
      default: throw new Error(`Unknown compression type ${type}`);
    }
    return this;
  }
  clearCompression() { this.#out.secs.push({ id: consts.SEC_COMPRESSION, rem: true }); return this; }
  setEncryption(type, pw) {
    switch (type) {
      case consts.CRYPT_AES256:
      case consts.CRYPT_CAMELLIA256:
      case consts.CRYPT_ARIA256:
      case consts.CRYPT_CHACHA20:
      case consts.CRYPT_BLOWFISH:
        break;
      default: throw new Error(`Unknown encryption type ${type}`);
    }
    this.#out.secs.push({ id: consts.SEC_ENCRYPTION, type, pw });
    return this;
  }
  clearEncryption() { this.#out.secs.push({ id: consts.SEC_ENCRYPTION, rem: true }); return this; }
  addFile(path, name, compressed = false) { this.#out.secs.push({ id: consts.SEC_FILE, path, newName: name, compressed }); return this; }
  addPartialFile(path, _name, _fileIndex, _compressed = false) {
    let name, fileIndex, compressed = false;
    if (typeof _name == 'string') { name = _name; fileIndex = _fileIndex; }
    else { name = undefined; fileIndex = name; }
    this.#out.secs.push({ id: consts.SEC_PARTIALFILE, path, newName: name, index: fileIndex, compressed });
    return this;
  }
  addPartialFilePiece(fileIndex, size = 0, last = false) { this.#out.secs.push({ id: consts.SEC_PARTIALFILEPIECE, index: fileIndex, size, last }); return this; }
  addText(text, honor = 0) { this.#out.secs.push({ id: consts.SEC_TEXT, text, honor }); return this; }
  addDirectory(path, full = false, recursive = false, compressed = false) {
    let paths = [];
    function readPath(p, pre) {
      let list = fs.readdirSync(p, { withFileTypes: true });
      for (let i = 0, l = list.length; i < l; i++) {
        if (list[i].isDirectory()) { if (recursive) { readPath(pathJoin(p, list[i].name), pathJoin(pre, list[i].name)); } continue; }
        paths.push([pathJoin(p, list[i].name), pathJoin(pre, list[i].name)]);
      }
    }
    readPath(path, full ? path : basename(path));
    for (let i = 0, l = paths.length; i < l; i++) { this.addFile(paths[i][0], paths[i][1], compressed); }
    return this;
  }
  async getLoadOpts(packed = false, enc = false, salt = false, raw = false) {
    if (!packed) {
      return {
        headmode: this.#out.headmode,
        headmodeMask: this.#out.headmodeMask,
        rand: this.#out.rand,
        salt: this.#out.salt,
        x: this.#out.x,
        y: this.#out.y
      };
    } else {
      let key = undefined, s = false;
      if (enc) {
        key = await (this.getPasswordHandler())();
        if (salt !== false) { s = salt === true ? this.#out.salt : convertSalt(salt, raw); }
      }
      return packString(JSON.stringify(await this.getLoadOpts(false)), key, s);
    }
  }
  async setLoadOpts(blob, packed = false, enc = false, salt = false, raw = false) {
    if (!packed) {
      this.#out.headmode = blob.headmode;
      this.#out.headmodeMask = blob.headmodeMask;
      this.#out.rand = blob.rand;
      this.#out.salt = blob.salt;
      this.#out.x = blob.x;
      this.#out.y = blob.y;
    } else {
      let key = undefined, s = false;
      if (enc) {
        key = await (this.getPasswordHandler())();
        if (salt !== false) { s = salt === true ? this.#out.salt : convertSalt(salt, raw); }
      }
      this.setLoadOpts(JSON.parse(await unpackString(blob, key, s)), false);
    }
  }
  async save() {
    let steg = new v1();
    if (this.#out.keep) { this.#steg = steg; } // remove for 1.4.0
    steg.pwcb = this.getPasswordHandler();
    return steg.save(this.#out);
  }
  loadMap(n, p) {
    console.warn('loadMap is deprecated as of 1.3.0 and will be removed in 1.4.0; please use the new object-based syntax described in the README for image loading');
    if (!this.#out.maps) { this.#out.maps = {}; }
    this.#out.maps[n] = p;
    return this;
  }
  saveMap(n, p) {
    console.warn('saveMap is deprecated as of 1.3.0 and will be removed in 1.4.0; please use the new object-based syntax described in the README for image loading');
    if (this.#steg) {
      let { fullTable } = this.#steg;
      if (this.#steg.master.src == n) { this.#steg.master.saveMap(p); }
      else if ((fullTable[n]) && (fullTable[n].img)) { fullTable[n].img.saveMap(p); }
    }
    return this;
  }
  setBufferMap(map) { this.#out.bufferMap = map; return this; }
  async load() {
    let steg = new v1();
    if (this.#out.keep) { this.#steg = steg; } // remove for 1.4.0
    steg.pwcb = this.getPasswordHandler();
    return steg.load(this.#out).then((secs) => { this.#secs = secs; return secs; });
  }
  async extractAll(secs = this.#secs, path = './extracted') {
    let arr = [], s, bytes = 0, bytesStored = 0, time = (new Date()).getTime();
    for (let i = 0, l = secs.length; i < l; i++) {
      s = await secs[i].extract(path);
      if ((s instanceof String) || (typeof s === 'string')) { arr.push(s); }
      bytes += secs[i].realSize;
      bytesStored += secs[i].size;
    }
    if (bytes != bytesStored) { print(Channels.NORMAL, `Extracted ${bytes} bytes (${bytesStored} bytes stored) in ${((new Date()).getTime()-time)/1000}s`); }
    else { print(Channels.NORMAL, `Extracted ${bytes} bytes in ${((new Date()).getTime()-time)/1000}s`); }
    return arr;
  }
}

export default { Builder };
