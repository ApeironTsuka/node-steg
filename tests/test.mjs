import { util, consts, CreateBuilder } from '../steg.mjs';
import { join as pathJoin } from 'path';
import _PNG from 'pngjs';
import fs from 'fs';
const { PNG } = _PNG;
const verMajor = consts.LATEST_MAJOR, verMinor = consts.LATEST_MINOR;

let debug = false, channel = util.Channels.NORMAL;

function cleanPNG(pathIn, pathOut) {
  let img = PNG.sync.read(fs.readFileSync(pathIn));
  let { width: w, height: h, data } = img;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let n = (y * (w * 4)) + (x * 4);
      if (data[n + 3] < 10) { data[n] = data[n + 1] = data[n + 2] = 0; }
    }
  }
  fs.writeFileSync(pathOut, PNG.sync.write(img, { deflateLevel: 9 }));
}
function noisyPNG(pathIn, pathOut) {
  let img = PNG.sync.read(fs.readFileSync(pathIn));
  let { width: w, height: h, data } = img;
  let rnd = () => { return Math.floor(Math.random() * 256); };
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let n = (y * (w * 4)) + (x * 4);
      if (data[n+3] < 10) { data[n] = rnd(); data[n + 1] = rnd(); data[n + 2] = rnd(); }
    }
  }
  fs.writeFileSync(pathOut, PNG.sync.write(img, { deflateLevel: 9 }));
}


for (let i = 0, { argv } = process, l = argv.length; i < l; i++) {
  switch (argv[i]) {
    case '-d': channel = util.Channels.DEBUG; debug = true; break;
    case '-s': channel = util.Channels.SILENT; break;
    case '-v': channel = util.Channels.VERBOSE; break;
    case '-vv': channel = util.Channels.VVERBOSE; break;
    case '-clean': cleanPNG(argv[++i], argv[++i]); process.exit(); break;
    case '-noise': noisyPNG(argv[++i], argv[++i]); process.exit(); break;
    case '-h':
      console.log('USAGE: test.mjs [-d] [-s] [-v[v]] [-clean <in> <out>] [-noise <in> <out>] [-h]');
      console.log('-d: Turn on debugging output');
      console.log('-s: Turn off all output');
      console.log('-v: Turn on verbose output');
      console.log('-vv: Turn on very verbose output');
      console.log('-noisy: Noisy up a PNG. Sets any pixel with an A value < 10 to rnd,rnd,rnd. rnd is a random integer 0-255, generated each time');
      console.log('-clean: Clean a noisy\'d PNG. Sets any pixel with an A value < 10 to 0,0,0');
      process.exit();
      break;
    default: break;
  }
}

util.debug(debug);
util.setChannel(channel);

