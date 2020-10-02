import { util, consts, CreateBuilder } from 'steg';
import _PNG from 'pngjs';
import fs from 'fs';

const { PNG } = _PNG;
const verMajor = 1, verMinor = 1;

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

console.log('Testing saving...');
steg.inputImage('frame|0|tests/orig.webp')
    .outputImage('tests/out.webp')
    .cliPasswordHandler()
    .setGlobalAlphaBounds(consts.ALPHA_40)
    .setGlobalMode(consts.MODE_A24BPP | consts.MODE_9BPP)
    .setGlobalModeMask(consts.MODEMASK_RB)
    .setCompression(consts.COMP_BROTLI, 11, true)
    .setEncryption(consts.CRYPT_AES256)
    .setImageTable(['frame|1|tests/orig.webp', 'frame|0|tests/orig.webp'], ['frame|1|tests/out.webp', 'frame|0|tests/out.webp'])
    .moveImage(0)
    .addDirectory('node_modules/steg', true, true)
    .addFile('tests/test.mjs', 'tests/test.mjs')
    .moveImage(1)
    .addText('This is the full source code to extract this image', consts.TEXT_HONOR_COMPRESSION | consts.TEXT_HONOR_ENCRYPTION)
    .save()
    .catch(console.log)
    .then(() => console.log('Testing loading...'))
    .then(() => steg.clear().inputImage('frame|0|tests/out.webp')
    .cliPasswordHandler()
    .load()
    .then((secs) => { console.log('Finished loading\nExtracting...'); return steg.extractAll(secs); })
    .then(console.log));
