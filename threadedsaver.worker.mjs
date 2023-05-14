import fs from 'node:fs';
import { parentPort, workerData } from 'node:worker_threads';
import _PNG from 'pngjs';
import WebP from 'node-webpmux';
import consts from './consts.mjs';

const PNG = _PNG.PNG;

async function savePNG(wd) {
  let b = PNG.sync.write(wd.img, { deflateLevel: 9 });
  if (wd.isBuffer) { return { buffer: b }; }
  else { fs.writeFileSync(wd.p, b); return { buffer: undefined }; }
}
async function saveWEBP(wd) {
  let d = wd.img.data, webp = WebP.Image.from(wd.webp), out;
  await WebP.Image.initLib();
  switch (wd.type) {
    case consts.IMGTYPE_WEBP:
      await webp.setImageData(wd.img.data, { width: wd.img.width, height: wd.img.height, lossless: 9, exact: true });
      out = { frame: -1, data: webp.data };
      break;
    case consts.IMGTYPE_WEBPANIM:
      await webp.setFrameData(wd.frame, wd.img.data, { width: wd.img.width, height: wd.img.height, lossless: 9, exact: true });
      out = { frame: wd.frame, data: webp.frames[wd.frame] };
      break;
  }
  return { buffer: undefined, frame: out.frame, data: out.data };
}
async function saveWEBPFinal(wd) {
  let webp = WebP.Image.from(wd.webp);
  if (wd.isBuffer) { return { buffer: await webp.save(null) }; }
  else { await webp.save(wd.p); return { buffer: undefined }; }
}
switch (workerData.type) {
  case consts.IMGTYPE_PNG: parentPort.postMessage(await savePNG(workerData)); break;
  case consts.IMGTYPE_WEBP:
  case consts.IMGTYPE_WEBPANIM: parentPort.postMessage(await saveWEBP(workerData)); break;
  case consts.IMGTYPE_WEBPFINAL: parentPort.postMessage(await saveWEBPFinal(workerData)); break;
}
