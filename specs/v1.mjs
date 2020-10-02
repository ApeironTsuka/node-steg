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
         copyf,
         print, Channels, debug
       } from '../util.mjs';
import { Steg, StegFile, StegPartialFile, StegText } from '../stubs.mjs';
const VERSION_MAJOR = 1, VERSION_MINOR = 1;
const CRYPT_SALT = '546ac12e6786afb81045a6401a0e0342cb341b450cfc06f87e081b7ec4cae6a7';

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
    let img = this.img = new Image(), headmode = input.headmode||consts.HEADMODE, headmodeMask = input.headmodeMask||consts.HEADMODEMASK, { mode, modeMask, secs, dryrun, dryrunComp } = input, verMajor = input.verMajor||this.#VERSION_MAJOR, verMinor = input.verMinor||this.#VERSION_MINOR;
    if (verMajor != this.#VERSION_MAJOR) { throw new Error(`Trying to build a version ${verMajor}.x with a ${this.#VERSION_MAJOR}.x constructor`); }
    switch (verMinor) {
      case 0: case 1: break;
      default: throw new Error(`Trying to build an unsupported version ${verMajor}.${verMinor}`);
    }
    this.verMajor = verMajor;
    this.verMinor = verMinor;
    this.dryrun = dryrun;
    this.dryrunComp = dryrunComp;
    if (dryrun) { print(Channels.NORMAL, 'DOING A DRY RUN! No changes to any images will be saved.'); if (!dryrunComp) { print(Channels.NORMAL, 'No files will be created or modified.'); } }
    headmode = fixMode(headmode);
    mode = fixMode(mode);
    print(Channels.VERBOSE, `Packing version ${verMajor}.${verMinor}...`);
    await img.load(input.in);
    img.master = this.master = img;
    this.master.modeMask = this.modeMask = headmodeMask;
    img.writing = true;
    if (input.rand) { img.rand.seed = hashToDec(input.rand); img.resetCursor(); }
    this.mode = mode;
    if ((modeMask&0b111 == 0) && (headmode&consts.MODE_32BPP != consts.MODE_32BPP)) { throw new Error('Cannot use mode mask 000 unless mode 32BPP is active (header)'); }
    img.setMode(headmode);
    img.setModeMask(headmodeMask);
    print(Channels.VERBOSE, 'Setting version...');
    img.writeBits(pad(decToBin(verMajor), 6, '0'));
    img.writeBits(pad(decToBin(verMinor), 6, '0'));
    print(Channels.VERBOSE, 'Setting mode...');
    img.writeBits(pad(decToBin(mode), 6, '0'));
    if ((modeMask&0b111 == 0) && (mode&consts.MODE_32BPP != consts.MODE_32BPP)) { throw new Error('Cannot use mode mask 000 unless mode 32BPP is active (global)'); }
    img.setMode(mode);
    print(Channels.VERBOSE, 'Setting settings...');
    this.alphaThresh = img.alphaThresh = bitsToAlpha(alphaToBits(input.alpha));
    switch (verMinor) {
      case 0: img.writeBits(alphaToBits(this.alphaThresh)+'00000000000'); break;
      case 1: default: img.writeBits(alphaToBits(this.alphaThresh)+pad(decToBin(modeMask), 3, '0')+'00000000'); break;
    }
    if (headmodeMask != modeMask) { img.flush(); }
    this.master.modeMask = this.modeMask = modeMask;
    img.setModeMask(modeMask);
    print(Channels.VERBOSE, 'Setting sec count...');
    img.writeBits(pad(decToBin(secs.length), 9, '0'));
    print(Channels.VERBOSE, 'Saving secs...');
    this.fullTable = {};
    for (let i = 0, l = secs.length; i < l; i++) {
      if (!await this.#packSec(secs[i])) { throw new Error(`Unknown sec id ${sec.id}`); }
    }
    img.flush();
    if (!dryrun) { await img.save(input.out); }
    await this.#saveImages();
    print(Channels.NORMAL, `Number of pixels changed in ${input.out}: ${img.used.count} of ${img.width*img.height} (${Math.floor(img.used.count/(img.width*img.height)*10000)/100}%)`);
    delete this.table;
    delete this.fullTable;
    return true;
  }
  async load(input) {
    let img = this.img = new Image(), headmode = input.headmode||consts.HEADMODE, headmodeMask = input.headmodeMask||consts.HEADMODEMASK, { in: image, rand, modeMask } = input, v, verMajor, verMinor, mode, secCount, ret;
    this._files = [];
    this._partialFiles = [];
    this._texts = [];
    this.fullTable = {};
    await img.load(image);
    img.master = this.master = img;
    this.master.modeMask = this.modeMask = headmodeMask;
    img.state.pws = input.pws || [];
    if (rand) { img.rand.seed = hashToDec(rand); img.resetCursor(); }
    headmode = fixMode(headmode);
    if ((modeMask&0b111 == 0) && (headmode&consts.MODE_32BPP != consts.MODE_32BPP)) { throw new Error('Cannot use mode mask 000 unless mode 32BPP is active (header)'); }
    img.setMode(headmode);
    img.setModeMask(headmodeMask);
    print(Channels.VERBOSE, 'Unpacking...\nReading version...');
    v = img.readBits(6); verMajor = binToDec(v);
    switch (verMajor) {
      case this.#VERSION_MAJOR: break;
      default: throw new Error(`Trying to extract version ${verMajor}.x with ${this.#VERSION_MAJOR}.x`);
    }
    v = img.readBits(6); verMinor = binToDec(v);
    switch (verMinor) {
      case 0: case 1: break;
      default: throw new Error(`Unsupported version ${verMajor}.${verMinor}`);
    }
    print(Channels.VVERBOSE, `Got version ${verMajor}.${verMinor}`);
    this.verMajor = verMajor;
    this.verMinor = verMinor;
    print(Channels.VERBOSE, 'Reading mode...');
    v = img.readBits(6); mode = this.mode = binToDec(v);
    print(Channels.VVERBOSE, `Got mode ${v} (${mode})`);
    if ((modeMask&0b111 == 0) && (mode&consts.MODE_32BPP != consts.MODE_32BPP)) { throw new Error('Cannot use mode mask 000 unless mode 32BPP is active (global)'); }
    img.setMode(mode);
    print(Channels.VERBOSE, 'Reading settings...');
    v = img.readBits(14);
    switch (verMinor) {
      case 0:
        if (v.substr(3) != '00000000000') { throw new Error(`Reserved settings space expected to be empty, but got ${v.substr(3)}. Is this a valid Steg image?`); }
        this.alphaThresh = img.alphaThresh = bitsToAlpha(v.substr(0, 3));
        print(Channels.VVERBOSE, `Got settings ${v} (threshhold ${this.alphaThresh})`);
        break;
      case 1: default:
        if (v.substr(6) != '00000000') { throw new Error(`Reserved settings space expected to be empty, but got ${v.substr(6)}. Is this a valid Steg image?`); }
        this.alphaThresh = img.alphaThresh = bitsToAlpha(v.substr(0, 3));
        this.master.modeMask = this.modeMask = binToDec(v.substr(3, 3));
        print(Channels.VVERBOSE, `Got settings ${v} (threshhold ${this.alphaThresh}, mode mask ${this.modeMask})`);
        break;
    }
    img.setModeMask(this.modeMask);
    if (headmodeMask != this.modeMask) { img.clear(); }
    print(Channels.VERBOSE, 'Reading sec count...');
    v = img.readBits(9); secCount = binToDec(v);
    print(Channels.VVERBOSE, `Got ${v} (${secCount})`);
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
    if (!i.img.loaded) { await i.img.load(i.input||i.name); }
    print(Channels.VERBOSE, `Switching to ${i.name}...`);
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
  async #saveImages() {
    let img, t;
    for (let i = 0, { fullTable } = this, keys = Object.keys(fullTable), l = keys.length; i < l; i++) {
      t = fullTable[keys[i]];
      img = t.img;
      if (!img.loaded) { continue; }
      if (img.master == img) { continue; }
      img.flush();
      if (!this.dryrun) { await img.save(t.path); }
      print(Channels.NORMAL, `Number of pixels changed in ${t.name}: ${img.used.count} of ${img.width*img.height} (${Math.floor(img.used.count/(img.width*img.height)*10000)/100}%)`);
    }
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
    let { img, master, size } = state;
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
    let { img, master } = this;
    print(Channels.VERBOSE, 'Saving sec id...');
    img.writeBits(pad(decToBin(sec.id|(sec.rem?1<<8:0)), 9, '0'));
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
    s = pad(decToBin(sec.len), 24, '0');
    img.writeBits(s);
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
    let { img, fullTable } = this, table = this.table = [], z, bn, p;
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
      case 0: img.writeBits(pad(decToBin(sec.out.length), 8, '0')); break;
      case 1: default: img.writeBits(pad(decToBin(sec.out.length), 16, '0')); break;
    }
    print(Channels.VERBOSE, 'Packing file names...');
    for (let i = 0, files = sec.out, l = files.length; i < l; i++) {
      let fname = files[i], fnamebn = basename(fname);
      p = sec.in[i];
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
      table.push(z = fullTable[bn] = { path: fname, name: fnamebn, input: sec.in[i] });
      if (basename(img.src) == bn) { z.img = img; }
      else if (`frame|${img.frame}|${basename(img.src)}` == bn) { z.img = img; }
      else if (basename(this.master.src) == bn) { z.img = this.master; }
      else if (`frame|${this.master.frame}|${basename(this.master.src)}` == bn) { z.img = this.master; }
      else { z.img = new Image(); z.img.master = this.master; }
    }
  }
  async #packSecRect(sec) {
    let { img } = this, s = '', x, y;
    if (sec.rem) { print(Channels.VERBOSE, 'Clearing SEC_RECT...'); delete img.state.rect; return; }
    s  = pad(decToBin(sec.x), 16, '0');
    s += pad(decToBin(sec.y), 16, '0');
    s += pad(decToBin(sec.w), 16, '0');
    s += pad(decToBin(sec.h), 16, '0');
    print(Channels.VERBOSE, 'Packing SEC_RECT...\nPacking x, y, w, h...');
    img.writeBits(s);
    img.flush();
    img.state.rect = { x: sec.x, y: sec.y, w: sec.w, h: sec.h, max: sec.w*sec.h };
    img.resetCursor(true);
  }
  async #packSecCursor(sec) {
    let { img, master } = this, s = '', { cursorStack } = master.state;
    print(Channels.VERBOSE, 'Packing SEC_CURSOR...\nPacking command...');
    if (!cursorStack) { master.state.cursorStack = cursorStack = []; }
    if ((sec.command == consts.CURSOR_CMD_MOVE) && ((img.state.rand) || (master.rand.seed != -1))) { sec.command = consts.CURSOR_CMD_MOVEIMG; }
    img.writeBits(pad(decToBin(sec.command), 3, '0'));
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
          case 0: img.writeBits(pad(decToBin(sec.index), 8, '0')); break;
          case 1: default: img.writeBits(pad(decToBin(sec.index), 16, '0')); break;
        }
        print(Channels.VERBOSE, 'Packing x, y...');
        s  = pad(decToBin(sec.x), 16, '0');
        s += pad(decToBin(sec.y), 16, '0');
        img.writeBits(s);
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
          case 0: img.writeBits(pad(decToBin(sec.index), 8, '0')); break;
          case 1: default: img.writeBits(pad(decToBin(sec.index), 16, '0')); break;
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
        img.writeBits(pad(decToBin(sec.type), 4, '0'));
        print(Channels.VERBOSE, 'Packing level...');
        img.writeBits(pad(decToBin(com.level=sec.level?sec.level:0), 4, '0'));
        break;
      case consts.COMP_BROTLI:
        img.writeBits(pad(decToBin(sec.type), 4, '0'));
        print(Channels.VERBOSE, 'Packing level...');
        img.writeBits(pad(decToBin(com.level=sec.level?sec.level:0), 4, '0'));
        print(Channels.VERBOSE, 'Packing text flag...');
        img.writeBits(decToBin(com.text=sec.text?1:0));
        break;
      default: img.writeBits(pad(decToBin(consts.COMP_NONE), 4, '0')); return;
    }
    master.state.compress = com;
  }
  async #packSecEncryption(sec) {
    let { img, master } = this, s = '', enc = {};
    if (sec.rem) { print(Channels.VERBOSE, 'Clearing SEC_ENCRYPTION...'); delete master.state.encrypt; return; }
    print(Channels.VERBOSE, 'Packing SEC_ENCRYPTION...');
    enc.type = sec.type;
    switch (sec.type) {
      case consts.CRYPT_AES256:
        {
          if (!sec.pw) { sec.pw = await this.#requestPassword(); }
          switch (this.verMinor) {
            case 0: enc.key = getMD5Key(sec.pw); break;
            case 1: default: enc.key = await getCryptKey(sec.pw, CRYPT_SALT); break;
          }
          enc.iv = generateIV();
          print(Channels.VERBOSE, 'Packing type...');
          img.writeBits(pad(decToBin(sec.type), 4, '0'));
          for (let i = 0; i < 16; i++) { s += pad(decToBin(enc.iv[i]), 8, '0'); }
          print(Channels.VERBOSE, 'Packing IV...');
          img.writeBits(s);
        }
        break;
      default: img.writeBits(pad(decToBin(consts.CRYPT_NONE), 4, '0')); return;
    }
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
    img.writeBits(pad(decToBin(f.size), 24, '0'));
    print(Channels.VERBOSE, 'Packing file name...');
    img.writeString(sec.newName||basename(sec.path));
    print(Channels.VERBOSE, 'Packing file index...');
    img.writeBits(pad(decToBin(sec.index), 8, '0'));
  }
  async #packSecPartialFilePiece(sec) {
    let { img, master } = this, f = master.state.partialTable[sec.index], w = 0, s = '';
    if ((!sec.size) || (sec.size > f.size-f.written)) { sec.size = f.size - f.written; sec.last = true; }
    if (f.done) { sec.size = 0; }
    print(Channels.VERBOSE, 'Packing SEC_PARTIALFILEPIECE...\nPacking file index...');
    img.writeBits(pad(decToBin(sec.index), 8, '0'));
    print(Channels.VERBOSE, 'Packing piece index...');
    img.writeBits(pad(decToBin(f.pieces++), 8, '0'));
    print(Channels.VERBOSE, 'Packing last piece flag...');
    img.writeBits(decToBin(sec.last||f.done?1:0));
    print(Channels.VERBOSE, 'Packing piece size...');
    img.writeBits(pad(decToBin(sec.size), 24, '0'));
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
    img.writeBits(pad(decToBin(m), 6, '0'));
    img.flush();
    img.setMode(master.state.mode = m);
  }
  async #packSecAlpha(sec) {
    let { img } = this;
    if (sec.rem) {
      print(Channels.VERBOSE, 'Clearing SEC_ALPHA...');
      img.alphaThresh = this.alphaThresh;
      return;
    }
    print(Channels.VERBOSE, 'Packing SEC_ALPHA...\nPacking threshhold...');
    let n = bitsToAlpha(alphaToBits(sec.alpha));
    img.writeBits(pad(alphaToBits(n), 3, '0'));
    img.alphaThresh = n;
  }
  async #packSecText(sec) {
    let { img } = this, { text, honor } = sec, s = '', fmods, buf;
    print(Channels.VERBOSE, 'Packing SEC_TEXT...\nPacking honor mask...');
    img.writeBits(pad(decToBin(honor), 4, '0'));
    fmods = this.#prepFilePack(honor & consts.TEXT_HONOR_COMPRESSION, honor & consts.TEXT_HONOR_ENCRYPTION, true)
    if (fmods.length) {
      let b = fmods[0], st = b, bufs = [], obufs = [], k;
      for (let i = 1, l = fmods.length; i < l; i++) { b.pipe(fmods[i]); b = fmods[i]; }
      if (!debug()) { print(Channels.VERBOSE, 'Processing...'); }
      st.write(text, 'utf8');
      st.end();
      for await (const chunk of b) { bufs.push(chunk); }
      buf = Buffer.concat(bufs);
    } else { buf = Buffer.from(text, 'binary'); }
    print(Channels.VERBOSE, `Packing text length (${buf.length})...`);
    img.writeBits(pad(decToBin(buf.length), 16, '0'));
    print(Channels.VERBOSE, 'Packing text...');
    for (let i = 0, l = buf.length; i < l; i++) { s += pad(decToBin(buf[i]), 8, '0'); }
    img.writeBits(s);
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
    img.writeBits(pad(decToBin(sec.mask), 3, '0'));
    img.flush();
    img.setModeMask(master.state.modeMask = sec.mask);
  }
  async #readSec() {
    let { img } = this, v, secId, rem;
    function err(id) { return { v: false, secId: id }; }
    print(Channels.VERBOSE, 'Reading sec id...');
    v = img.readBits(9); secId = binToDec(v);
    print(Channels.VVERBOSE, `Got ${v} (${secId})`);
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
    let { img, master } = this, o = {}, s = 0, v;
    print(Channels.VERBOSE, 'Reading SEC_FILE...\nReading size...');
    v = img.readBits(24); o.size = binToDec(v);
    print(Channels.VVERBOSE, `Got ${v} (${o.size})`, `Got ${o.size}`);
    print(Channels.VERBOSE, 'Reading name...');
    v = img.readString(); o.name = v;
    print(Channels.VERBOSE, `Got ${o.name}`);
    print(Channels.VERBOSE, 'Saving current state...');
    this.#saveState(o);
    print(Channels.VERBOSE, 'Reading past file...');
    while (s < o.size) { img.readBits(8); s++; }
    this._files.push(new v1File(this, o));
  }
  async unpackFile(file, output = './extracted') {
    let { state } = file, { img, size } = state, s = 0, r = Buffer.alloc(1), fd, v, path, p, fmods;
    this.#loadState(state);
    print(Channels.NORMAL, `Extracting ${file.state.name}...`);
    path = normalize(`${output}/${file.state.name}`).replace(/^\.\.\/(\.\.\/)*/g, '');
    fs.mkdirSync(dirname(path), { recursive: true });
    fd = fs.openSync(path, 'w');
    while (s < size) {
      v = img.readBits(8);
      r[0] = binToDec(v);
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
    let { img, master } = this, v, seed;
    if (rem) { print(Channels.VERBOSE, 'Clearing SEC_RAND...'); delete img.state.rand; return; }
    print(Channels.VERBOSE, 'Reading SEC_RAND...\nReading seed...');
    v = img.readBits(32); seed = binToDec(v);
    img.clear();
    print(Channels.VVERBOSE, `Got ${v} (${seed})`);
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
      case 0: v = img.readBits(8); break;
      case 1: default: v = img.readBits(16); break;
    }
    n = binToDec(v);
    print(Channels.VVERBOSE, `Got ${v} (${n})`);
    print(Channels.VERBOSE, 'Reading file names...');
    for (let i = 0; i < n; i++) {
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
    }
    this.table = table;
  }
  async #readSecRect(rem) {
    let { img } = this, rect = {}, v;
    if (rem) { print(Channels.VERBOSE, 'Clearing SEC_RECT...'); delete img.state.rect; return; }
    print(Channels.VERBOSE, 'Reading SEC_RECT...\nReading x, y, w, h...');
    v = img.readBits(64);
    img.clear();
    rect.x = binToDec(v.substr(0, 16));
    rect.y = binToDec(v.substr(16,16));
    rect.w = binToDec(v.substr(32,16));
    rect.h = binToDec(v.substr(48,16));
    print(Channels.VVERBOSE, `Got ${v} (${rect.x}, ${rect.y}, ${rect.w}, ${rect.h})`);
    img.state.rect = rect;
    img.resetCursor();
  }
  async #readSecCursor(rem) {
    let { img, master } = this, { cursorStack } = master.state, v, cmd, ind, x, y;
    if (!cursorStack) { master.state.cursorStack = cursorStack = []; }
    print(Channels.VERBOSE, 'Reading SEC_CURSOR...\nReading command...');
    v = img.readBits(3); cmd = binToDec(v);
    print(Channels.VVERBOSE, `Got ${v} (${cmd})`);
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
          case 0: v = img.readBits(8); break;
          case 1: default: v = img.readBits(16); break;
        }
        ind = binToDec(v);
        print(Channels.VVERBOSE, `Got ${v} (${ind})`);
        print(Channels.VERBOSE, 'Reading x, y...');
        v = img.readBits(32); x = binToDec(v.substr(0, 16)); y = binToDec(v.substr(16));
        print(Channels.VVERBOSE, `Got ${v} (${x}, ${y})`);
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
          case 0: v = img.readBits(8); break;
          case 1: default: v = img.readBits(16); break;
        }
        ind = binToDec(v);
        print(Channels.VVERBOSE, `Got ${v} (${ind})`);
        await this.#switchImage(ind);
        this.img.resetCursor();
        break;
      default: throw new Error(`Unknown SEC_CURSOR command ${cmd}`);
    }
  }
  async #readSecCompress(rem) {
    let { img, master } = this, com = {}, v;
    if (rem) { print(Channels.VERBOSE, 'Clearing SEC_COMPRESSION...'); delete master.state.compress; return; }
    print(Channels.VERBOSE, 'Reading SEC_COMPRESSION...\nReading type...');
    v = img.readBits(4); com.type = binToDec(v);
    print(Channels.VVERBOSE, `Got ${v} (${com.type})`);
    switch (com.type) {
      case consts.COMP_GZIP:
        print(Channels.VERBOSE, 'Reading level...');
        v = img.readBits(4); com.level = binToDec(v);
        print(Channels.VVERBOSE, `Got ${v} (${com.level})`);
        break;
      case consts.COMP_BROTLI:
        print(Channels.VERBOSE, 'Reading level...');
        v = img.readBits(4); com.level = binToDec(v);
        print(Channels.VVERBOSE, `Got ${v} (${com.level})`);
        print(Channels.VERBOSE, 'Reading text flag...');
        v = img.readBits(1); com.text = binToDec(v);
        print(Channels.VVERBOSE, `Got ${v} (${com.text})`);
        break;
      default: print(Channels.VERBOSE, 'Unknown compression type specified, doing nothing...'); return;
    }
    master.state.compress = com;
  }
  async #readSecEncrypt(rem) {
    let { img, master } = this, enc = {}, v;
    if (rem) { print(Channels.VERBOSE, 'Clearing SEC_ENCRYPTION...'); delete master.state.encrypt; return; }
    print(Channels.VERBOSE, 'Reading SEC_ENCRYPTION...\nReading type...');
    v = img.readBits(4); enc.type = binToDec(v);
    print(Channels.VVERBOSE, `Got ${v} (${enc.type})`);
    switch (enc.type) {
      case consts.CRYPT_AES256:
        {
          switch (this.verMinor) {
            case 0:
              if (master.state.pws.length) { enc.key = getMD5Key(master.state.pws.shift()); }
              else { enc.key = getMD5Key(await this.#requestPassword()); }
              break;
            case 1: default:
              if (master.state.pws.length) { enc.key = await getCryptKey(master.state.pws.shift(), CRYPT_SALT); }
              else { enc.key = await getCryptKey(await this.#requestPassword(), CRYPT_SALT); }
          }
          enc.iv = new Buffer.alloc(16);
          print(Channels.VERBOSE, 'Reading IV...');
          v = img.readBits(128);
          for (let i = 0; i < 16; i++) { enc.iv[i] = binToDec(v.substr(i*8, 8)); }
          print(Channels.VVERBOSE, `Got ${enc.iv.toString('hex')}`);
        }
        break;
      default: print(Channels.VERBOSE, 'Unknown encryption type specified, doing nothing...'); return;
    }
    master.state.encrypt = enc;
  }
  async #readSecPartialFile(rem) {
    let { img, master } = this, f = { piece: 0 }, table = master.state.partialTable, v;
    if (!table) { table = master.state.partialTable = {}; }
    print(Channels.VERBOSE, 'Reading SEC_PARTIALFILE...\nReading file size...');
    v = img.readBits(24); f.size = binToDec(v);
    if (debug()) { print(Channels.VVERBOSE, `Got ${v} (${f.size})`); }
    else { print(Channels.VERBOSE, `Got ${f.size}`); }
    print(Channels.VERBOSE, 'Reading file name...');
    f.name = img.readString();
    print(Channels.VERBOSE, `Got ${f.name}\nReading file index...`);
    v = img.readBits(8); table[binToDec(v)] = f;
    print(Channels.VVERBOSE, `Got ${v} (${binToDec(v)})`);
    f.com = master.state.compress;
    f.enc = master.state.encrypt;
  }
  async #readSecPartialFilePiece(rem) {
    let { img, master } = this, table = master.state.partialTable, s = 0, o = {}, v, f;
    print(Channels.VERBOSE, 'Reading SEC_PARTIALFILEPIECE...\nReading file index...');
    v = img.readBits(8); f = table[binToDec(v)];
    if (!f.pieces) { f.pieces = []; }
    print(Channels.VVERBOSE, `Got ${v} (${binToDec(v)})`);
    print(Channels.VERBOSE, 'Reading piece index...');
    v = img.readBits(8); o.ind = binToDec(v);
    print(Channels.VVERBOSE, `Got ${v} (${o.ind})`);
    print(Channels.VERBOSE, 'Reading last piece flag...');
    v = img.readBits(1); o.last = !!binToDec(v);
    print(Channels.VVERBOSE, `Got ${v}`);
    print(Channels.VERBOSE, 'Reading piece size...');
    v = img.readBits(24); o.size = binToDec(v);
    if (debug()) { print(Channels.VVERBOSE, `Got ${v} (${o.size})`); }
    else { print(Channels.VERBOSE, `Got ${o.size}`); }
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
    let { state } = file, { img, pieces } = state, r = Buffer.alloc(1), path = `${output}/${state.name}`, p, fmods, size, fd, v, s;
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
        v = img.readBits(8);
        r[0] = binToDec(v);
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
    let { img, master, modeMask } = this, v, mode;
    if (rem) {
      print(Channels.VERBOSE, 'Clearing SEC_MODE...');
      delete master.state.mode;
      img.clear();
      img.setMode(this.mode);
      return;
    }
    print(Channels.VERBOSE, 'Reading SEC_MODE...\nReading mode...');
    v = img.readBits(6); mode = binToDec(v);
    mode = fixMode(mode);
    if ((modeMask&0b111 == 0) && (mode&consts.MODE_32BPP != consts.MODE_32BPP)) { throw new Error('Cannot use mode mask 000 unless mode 32BPP is active (sec)'); }
    img.setMode(master.state.mode = binToDec(v));
    img.clear();
    print(Channels.VVERBOSE, `Got ${v} (${master.state.mode})`);
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
    print(Channels.VVERBOSE, `Got ${v} (${img.alphaThresh})`);
  }
  async #readSecText(rem) {
    let { img, master } = this, o = {}, s = 0, v;
    print(Channels.VERBOSE, 'Reading SEC_TEXT...\nReading honor mask...');
    v = img.readBits(4); o.mask = binToDec(v);
    print(Channels.VVERBOSE, `Got ${v} (${o.mask})`);
    print(Channels.VERBOSE, 'Reading length...');
    v = img.readBits(16); o.len = binToDec(v);
    print(Channels.VVERBOSE, `Got ${v} (${o.len})`);
    print(Channels.VERBOSE, 'Saving state...');
    this.#saveState(o);
    print(Channels.VERBOSE, 'Reading past text...');
    while (s < o.len) { img.readBits(8); s++; }
    this._texts.push(new v1Text(this, o));
  }
  async unpackText(text) {
    let { state } = text, { img, len } = state, fmods, v, s, buf, txt;
    print(Channels.NORMAL, 'Extracting text...');
    this.#loadState(state);
    buf = Buffer.alloc(len);
    for (let i = 0; i < len; i++) { v = img.readBits(8); v = binToDec(v); buf[i] = v; }
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
    let { img, master, mode, modeMask } = this, v, mask, m;
    if (rem) {
      print(Channels.VERBOSE, 'Clearing SEC_MODEMASK...');
      delete master.state.modeMask;
      img.clear();
      img.setModeMask(this.modeMask);
      return;
    }
    m = master.state.mode ? master.state.mode : mode;
    print(Channels.VERBOSE, 'Reading SEC_MODEMASK...\nReading mask...');
    v = img.readBits(3); mask = binToDec(v);
    if ((mask&0b111 == 0) && (m&consts.MODE_32BPP != consts.MODE_32BPP)) { throw new Error('Cannot use mode mask 000 unless mode 32BPP is active (sec)'); }
    img.setModeMask(master.state.modeMask = binToDec(v));
    img.clear();
    print(Channels.VVERBOSE, `Got ${v} (${master.state.modeMask})`);
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
  constructor(verMajor, verMinor) {
    super();
    this.verMajor = verMajor;
    this.verMinor = verMinor;
    switch (verMajor) { case 1: break; default: throw new Error(`Unknown version ${verMajor}.x`); }
    switch (verMinor) { case 0: case 1: break; default: throw new Error(`Unknown version ${verMajor}.${verMinor}`); }
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
      dryrunComp: false
    };
    return this;
  }
  dryrun(comp = false) { this.#out.dryrun = true; this.#out.dryrunComp = !!comp; return this; }
  setHeaderMode(mode) { this.#out.headmode = mode&0b111111; return this; }
  setGlobalMode(mode) { this.#out.mode = mode&0b111111; return this; }
  setHeaderModeMask(mask) { this.#out.headmodeMask = mask&0b111; return this; }
  setGlobalModeMask(mask) { this.#out.modeMask = mask&0b111; return this; }
  setGlobalSeed(seed) { this.#out.rand = seed; return this; }
  setPasswords(pws) { this.#out.pws = pws; return this; }
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
  setModeMask(mask) { this.#out.secs.push({ id: consts.SEC_MODEMASK, mask: mask&0b111 }); return this; }
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
      case consts.CRYPT_AES256: break;
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
  async save() {
    let steg = new v1();
    steg.pwcb = this.getPasswordHandler();
    return steg.save(this.#out);
  }
  async load() {
    let steg = new v1();
    steg.pwcb = this.getPasswordHandler();
    return steg.load(this.#out).then((secs) => { this.#secs = secs; return secs; });
  }
  async extractAll(secs = this.#secs) {
    let arr = [], s, bytes = 0, bytesStored = 0, time = (new Date()).getTime();
    for (let i = 0, l = secs.length; i < l; i++) {
      s = await secs[i].extract();
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
