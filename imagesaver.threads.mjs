import { parentPort, workerData } from 'worker_threads';
import _PNG from 'pngjs';
const PNG = _PNG.PNG;
import WebP from 'node-webpmux';
import fs from 'fs';
import consts from './consts.mjs';
async function savePNG(wd) {
  let b = PNG.sync.write(wd.img, { deflateLevel: 9 });
  if (wd.isBuffer) { return { buffer: b }; }
  else { fs.writeFileSync(wd.p, b); return { buffer: undefined }; }
}
async function saveWEBP(wd) {
  let d = wd.img.data, out;
  let webp = new WebP.Image();
  webp.data = wd.webp.data;
  webp.loaded = wd.webp.loaded;
  webp.path = wd.webp.path;
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
  let webp = new WebP.Image();
  webp.data = wd.webp.data;
  webp.loaded = wd.webp.loaded;
  webp.path = wd.webp.path;
  if (wd.isBuffer) { return { buffer: await webp.save(null) }; }
  else { await webp.save(wd.p); return { buffer: undefined }; }
}
switch (workerData.type) {
  case consts.IMGTYPE_PNG: parentPort.postMessage(await savePNG(workerData)); break;
  case consts.IMGTYPE_WEBP:
  case consts.IMGTYPE_WEBPANIM: parentPort.postMessage(await saveWEBP(workerData)); break;
  case consts.IMGTYPE_WEBPFINAL: parentPort.postMessage(await saveWEBPFinal(workerData)); break;
}