let steg = CreateBuilder(verMajor, verMinor);
function cleanTmpDir() {
  let paths = fs.readdirSync('./tests/tmp', { withFileTypes: true });
  for (let i = 0, l = paths.length; i < l; i++) {
    if (paths[i].isDirectory()) { fs.rmSync(`./tests/tmp/${paths[i].name}`, { recursive: true }); }
    else { fs.unlinkSync(`./tests/tmp/${paths[i].name}`); }
  }
}
function setBuffer(buf, r, g, b, a) {
  for (let i = 0, l = buf.length; i < l; i += 4) {
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
    buf[i + 3] = a;
  }
}
async function main() { try { await go(); } catch (e) { console.log(e); } }
async function go() {
  let b1 = new Uint8Array(50*50*4), b2 = new Uint8Array(50*50*4), secs, t;
  setBuffer(b1, 0, 255, 0, 255); setBuffer(b2, 0, 255, 0, 255);
  b1 = PNG.sync.write({ width: 50, height: 50, data: b1 }, { deflateLevel: 9 });
  b2 = PNG.sync.write({ width: 50, height: 50, data: b2 }, { deflateLevel: 9 });
  steg.cliPasswordHandler();
  try { fs.mkdirSync('tests/tmp'); } catch (e) {}
  console.log('Testing saving...');
  secs = await steg.inputImage({ path: 'tests/orig.webp', frame: 0 })
        .outputImage('tests/tmp/out.webp')
        .useTempBuffers()
        .setGlobalAlphaBounds(consts.ALPHA_40)
        .setGlobalMode(consts.MODE_A24BPP | consts.MODE_9BPP)
        .setGlobalModeMask(consts.MODEMASK_RB)
        .setCompression(consts.COMP_BROTLI, 11, true)
        .setEncryption(consts.CRYPT_AES256)
        .setImageTable([ { path: 'tests/orig.webp', frame: 1 }, { path: 'tests/orig.webp', frame: 0 } ], [ { path: 'tests/tmp/out.webp', frame: 1 }, { path: 'tests/tmp/out.webp', frame: 0 } ])
        .moveImage(0)
        .addDirectory('specs', true, true)
        .moveImage(1)
        .addText('This contains the specs for how this image is formatted', consts.TEXT_HONOR_COMPRESSION | consts.TEXT_HONOR_ENCRYPTION)
        .save();
  console.log('Testing loading...');
  steg.clear()
      .inputImage({ path: 'tests/tmp/out.webp', frame: 0 })
      .useTempBuffers()
      .cliPasswordHandler();
  secs = await steg.load();
  console.log('Finished loading\nExtracting...');
  console.log(await steg.extractAll(secs, './tests/tmp'));
  console.log('Testing multipack...');
  fs.writeFileSync('tests/tmp/img.opts', await steg.clear().setHeaderMode(consts.MODE_A24BPP | consts.MODE_9BPP).getLoadOpts(true, true), 'binary');
  console.log('Saving opts file...');
  await steg.clear()
            .inputImage('tests/text.clean.png')
            .outputImage({ path: 'tests/tmp/out.png', map: 'tests/tmp/img.map' })
            .setHeaderMode(consts.MODE_A24BPP | consts.MODE_9BPP)
            .setGlobalMode(consts.MODE_A24BPP | consts.MODE_9BPP)
            .addFile('tests/tmp/img.opts', 'out.opts')
            .save();
  console.log('Saving data...');
  await steg.clear()
            .inputImage({ path: 'tests/tmp/out.png', map: 'tests/tmp/img.map' })
            .outputImage('tests/tmp/out.png')
            .setHeaderMode(consts.MODE_A24BPP | consts.MODE_9BPP)
            .setGlobalMode(consts.MODE_A24BPP | consts.MODE_9BPP)
            .addText('Did this work?')
            .save();
  steg.clear()
      .inputImage('tests/tmp/out.png')
      .setHeaderMode(consts.MODE_A24BPP | consts.MODE_9BPP);
  console.log('Extracting opts file...');
  secs = await steg.load();
  await steg.extractAll(secs, './tests/tmp');
  console.log('Extracting data...');
  await steg.clear().setLoadOpts(fs.readFileSync('tests/tmp/out.opts'), true, true);
  secs = await steg.inputImage({ path: 'tests/tmp/out.png', map: 'tests/tmp/img.map' }).load();
  console.log(await steg.extractAll(secs, './tests/tmp'));
  console.log('Testing maps in image tables...');
  console.log('Creating map...');
  await steg.clear()
        .inputImage({ path: 'tests/orig.webp', frame: 0 })
        .outputImage('tests/tmp/out.webp')
        .setImageTable([ { path: 'tests/orig.webp', frame: 1 }, { path: 'tests/orig.webp', frame: 2 } ], [ { path: 'tests/tmp/out.webp', frame: 1 }, { path: 'tests/tmp/out.webp', frame: 2, map: 'tests/tmp/webp.map' } ])
        .moveImage(1)
        .addText('Map created')
        .save();
  console.log('Saving using map...');
  await steg.clear()
        .inputImage({ path: 'tests/tmp/out.webp', frame: 0 })
        .outputImage('tests/tmp/out2.webp')
        .setGlobalMode(consts.MODE_A24BPP | consts.MODE_9BPP)
        .setImageTable([ { path: 'tests/tmp/out.webp', frame: 1 }, { path: 'tests/tmp/out.webp', frame: 2, map: 'tests/tmp/webp.map' } ], [ { path: 'tests/tmp/out2.webp', frame: 1 }, { path: 'tests/tmp/out2.webp', frame: 2 } ])
        .moveImage(1)
        .addText('Did this also work?')
        .save();
  console.log('Testing loading with map...');
  steg.clear().inputImage({ path: 'tests/tmp/out2.webp', frame: 0 });
  secs = await steg.load();
  console.log('Finished loading\nExtracting...');
  console.log(await steg.extractAll(secs, './tests/tmp'));
  console.log('Test using Buffer everywhere...');
  console.log('Saving when input image is a Buffer...');
  secs = await steg.clear()
               .setBufferMap({ 'image.png': b1 })
               .inputImage({ name: 'image.png' })
               .outputImage({ name: 'out.png', buffer: true })
               .addText('Did this work, too?')
               .save();
  console.log('Loading when input image is a Buffer...');
  steg.clear().inputImage({ name: 'out.png', buffer: secs[0].buffer });
  secs = await steg.load();
  console.log('Finished loading\nExtracting...');
  console.log(await steg.extractAll(secs, './tests/tmp'));
  console.log('Saving when input image and image table are all Buffer...');
  secs = await steg.clear()
               .setBufferMap({ 'image.png': b1, 'image2.png': b2 })
               .inputImage({ name: 'image.png' })
               .outputImage({ name: 'out.png', buffer: true })
               .setImageTable([ { name: 'image.png' }, { name: 'image2.png' } ], [ { name: 'out.png', buffer: true }, { name: 'out2.png', buffer: true } ])
               .moveImage(1)
               .addText('This should also have worked')
               .save();
  console.log('Loading when input image and such are all Buffer...');
  secs = await steg.clear()
               .setBufferMap({ 'out.png': secs[0].buffer, 'out2.png': secs[1].buffer })
               .inputImage({ name: 'out.png' })
               .load();
  console.log('Finished loading\nExtracting...');
  console.log(await steg.extractAll(secs, './tests/tmp'));
  console.log('Testing maps in image tables (buffers)...');
  console.log('Creating map...');
  secs = await steg.clear()
               .setBufferMap({ 'image.png': b1, 'image2.png': b2 })
               .inputImage({ name: 'image.png' })
               .outputImage({ name: 'out.png', buffer: true })
               .setImageTable([ { name: 'image.png' }, { name: 'image2.png' } ], [ { name: 'out.png', buffer: true }, { name: 'out2.png', buffer: true, map: { name: 'out2.map', buffer: true } } ])
               .moveImage(1)
               .addText('Map created')
               .save();
  console.log('Saving using map...');
  secs = await steg.clear()
               .setBufferMap({ 'out.png': secs[0].buffer, 'out2.png': secs[1].buffer, 'out2.map': t = secs[1].map.buffer })
               .inputImage({ name: 'out.png' })
               .outputImage({ name: 'out2.webp', buffer: true })
               .setGlobalMode(consts.MODE_A24BPP | consts.MODE_9BPP)
               .setImageTable([ { name: 'out.png' }, { name: 'out2.png', map: { name: 'out2.map' } } ], [ { name: 'out3.png', buffer: true }, { name: 'out4.png', buffer: true } ])
               .moveImage(1)
               .addText('Did this also work again?')
               .save();
  console.log('Testing loading with map...');
  steg.clear()
      .setBufferMap({ 'out3.png': secs[0].buffer, 'out4.png': secs[1].buffer, 'out2.map': t })
      .inputImage({ name: 'out3.png' });
  secs = await steg.load();
  console.log('Finished loading\nExtracting...');
  console.log(await steg.extractAll(secs, './tests/tmp'));
  console.log('Testing input files as buffers...');
  await steg.clear()
        .inputImage('tests/text.clean.png')
        .outputImage('tests/tmp/out.png')
        .addFile(Buffer.from('Testing'), 'testfile')
        .addText('Worked?')
        .save();
  console.log('Testing loading...');
  steg.clear().inputImage('tests/tmp/out.png');
  secs = await steg.load();
  console.log('Finished loading\nExtracting as file...');
  console.log(await steg.extractAll(secs, './tests/tmp'));
  console.log('Extracting as buffer...');
  secs = await secs[0].extract(null);
  console.log(secs, `(${secs})`);
  console.log('Testing bit shuffling...');
  await steg.clear()
        .inputImage('tests/text.clean.png')
        .outputImage('tests/tmp/out.png')
        .setShuffleSeed(1234)
        .addText('Worked?')
        .save();
  console.log('Testing loading...');
  steg.clear().inputImage('tests/tmp/out.png');
  secs = await steg.load();
  console.log('Finished loading\nExtracting as buffer...');
  secs = await secs[0].extract(null);
  console.log(secs);
  console.log('Testing using Argon2id with advanced settings as KDF...');
  await steg.clear()
        .inputImage('tests/text.clean.png')
        .outputImage('tests/tmp/out.png')
        .setEncryption(consts.CRYPT_AES256, undefined, consts.KDF_ARGON2ID, { adv: true, memoryCost: 2 ** 15, parallelism: 1 })
        .addText('Worked?', consts.TEXT_HONOR_ENCRYPTION)
        .save();
  console.log('Testing loading...');
  steg.clear()
      .inputImage('tests/tmp/out.png')
      .cliPasswordHandler();
  secs = await steg.load();
  console.log('Finished loading\nExtracting...');
  console.log(await steg.extractAll(secs, './tests/tmp'));
  cleanTmpDir();
}
main().then(()=>{});
