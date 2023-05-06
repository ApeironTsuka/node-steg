import { Worker } from 'node:worker_threads';
import consts from './consts.mjs';

function spawnWorker(data) {
  return new Promise((res, rej) => {
    let worker = new Worker('./threadedsaver.worker.mjs', { workerData: data });
    worker.on('message', res);
    worker.on('error', rej);
    worker.on('exit', (code) => { if (code != 0) { rej(new Error(`Worker stopped with exit code ${code}`)); } });
  });
}
export class ThreadedSaver {
  static async save(list) {
    let proms = [], webps = [], listmap = new Map(), out;
    for (let i = 0, l = list.length; i < l; i++) {
      let img = list[i]._img;
      delete list[i]._img;
      listmap.set(img, { isBuffer: list[i].isBuffer, p: list[i].p, webp: list[i].webp });
      proms.push(spawnWorker(list[i]).then((b) => {
        if (b.buffer) { img.buffer = Buffer.from(b.buffer); }
        if (b.data) {
          if (webps.indexOf(img) == -1) { webps.push(img); }
          if (b.frame == -1) { img.webp.data = b.data; }
          else { img.webp.frames[b.frame] = b.data; }
        }
        return img;
      }));
    }
    out = await Promise.all(proms);
    proms.length = 0;
    for (let i = 0, l = webps.length; i < l; i++) {
      let img = webps[i], listi = listmap.get(img);
      listi.webp = img.webp;
      listi.type = consts.IMGTYPE_WEBPFINAL;
      proms.push(spawnWorker(listi).then((b) => { if (b.buffer) { img.buffer = Buffer.from(b.buffer); } }));
    }
    if (proms.length) { await Promise.all(proms); }
    return out;
  }
}

