#!/usr/bin/env node

import fs from 'node:fs';
import { util, consts, CreateBuilder } from '../steg.mjs';
import { StegFile, StegPartialFile, StegText } from '../stubs.mjs';

let debug = false, channel = util.Channels.NORMAL;
function parseCmdLine(args) {
  let state = {}, tester = /^-/;
  let test = (i, t, v) => {
    if ((t) && (i >= args.length)) { return false; }
    else if (tester.test(args[i])) {
      if (t) { return false; }
      throw new Error(`Expected argument, got flag at word ${i} (${args[i-1]} ${args[i]} ${args[i+1]})`);
    }
    if (t) { return (v && v == args[i] ? true : v ? false : true); }
    else { return true; }
  };
  switch (args[0]) {
    case '-pack': state.pack = true; break;
    case '-unpack': state.unpack = true; break;
    default: throw new Error('First argument must be -pack or -unpack');
  }
  if (state.pack) {
    for (let i = 1, l = args.length; i < l; i++) {
      switch (args[i]) {
        case '-silent': channel = util.Channels.SILENT; break;
        case '-v': channel = util.Channels.VERBOSE; break;
        case '-vv': channel = util.Channels.VVERBOSE; break;
        case '-debug': channel = util.Channels.DEBUG; debug = true; break;
        case '-version': case '-ver': test(i + 1); state.version = args[++i]; break;
        case '-headmode': case '-hm': test(i + 1); state.hm = args[++i]; break;
        case '-headmodemask': case '-hmm': test(i + 1); state.hmm = args[++i]; break;
        case '-mode': case '-m': test(i + 1); state.m = args[++i]; break;
        case '-modemask': case '-mm': test(i + 1); state.mm = args[++i]; break;
        case '-salt': test(i + 1); state.salt = args[++i]; if (test(i + 1, true, 'raw')) { state.raw = true; i++; } break;
        case '-alpha': test(i + 1); state.alpha = parseInt(args[++i]); break;
        case '-rand': if (test(i + 1, true)) { state.rand = args[++i]; } else { state.rand = true; } break;
        case '-shuffle': if (test(i + 1, true)) { state.shuffle = args[++i]; } else { state.shuffle = true; } break;
        case '-dryrun': state.dryrun = true; if (test(i + 1, true, 'comp')) { state.dryrunc = true; i++; } break;
        case '-usethreads': state.usethreads = true; break;
        case '-in':
          {
            let frame = -1, map = false, path;
            test(i + 1);
            path = args[++i];
            if (test(i + 1, true)) { frame = args[++i]; }
            if (test(i + 1, true)) { map = args[++i]; }
            if ((frame != -1) && (!/^[0-9]*$/.test(frame))) { map = frame; frame = -1; }
            state.in = { frame: parseInt(frame), map, path };
          }
          break;
        case '-out':
          {
            let frame = -1, map = false, path;
            test(i + 1);
            path = args[++i];
            if (test(i + 1, true)) { frame = args[++i]; }
            if (test(i + 1, true)) { map = args[++i]; }
            if ((frame != -1) && (!/^[0-9]*$/.test(frame))) { map = frame; frame = -1; }
            state.out = { frame: parseInt(frame), map, path };
          }
          break;
        case '-cursor': test(i + 1); test(i + 2); state.cursor = { x: parseInt(args[++i]), y: parseInt(args[++i]) }; break;
        case '-getloadopts': case '-glo': test(i + 1); state.glo = args[++i]; if (test(i + 1, true, 'enc')) { s.gloe = true; i++; } break;
        case '-newsec': case '-ns':
          {
            let s = {};
            if (!state.secs) { state.secs = []; }
            test(++i);
            s.stype = args[i];
            switch (args[i]) {
              case 'file':
                test(i + 1); test(i + 2);
                s.path = args[++i];
                if (test(i + 1, true)) { s.name = args[++i]; }
                if (test(i + 1, true, 'comp')) { s.comp = true; i++; }
                break;
              case 'dir':
                test(i + 1);
                s.path = args[++i];
                if (test(i + 1, true, 'full')) { s.full = true; i++; }
                if (test(i + 1, true, 'recurse')) { s.recurse = true; i++; }
                if (test(i + 1, true, 'comp')) { s.compressed  = true; i++; }
                break;
              case 'rand':
                if (test(i + 1, true)) { s.rand = args[++i]; i++; }
                else { s.rand = true; }
                break;
              case 'shuffle':
                if (test(i + 1, true)) { s.shuffle = args[++i]; i++; }
                else { s.shuffle = true; }
                break;
              case 'imagetable':
                s.table = { in: [], out: [] };
                {
                  let where = 'in', frame = -1, map = false;
                  for (let x = i + 1, xl = l; x < xl; x++) {
                    if (!test(x, true)) {
                      switch (args[x]) {
                        case '-frame': if (test(x + 1)) { frame = parseInt(args[++x]); } break;
                        case '-map': if (test(x + 1)) { map = args[++x]; } break;
                        default: throw new Error(`Unexpected flag ${args[x]}`);
                      }
                      continue;
                    } else {
                      s.table[where].push({ frame, map, path: args[x] });
                      frame = -1;
                      map = false;
                      where = where == 'in' ? 'out' : 'in';
                    }
                    i = x;
                  }
                }
                break;
              case 'rect':
                test(i + 1); test(i + 2); test(i + 3); test(i + 4);
                s.x = parseInt(args[++i]); s.y = parseInt(args[++i]);
                s.w = parseInt(args[++i]); s.h = parseInt(args[++i]);
                break;
              case 'cursor':
                test(i + 1);
                s.cmd = args[++i];
                switch (s.cmd) {
                  case 'push': case 'pop': break;
                  case 'move':
                    test(i + 1); test(i + 2);
                    s.x = parseInt(args[++i]); s.y = parseInt(args[++i]);
                    if (test(i + 1, true)) { s.index = parseInt(args[++i]); }
                    break;
                  case 'image':
                    test(i + 1);
                    s.index = parseInt(args[++i]);
                    break;
                  default: break;
                }
                break;
              case 'compress':
                test(i + 1); test(i + 2);
                s.type = args[++i];
                s.level = parseInt(args[++i]);
                if (test(i + 1, true, 'text')) { s.text = true; i++; }
                break;
              case 'encrypt':
                test(i + 1);
                s.type = args[++i];
                s.kdf = 'argon2id';
                if (test(i + 1, true, 'argon2i')) { s.kdf = 'argon2i'; i++; }
                else if (test(i + 1, true, 'argon2d')) { s.kdf = 'argon2d'; i++; }
                else if (test(i + 1, true, 'argon2id')) { s.kdf = 'argon2id'; i++; }
                else if (test(i + 1, true, 'pbkdf2')) { s.kdf = 'pbkdf2'; i++; }
                else if (test(i + 1, true, 'scrypt')) { s.kdf = 'scrypt'; i++; }
                else if (test(i + 1, true, 'asym')) { s.kdf = 'asym'; i++; }
                if (s.kdf == 'asym') { test(i + 1); s.p = args[++i]; }
                if (test(i + 1, true, 'adv')) {
                  s.adv = true;
                  i++;
                  switch (s.kdf) {
                    case 'argon2i': case 'argon2d': case 'argon2id':
                      test(i + 1); s.memoryCost = args[++i];
                      test(i + 1); s.timeCost = args[++i];
                      test(i + 1); s.parallelism = args[++i];
                      break;
                    case 'pbkdf2':
                      test(i + 1); s.iterations = args[++i];
                      break;
                    case 'scrypt':
                      test(i + 1); s.cost = args[++i];
                      test(i + 1); s.blockSize = args[++i];
                      test(i + 1); s.parallelization = args[++i];
                      break;
                  }
                }
                break;
              case 'partialfile':
                test(i + 1); test(i + 2);
                s.path = args[++i];
                s.index = parseInt(args[++i]);
                if (test(i + 1, true)) { s.name = args[++i]; }
                if (test(i + 1, true, 'comp')) { s.compressed = true; i++; }
                break;
              case 'partialfilepiece':
                test(i + 1); test(i + 2);
                s.index = parseInt(args[++i]);
                s.size = parseInt(args[++i]);
                if (test(i + 1, true, 'final')) { s.final = true; i++; }
                break;
              case 'mode':
                test(i + 1);
                s.mode = args[++i];
                break;
              case 'modemask':
                test(i + 1);
                s.mask = args[++i];
                break;
              case 'alpha':
                test(i + 1);
                s.alpha = parseInt(args[++i]);
                break;
              case 'text':
                test(i + 1);
                s.text = args[++i];
                if (test(i + 1, true)) { s.honor = args[++i]; }
                break;
              default: throw new Error(`Unknown sect ${args[i]}`); break;
            }
            state.secs.push(s);
          }
          break;
        case '-clearsec': case '-cs':
          {
            let s = {};
            s.clear = true;
            test(i + 1);
            s.type = args[++i];
            switch (s.type) {
              case 'rand':
              case 'shuffle':
              case 'imagetable':
              case 'rect':
              case 'compress':
              case 'encrypt':
              case 'mode':
              case 'modemask':
              case 'alpha':
                break;
              default: throw new Error(`Unknown or unclearable sect ${s.type}`); break;
            }
            state.secs.push(s);
          }
          break;
        case '-save': state.save = true; break;
        default: throw new Error(`Unknown flag ${args[i]}`); break;
      }
    }
  } else if (state.unpack) {
    for (let i = 1, l = args.length; i < l; i++) {
      switch (args[i]) {
        case '-silent': channel = util.Channels.SILENT; break;
        case '-v': channel = util.Channels.VERBOSE; break;
        case '-vv': channel = util.Channels.VVERBOSE; break;
        case '-debug': channel = util.Channels.DEBUG; debug = true; break;
        case '-headmode': case '-hm': test(i + 1); state.hm = args[++i]; break;
        case '-headmodemask': case '-hmm': test(i + 1); state.hmm = args[++i]; break;
        case '-image':
          {
            let frame = -1, map = false, path;
            test(i + 1);
            path = args[++i];
            if (test(i + 1, true)) { frame = args[++i]; }
            if (test(i + 1, true)) { map = args[++i]; }
            if ((frame != -1) && (!/^[0-9]*$/.test(frame))) { map = frame; frame = -1; }
            state.image = { frame: parseInt(frame), map, path };
          }
          break;
        case '-rand': test(i + 1); state.rand = args[++i]; break;
        case '-shuffle': test(i + 1); state.shuffle = args[++i]; break;
        case '-cursor': test(i + 1); test(i + 2); state.cursor = { x: parseInt(args[++i]), y: parseInt(args[++i]) }; break;
        case '-salt': test(i + 1); state.salt = args[++i]; if (test(i + 1, true, 'raw')) { state.raw = true; i++; } break;
        case '-setloadopts': case '-slo': test(i + 1); state.slo = args[++i]; if (test(i + 1, true, 'enc')) { s.sloe = true; i++; } break;
        case '-extract': test(i + 1); state.extract = args[++i]; break;
        default: throw new Error(`Unknown flag ${args[i]}`); break;
      }
    }
  }
  return state;
}
function parseMode(m) {
  let v = m.split('/');
  for (let i = 0; i <= 1; i++) {
    switch (v[i]) {
      case '3': v[i] = consts.MODE_3BPP; break;
      case '6': v[i] = consts.MODE_6BPP; break;
      case '9': v[i] = consts.MODE_9BPP; break;
      case '12': v[i] = consts.MODE_12BPP; break;
      case '15': v[i] = consts.MODE_15BPP; break;
      case '24': v[i] = consts.MODE_24BPP; break;
      case '32': v[i] = consts.MODE_32BPP; break;
      default: v[i] = consts.MODE_NONE; break;
    }
  }
  return v[0] | (v[1] << 3);
}
function parseModeMask(m) {
  let out = 0;
  for (let i = 0, l = Math.min(3, m.length); i < l; i++) {
    switch (m[i]) {
      case 'r': out |= consts.MODEMASK_R; break;
      case 'g': out |= consts.MODEMASK_G; break;
      case 'b': out |= consts.MODEMASK_B; break;
      default: break;
    }
  }
  return out;
}
function parseHonor(h) {
  if (!h) { return 0; }
  let s = h.split('/'), o = 0;
  if ((s[0] == 'encrypt') || (s[1] == 'encrypt')) { o |= consts.TEXT_HONOR_ENCRYPTION; }
  if ((s[0] == 'compress') || (s[1] == 'compress')) { o |= consts.TEXT_HONOR_COMPRESSION; }
  return o;
}
async function run() {
  let state = parseCmdLine(process.argv.slice(2));
  let major = consts.LATEST_MAJOR, minor = consts.LATEST_MINOR, bldr;
  util.debug(debug);
  util.setChannel(channel);
  if (state.pack) {
    if (state.version) { let v = state.version.split('.'); bldr = CreateBuilder(parseInt(v[0]), parseInt(v[1])); }
    else { bldr = CreateBuilder(major, minor); }
    bldr.cliPasswordHandler();
    if (state.hm) { bldr.setHeaderMode(parseMode(state.hm)); }
    if (state.hmm) { bldr.setHeaderModeMask(parseModeMask(state.hmm)); }
    if (state.m) { bldr.setGlobalMode(parseMode(state.m)); }
    if (state.mm) { bldr.setGlobalModeMask(parseModeMask(state.mm)); }
    if (state.salt) { bldr.setSalt(state.salt, state.raw); }
    if (state.alpha) { bldr.setGlobalAlphaBounds(Math.max(0, Math.min(7, state.alpha))); }
    if (state.rand) { bldr.setGlobalSeed(state.rand); }
    if (state.shuffle) { bldr.setGlobalShuffleSeed(state.shuffle); }
    if (state.cursor) { bldr.setInitialCursor(state.cursor.x, state.cursor.y); }
    if (state.dryrun) { bldr.dryrun(!!state.dryrunc); }
    if (state.usethreads) { bldr.useThreads(); }
    if (state.in) { bldr.inputImage(state.in); }
    if (state.out) { bldr.outputImage(state.out); }
    if (state.secs) {
      for (let i = 0, { secs } = state, l = secs.length; i < l; i++) {
        let sec = secs[i];
        switch (sec.stype) {
          case 'file': bldr.addFile(sec.path, sec.name, !!sec.compressed); break;
          case 'dir': bldr.addDirectory(sec.path, sec.full, sec.recurse, sec.compressed); break;
          case 'rand':
            if (sec.clear) { bldr.clearSeed(); }
            else if (bldr.rand === true) { bldr.setSeed(decToHash(randomBytes(4).readUInt32LE())); }
            else { bldr.setSeed(bldr.rand); }
            break;
          case 'shuffle':
            if (sec.clear) { bldr.clearShuffleSeed(); }
            else if (bldr.shuffle === true) { bldr.setShuffleSeed(decToHash(randomBytes(4).readUInt32LE())); }
            else { bldr.setShuffleSeed(bldr.shuffle); }
            break;
          case 'imagetable': if (sec.clear) { bldr.clearImageTable(); } else { bldr.setImageTable(sec.table.in, sec.table.out); } break;
          case 'rect': if (sec.clear) { bldr.clearRect(); } else { bldr.setRect(sec.x, sec.y, sec.w, sec.h); } break;
          case 'cursor':
            switch (sec.cmd) {
              case 'push': bldr.pushCursor(); break;
              case 'pop': bldr.popCursor(); break;
              case 'move': bldr.moveCursor(sec.x, sec.y, sec.index); break;
              case 'image': bldr.moveImage(sec.index); break;
              default: throw new Error(`Unknown cursor command ${sec.cmd}`); break;
            }
            break;
          case 'compress':
            if (sec.clear) { bldr.clearCompression(); }
            else {
              switch (sec.type) {
                case 'gzip': bldr.setCompression(consts.COMP_GZIP, sec.level); break;
                case 'brotli': bldr.setCompression(consts.COMP_BROTLI, sec.level, sec.text); break;
                default: throw new Error(`Unknown compression type ${sec.type}`); break;
              }
            }
            break;
          case 'encrypt':
            if (sec.clear) { bldr.clearEncryption(); }
            else {
              let type, kdf, p = undefined;
              switch (sec.type) {
                case 'aes256': type = consts.CRYPT_AES256; break;
                case 'camellia256': type = consts.CRYPT_CAMELLIA256; break;
                case 'aria256': type = consts.CRYPT_ARIA256; break;
                case 'chacha20': type = consts.CRYPT_CHACHA20; break;
                case 'blowfish': type = consts.CRYPT_BLOWFISH; break;
                default: throw new Error(`Unknown encryption type ${sec.type}`); break;
              }
              switch (sec.kdf) {
                case 'pbkdf2': kdf = consts.KDF_PBKDF2; break;
                case 'argon2i': kdf = consts.KDF_ARGON2I; break;
                case 'argon2d': kdf = consts.KDF_ARGON2D; break;
                case 'argon2id': kdf = consts.KDF_ARGON2ID; break;
                case 'scrypt': kdf = consts.KDF_SCRYPT; break;
                case 'asym': kdf = consts.KDF_ASYM; p = fs.readFileSync(sec.p); break;
                default: throw new Error(`Unknown encryption kdf ${sec.kdf}`); break;
              }
              bldr.setEncryption(type, p, kdf, sec);
            }
            break;
          case 'partialfile': bldr.addPartialFile(sec.path, sec.name, sec.index, sec.compressed); break;
          case 'partialfilepiece': bldr.addPartialFilePiece(sec.index, sec.size, sec.final); break;
          case 'mode': if (sec.clear) { bldr.clearMode(); } else { bldr.setMode(parseMode(state.mode)); } break;
          case 'modemask': if (sec.clear) { bldr.clearModeMask(); } else { bldr.setModeMask(parseModeMask(state.mask)); } break;
          case 'alpha': if (sec.clear) { bldr.clearAlphaBounds(); } else { bldr.setAlphaBounds(Math.max(0, Math.min(7, state.alpha))); } break;
          case 'text': bldr.addText(sec.text, parseHonor(sec.honor)); break;
        }
      }
    }
    if (state.glo) { fs.writeFileSync(state.glo, await bldr.getLoadOpts(true, state.gloe), 'binary'); }
    if (state.save) { await bldr.save(); }
  } else if (state.unpack) {
    bldr = CreateBuilder();
    bldr.cliPasswordHandler();
    if (state.hm) { bldr.setHeaderMode(parseMode(state.hm)); }
    if (state.hmm) { bldr.setHeaderModeMask(parseModeMask(state.hmm)); }
    if (state.rand) { bldr.setGlobalSeed(state.rand); }
    if (state.shuffle) { bldr.setGlobalShuffleSeed(state.shuffle); }
    if (state.cursor) { bldr.setInitialCursor(state.cursor.x, state.cursor.y); }
    if (state.salt) { bldr.setSalt(state.salt, state.raw); }
    if (state.image) { bldr.inputImage(state.image); }
    if (state.slo) { await bldr.setLoadOpts(fs.readFileSync(state.slo, 'binary'), true, state.sloe); }
    let secs = await bldr.load();
    if (state.extract) {
      secs = await bldr.extractAll(secs, state.extract);
      if (secs.length) {
        console.log('Text sections:');
        for (let i = 0, l = secs.length; i < l; i++) { console.log(secs[i]); }
      }
    } else {
      for (let i = 0, l = secs.length; i < l; i++) {
        if (secs[i] instanceof StegFile) { console.log(`File\n  Name: ${secs[i].name}\n  Size: ${secs[i].size}${secs[i].compressed?'\n  Compressed':''}${secs[i].encrypted?'\n  Encrypted':''}`); }
        else if (secs[i] instanceof StegPartialFile) { console.log(`Partial File\n  Name: ${secs[i].name}\n  Size: ${secs[i].size}${secs[i].compressed?'\n  Compressed':''}${secs[i].encrypted?'\n  Encrypted':''}\n  Piece count: ${secs[i].count}`); }
        else if (secs[i] instanceof StegText) { console.log(`Text\n  Size: ${secs[i].size}${secs[i].compressed?'\n  Compressed':''}${secs[i].encrypted?'\n  Encrypted':''}`); if (secs[i].size < 100) { console.log('  Text:', await secs[i].extract()); } else { console.log(`  Text length too long to comfortably preview (${secs[i].size})`); } }
      }
    }
  }
}
async function main() { try { await run(); } catch (e) { console.log(e); } }
main().then(()=>{});
