import { util, consts, CreateBuilder } from '../steg.mjs';
import { join as pathJoin } from 'path';
import _PNG from 'pngjs';
import fs from 'fs';
const { PNG } = _PNG;
const verMajor = 1, verMinor = 2;

let debug = false, channel = util.Channels.NORMAL;

function cleanPNG(pathIn, pathOut) {
  let img = PNG.sync.read(fs.readFileSync(pathIn));
  let { width: w, height: h, data } = img;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let n = (y*(w*4))+(x*4);
      if (data[n+3] < 10) { data[n] = data[n+1] = data[n+2] = 0; }
    }
  }
  fs.writeFileSync(pathOut, PNG.sync.write(img, { deflateLevel: 9 }));
}
function noisyPNG(pathIn, pathOut) {
  let img = PNG.sync.read(fs.readFileSync(pathIn));
  let { width: w, height: h, data } = img;
  let rnd = () => { return Math.floor(Math.random()*256); };
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let n = (y*(w*4))+(x*4);
      if (data[n+3] < 10) { data[n] = rnd(); data[n+1] = rnd(); data[n+2] = rnd(); }
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
    case '-clean': cleanPNG(argv[++i], argv[++i]); break;
    case '-noise': noisyPNG(argv[++i], argv[++i]); break;
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
    if (paths[i].isDirectory()) { fs.rmdirSync(`./tests/tmp/${paths[i].name}`, { recursive: true }); }
    else { fs.unlinkSync(`./tests/tmp/${paths[i].name}`); }
  }
}
async function main() { try { await go(); } catch (e) { console.log(e); } }
async function go() {
  let secs;
  steg.cliPasswordHandler();
  try { fs.mkdirSync('tests/tmp'); } catch (e) {}
  console.log('Testing saving...');
  await steg.inputImage('frame|0|tests/orig.webp')
        .outputImage('tests/tmp/out.webp')
        .setGlobalAlphaBounds(consts.ALPHA_40)
        .setGlobalMode(consts.MODE_A24BPP | consts.MODE_9BPP)
        .setGlobalModeMask(consts.MODEMASK_RB)
        .setCompression(consts.COMP_BROTLI, 11, true)
        .setEncryption(consts.CRYPT_AES256)
        .setImageTable(['frame|1|tests/orig.webp', 'frame|0|tests/orig.webp'], ['frame|1|tests/tmp/out.webp', 'frame|0|tests/tmp/out.webp'])
        .moveImage(0)
        .addDirectory('specs', true, true)
        .moveImage(1)
        .addText('This contains the specs for how this image is formatted', consts.TEXT_HONOR_COMPRESSION | consts.TEXT_HONOR_ENCRYPTION)
        .save();
  console.log('Testing loading...');
  steg.clear()
      .inputImage('frame|0|tests/tmp/out.webp')
      .cliPasswordHandler();
  secs = await steg.load();
  console.log('Finished loading\nExtracting...');
  console.log(await steg.extractAll(secs, './tests/tmp'));
  console.log('Testing multipack...');
  fs.writeFileSync('tests/tmp/img.opts', await steg.clear().setHeaderMode(consts.MODE_A24BPP | consts.MODE_9BPP).getLoadOpts(true, true), 'binary');
  console.log('Saving opts file...');
  await steg.clear()
            .inputImage('tests/text.clean.png')
            .outputImage('tests/tmp/out.png')
            .setHeaderMode(consts.MODE_A24BPP | consts.MODE_9BPP)
            .setGlobalMode(consts.MODE_A24BPP | consts.MODE_9BPP)
            .addFile('tests/tmp/img.opts', 'out.opts')
            .keep()
            .save();
  console.log('Saving data...');
  await steg.saveMap('tests/text.clean.png', 'tests/tmp/img.map').clear()
            .inputImage('tests/tmp/out.png')
            .loadMap('out.png', 'tests/tmp/img.map')
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
  await steg.clear().setLoadOpts(fs.readFileSync('tests/tmp/out.opts', 'binary'), true, true);
  secs = await steg.inputImage('tests/tmp/out.png')
                   .loadMap('out.png', 'tests/tmp/img.map')
                   .load();
  console.log(await steg.extractAll(secs, './tests/tmp'));
  cleanTmpDir();
}
main().then(()=>{});
