import _PNG from 'pngjs';
import fs from 'fs';
import { randr, print, Channels, binToDec, decToBin, pad, uintToVLQ, bitShuffle, bitUnshuffle } from './util.mjs';
import consts from './consts.mjs';
import WebP from 'node-webpmux';
import { dirname, basename } from 'path';
const PNG = _PNG.PNG;

export class Image {
  static map = {};
  constructor() { this.rand = new randr(); this.shuffle = new randr(); this.loaded = false; }
  async load(o) {
    let { path, buffer, name, map, frame } = o, type;
    if (typeof o === 'string') { path = o; name = basename(o); }
    if ((!path) && (!buffer)) { throw new Error('Must provide path or buffer (provided neither)'); }
    if ((path) && (buffer)) { throw new Error('Must provide path or buffer (provided both)'); }
    if (path) {
      if (/\.png$/i.test(path)) { type = 'png'; }
      else if (/\.webp$/i.test(path)) {
        if (typeof o === 'string') {
          if (/^frame\|[0-9]\|/i.test(path)) {
            let arr = path.split('|');
            frame = parseInt(arr[1]);
            path = path.substr(arr[1].length+7);
          }
        }
        this.type = 'webp';
      }
      else { throw new Error(`Unknown image ext for "${path}"`); }
    } else if (name) {
      if (/\.png$/i.test(name)) { type = 'png'; }
      else if (/\.webp$/i.test(name)) { type = 'webp'; }
      else { throw new Error(`Unknown image ext for "${name}"`); }
    } else { throw new Error('Must provide either `path` or `name`'); }
    if (type == 'png') { await this.#loadPNG(path ? path : buffer); }
    else {
      let webp;
      if (frame != -1) { this.frame = frame; }
      if (path) {
        let bn = basename(path);
        if (Image.map[bn]) { webp = Image.map[bn]; path = webp.path; }
        else { webp = Image.map[bn] = await this.#loadWEBP(path); }
      }
      else if (buffer) { webp = await this.#loadWEBP(buffer); }
      await this.#loadWEBPData(webp, frame);
      this.webp = webp;
    }
    this.isBuffer = !!buffer;
    this.data = this.img.data;
    this.used = { count: 0, max: this.width * this.height };
    this.state = {};
    this.rand.seed = -1;
    this.shuffle.seed = -1;
    this.loaded = true;
    this.src = path || name;
    this.alphaThresh = 255;
    this.cursor = { x: 0, y: 0 };
    this.buf = '';
    this.mode = consts.MODE_3BPP;
    this.modeMask = consts.MODEMASK_RGB;
    this.actions = [];
    if (map) { this.loadMap(typeof map == 'string' ? { path: map } : map); }
  }
  loadMap(o) {
    let { path, buffer, name } = o, buf, { used } = this, start = 0;
    if (path) {
      try { buf = fs.readFileSync(path); }
      catch (e) { buf = fs.readFileSync(`${dirname(this.src)}/${path}`); }
    }
    else { buf = buffer; }
    if (buf.toString('utf8', 0, 5) == 'STGIM') { start = 5; } // FIXME throw error in v1.5 if != 'STGIM'
    for (let i = start, l = buf.length; i < l; i += 4) {
      let x = buf.readUInt16LE(i), y = buf.readUInt16LE(i+2);
      used.count++;
      used[`${x},${y}`] = true;
    }
    if (this.master) { this.advanceCursor(); }
  }
  async save(o) {
    let { path, buffer, mapOut: map } = o, buf;
    switch (this.type) {
      case consts.IMGTYPE_PNG: buf = await this.#savePNG(path); break;
      case consts.IMGTYPE_WEBP:
      case consts.IMGTYPE_WEBPANIM: buf = await this.#saveWEBP(path); break;
    }
    if (buf) { this.buffer = buf; }
    if (map) { this.saveMap(typeof map == 'string' ? { path: map } : map); }
  }
  saveMap(o) {
    let { used } = this, keys = Object.keys(used), buf = Buffer.alloc(5 + ((keys.length - 2) * 4)), c = 5;
    let { path, buffer, name } = o;
    buf.write('STGIM', 0);
    for (let i = 0, l = keys.length; i < l; i++) {
      if (!/,/.test(keys[i])) { continue; }
      let [x, y] = keys[i].split(',');
      buf.writeUInt16LE(parseInt(x), c);
      buf.writeUInt16LE(parseInt(y), c + 2);
      c += 4;
    }
    if (path) { fs.writeFileSync(path, buf); }
    else if (buffer) { this.mapBuffer = buf; }
  }
  get width() { return this.img.width; }
  get height() { return this.img.height; }
  check() {
    switch (this.type) {
      case consts.IMGTYPE_PNG: return true;
      case consts.IMGTYPE_WEBP: return this.webp.type == WebP.TYPE_LOSSLESS;
      case consts.IMGTYPE_WEBPANIM: return this.webp.frames[this.frame].type == WebP.TYPE_LOSSLESS;
      default: return false;
    }
  }
  setMode(mode) { if ((this.buf != '') && (this.master.writing)) { this.actions.push([0, mode]); } else { this.mode = mode; } }
  setModeMask(mask) { if ((this.buf != '') && (this.master.writing)) { this.actions.push([3, mask]); } else { this.modeMask = mask; } }
  setCursor(x, y) { if ((this.buf != '') && (this.master.writing)) { this.actions.push([2, x, y]); } else { this.cursor.x = x; this.cursor.y = y; } }
  flush() { if ((this.buf != '') || (this.actions.length)) { this.writeBits('', true); } }
  clear() { this.buf = ''; }
  resetCursor(full) {
    let r = this.state.rand ? this.state.rand : this.rand, rect = this.state.rect;
    if ((!this.state.rand) && (this.rand.seed == -1)) { if (full) { if (rect) { this.setCursor(rect.x, rect.y); } } }
    else if (this.state.rect) { this.setCursor(r.gen(rect.w) + rect.x, r.gen(rect.h) + rect.y); }
    else { this.setCursor(r.gen(this.width), r.gen(this.height)); }
  }
  advanceCursor() {
    let { rect, rand } = this.state,
        { master, img } = this,
        { x, y } = this.cursor,
        imgw, imgh, imgx, imgy;
    if (!rect) { imgx = imgy = 0; imgw = img.width; imgh = img.height; }
    else { imgx = rect.x; imgy = rect.y; imgw = rect.w; imgh = rect.h; }
    if ((rand) || (master.rand.seed != -1)) {
      let r = rand?rand:master.rand;
      if (rect) { if (rect.used >= (imgw * imgh) * 0.95) { throw new Error('End of rect'); } }
      while (this.used[`${x},${y}`]) { x = r.gen(imgw) + imgx; y = r.gen(imgh) + imgy; }
    } else {
      while (this.used[`${x},${y}`]) {
        x++;
        if (x >= imgw + imgx) { x = imgx; y++; if (y >= imgh + imgy) { throw new Error('End of image'); } }
      }
    }
    this.cursor.x = x; this.cursor.y = y;
  };
  writePixel(data) {
    let { x, y } = this.cursor, { img, data: d, alphaThresh, mode, modeMask } = this, w = img.width, pind = (y * (w * 4)) + (x * 4);
    let v = [d[pind], d[pind + 1], d[pind + 2], d[pind + 3]], { checkMode } = Image, k, m, f = [], bits, off = 0,
        maskCount = ((modeMask & 4 ? 1 : 0) + (modeMask & 2 ? 1 : 0) + (modeMask & 1 ? 1 : 0)) - 1;
    let chkChannel = (c) => { return (c == 3) || (modeMask & (1 << (2 - c))); },
        write = (c, bits, o) => {
          let d = bits / 3, tbits = (1 << d) - 1, shift;
          switch (bits) {
            case 32:
              shift = (maskCount - o + 1) * 8;
              v[c] = (data & (255 << shift)) >> shift;
              if (v[c] < 0) { v[c] += 256; }
              break;
            default:
              shift = (maskCount * d) - (o * d);
              v[c] = (v[c] & ~tbits) | ((data & (tbits << shift)) >> shift);
              break;
          }
        };
    if ((m = (mode & (7 << 3)) >> 3) == 0) {
      if (v[3] < alphaThresh) { return false; }
      else if ((v[3] == 0) && (alphaThresh == 0)) { return false; }
    }
    else if ((v[3] >= alphaThresh) && ((m = mode & 7) == 0)) { return false; }
    m = v[3] < alphaThresh || (v[3] == 0 && alphaThresh == 0) ? (mode & (7 << 3)) >> 3 : mode & 7;
    if (checkMode(m, consts.MODE_3BPP)) { for (let i = 0; i < 3; i++) { if (chkChannel(i)) { write(i, 3, off); off++; } } bits = 3; }
    else if (checkMode(m, consts.MODE_6BPP)) { for (let i = 0; i < 3; i++) { if (chkChannel(i)) { write(i, 6, off); off++; } } bits = 6; }
    else if (checkMode(m, consts.MODE_9BPP)) { for (let i = 0; i < 3; i++) { if (chkChannel(i)) { write(i, 9, off); off++; } } bits = 9; }
    else if (checkMode(m, consts.MODE_12BPP)) { for (let i = 0; i < 3; i++) { if (chkChannel(i)) { write(i, 12, off); off++; } } bits = 12; }
    else if (checkMode(m, consts.MODE_15BPP)) { for (let i = 0; i < 3; i++) { if (chkChannel(i)) { write(i, 15, off); off++; } } bits = 15; }
    else if (checkMode(m, consts.MODE_24BPP)) { for (let i = 0; i < 3; i++) { if (chkChannel(i)) { write(i, 24, off); off++; } } bits = 24; }
    else if (checkMode(m, consts.MODE_32BPP)) { for (let i = 0; i < 4; i++) { if (chkChannel(i)) { write(i, 32, off); off++; } } bits = 32; }
    let z = bits == 32 ? 8 : (bits / 3) * (maskCount + 1);
    print(Channels.DEBUG, `Overwriting ${x}, ${y} (${d[pind]}, ${d[pind + 1]}, ${d[pind + 2]}, ${d[pind + 3]}) with ${v[0]}, ${v[1]}, ${v[2]}, ${v[3]} (data: ${pad(decToBin(data), z, '0')}, mode: ${m}, mode mask ${modeMask})`);
    for (let i = 0; i < 4; i++) { d[pind + i] = v[i]; }
    return true;
  }
  writeBits(_data, force) {
    const MODE = 0, WRITE = 1, CURSOR = 2, MASK = 3;
    let { img, data: d, mode, modeMask, actions, buf, alphaThresh } = this, { shuffle } = this.state,
        { x, y } = this.cursor, maskCount = 3 - ((modeMask & 4 ? 1 : 0) + (modeMask & 2 ? 1 : 0) + (modeMask & 1 ? 1 : 0)),
        lasta = actions.length - 1, data = _data;
    let chk = (x, y, mode) => {
      let { checkMode } = Image,
          pind = (y * (img.width * 4)) + (x * 4), m,
          v = [d[pind], d[pind + 1], d[pind + 2], d[pind + 3]];
      m = v[3] < alphaThresh || (v[3] == 0 && alphaThresh == 0) ? (mode & (7 << 3)) >> 3 : mode & 7;
      if (checkMode(m, consts.MODE_3BPP)) { return 3 - maskCount; }
      else if (checkMode(m, consts.MODE_6BPP)) { return 6 - (maskCount * 2); }
      else if (checkMode(m, consts.MODE_9BPP)) { return 9 - (maskCount * 3); }
      else if (checkMode(m, consts.MODE_12BPP)) { return 12 - (maskCount * 4); }
      else if (checkMode(m, consts.MODE_15BPP)) { return 15 - (maskCount * 5); }
      else if (checkMode(m, consts.MODE_24BPP)) { return 24 - (maskCount * 8); }
      else if (checkMode(m, consts.MODE_32BPP)) { return 32 - (maskCount * 8); }
      else { return 0; }
    };
    let next = () => { this.advanceCursor(); x = this.cursor.x; y = this.cursor.y; };
    let writePixel = (data, mode) => {
      let { rect } = this.state;
      this.mode = mode;
      if ((rect) && (rect.used == rect.max)) { throw new Error(`Image "${this.src}", using rect, has run out of space`); }
      if (this.used.count == this.used.max) { throw new Error(`Image "${this.src}" has run out of space`); }
      while (!this.writePixel(binToDec(data))) {}
      if (rect) { rect.used++; }
      this.used.count++;
      this.used[`${x},${y}`] = true;
      next();
    };
    if ((shuffle) || (this.shuffle.seed != -1)) {
      let x = bitShuffle(shuffle || this.shuffle, data);
      print(Channels.DEBUG, `Shuffling bits. Original ${data}, result ${x}`);
      data = x;
    }
    if (actions.length == 0) { buf += data; }
    else if (lasta != -1) {
      if (actions[lasta][0] == WRITE) { actions[lasta][1] += data; }
      else { actions.push([WRITE, data]); lasta++; }
    }
    
    while (true) {
      let n = chk(x, y, mode);
      while (n == 0) {
        this.used[`${x},${y}`] = true;
        next();
        n = chk(x, y, mode);
      }
      if ((force) && (buf.length < n) && (buf.length > 0)) { while (buf.length < n) { buf += '0'; } }
      if (buf.length >= n) { writePixel(buf.substr(0, n), mode); buf = buf.substr(n); }
      else {
        if (actions.length) {
          if (actions[0][0] == MODE) { mode = actions[0][1]; print(Channels.VERBOSE, 'Mode changed'); actions.shift(); }
          else if (actions[0][0] == CURSOR) { this.cursor.x = actions[0][1]; this.cursor.y = actions[0][2]; actions.shift(); }
          else if (actions[0][0] == WRITE) { buf += actions[0][1]; actions.shift(); }
          else if (actions[0][0] == MASK) { modeMask = actions[0][1]; print(Channels.VERBOSE, 'Mode mask changed'); actions.shift(); }
          else { this.buf = buf; this.mode = mode; this.modeMask = modeMask; break; }
        } else { this.buf = buf; this.mode = mode; this.modeMask = modeMask; break; }
      }
    }
  }
  writeString(s) {
    let os = '', b = Buffer.from(s);
    for (let i = 0, l = b.length; i < l; i++) { os += pad(decToBin(b[i]), 8, '0'); }
    os += '00000000';
    return this.writeBits(os);
  }
  writeInt(n, s) { return this.writeBits(pad(decToBin(n), s, '0')); }
  writeVLQ(n, s) {
    let b = uintToVLQ(n, s), os = '';
    for (let i = 0, l = b.length; i < l; i++) { os += pad(decToBin(b[i]), s, '0'); }
    return this.writeBits(os);
  }
  readPixel(silent = false) {
    let { x, y } = this.cursor;
    let { img, data: d, alphaThresh, mode, modeMask } = this, pind = (y * (img.width * 4)) + (x * 4);
    let v = [d[pind], d[pind + 1], d[pind + 2], d[pind + 3]];
    let { checkMode } = Image;
    let s = '', k, m, read = false;
    let chkChannel = (c) => { return (c == 3) || (modeMask & (1 << (2 - c))); };
    if ((m = (mode & (7 << 3)) >> 3) == 0) {
      if (v[3] < alphaThresh) { return ''; }
      else if ((v[3] == 0) && (alphaThresh == 0)) { return ''; }
    }
    else if ((v[3] >= alphaThresh) && ((m = mode & 7) == 0)) { return ''; }
    m = v[3] < alphaThresh || (v[3] == 0 && alphaThresh == 0) ? (mode & (7 << 3)) >> 3 : mode & 7;
    for (let i = 0; i < 4; i++) {
      if (!chkChannel(i)) { continue; }
      read = true;
      k = pad(decToBin(v[i]), 8, '0');
      if (i < 3) {
        if (checkMode(m, consts.MODE_3BPP)) { s += k.substr(-1); }
        else if (checkMode(m, consts.MODE_6BPP)) { s += k.substr(-2); }
        else if (checkMode(m, consts.MODE_9BPP)) { s += k.substr(-3); }
        else if (checkMode(m, consts.MODE_12BPP)) { s += k.substr(-4); }
        else if (checkMode(m, consts.MODE_15BPP)) { s += k.substr(-5); }
        else if (checkMode(m, consts.MODE_24BPP)) { s += k; }
        else if (checkMode(m, consts.MODE_32BPP)) { s += k; }
      } else if (checkMode(m, consts.MODE_32BPP)) { s += k; }
    }
    if ((!silent) && (read)) { print(Channels.DEBUG, `Read pixel ${x}, ${y} (${v[0]}, ${v[1]}, ${v[2]}, ${v[3]}) (data: ${s}, mode: ${m}, mode mask: ${modeMask})`); }
    return s;
  }
  readBits(count) {
    let { x, y } = this.cursor,
        { img, data: d, master, buf } = this,
        { rect, shuffle } = this.state, k;
    let next = () => { this.advanceCursor(); x = this.cursor.x; y = this.cursor.y; };
    if (count == 0) { this.used[`${x},${y}`] = true; next(); return; }
    while (buf.length < count) {
      k = this.readPixel();
      if (k != '') {
        buf += k;
        if (rect) { rect.used++; }
        this.used.count++;
      }
      this.used[`${x},${y}`] = true;
      next();
    }
    k = buf.substr(0, count);
    this.buf = buf.substr(count);
    print(Channels.DEBUG, `Read ${count} bits and got ${k}`);
    if ((shuffle) || (this.shuffle.seed != -1)) {
      k = bitUnshuffle(shuffle || this.shuffle, k);
      print(Channels.DEBUG, `Bits were shuffled. Unshuffled: ${k}`);
    }
    return k;
  }
  readString() {
    let s = '', b;
    while (true) {
      b = this.readBits(8);
      if (b == '00000000') { break; }
      s += binToDec(b).toString(16);
    }
    return Buffer.from(s, 'hex').toString();
  }
  readInt(s) { return binToDec(this.readBits(s)); }
  readVLQ(c) {
    let s = '', last = false, b;
    while (!last) {
      b = this.readBits(c);
      if (b[0] == '1') { last = true; }
      s = b.substr(1) + s;
    }
    return binToDec(s);
  }
  static checkMode(m, c) { return (m & 7) == c; }
  static resetMap() { delete Image.map; Image.map = {}; }

  async #loadPNG(d) {
    let img = d;
    if (typeof d === 'string') { img = fs.readFileSync(d); }
    this.img = PNG.sync.read(img);
    this.type = consts.IMGTYPE_PNG;
  }
  async #savePNG(p) {
    let b = PNG.sync.write(this.img, { deflateLevel: 9 });
    if (this.isBuffer) { return b; }
    else { fs.writeFileSync(p, b); }
  }

  async #loadWEBP(p) {
    let webp = new WebP.Image();
    await webp.load(p);
    return webp;
  }
  async #loadWEBPData(webp, frame = -1) {
    await webp.initLib();
    if (frame == -1) {
      this.type = consts.IMGTYPE_WEBP;
      this.img = { width: webp.width, height: webp.height, data: await webp.getImageData() };
    }
    else {
      if ((frame < 0) || (frame >= webp.frames.length)) { throw new Error(`Frame ${frame} out of range (0-${webp.frameCount}) of animated webp "${p}"`); }
      let f = webp.frames[frame];
      this.type = consts.IMGTYPE_WEBPANIM;
      this.img = { width: f.width, height: f.height, data: await webp.getFrameData(frame) };
    }
  }
  async #saveWEBP(p) {
    let d = this.img.data;
    switch (this.type) {
      case consts.IMGTYPE_WEBP:
        await this.webp.setImageData(this.img.data, { width: this.img.width, height: this.img.height, lossless: 9, exact: true });
        break;
      case consts.IMGTYPE_WEBPANIM:
        await this.webp.setFrameData(this.frame, this.img.data, { width: this.img.width, height: this.img.height, lossless: 9, exact: true });
        break;
    }
    if (this.isBuffer) { return await this.webp.save(null); }
    else { await this.webp.save(p); }
  }
}

