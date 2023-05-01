import { Worker } from 'worker_threads';
import consts from './consts.mjs';
export class ImageSaver {
  static async save(list) {
    let proms = [], webps = [];
    for (let i = 0, l = list.length; i < l; i++) {
      let img = list[i]._img;
      delete list[i]._img;
      img._listi = { isBuffer: list[i].isBuffer, p: list[i].p, webp: list[i].webp };
      let p = new Promise((res, rej) => {
        let worker = new Worker('./imagesaver.threads.mjs', { workerData: list[i] });
        worker.on('message', res);
        worker.on('error', rej);
        worker.on('exit', (code) => { if (code != 0) { rej(new Error(`Worker stopped with exit code ${code}`)); } });
      });
      proms.push(p.then((b) => {
        if (b.buffer) { img.buffer = Buffer.from(b.buffer); }
        if (b.data) {
          if (webps.indexOf(img) == -1) { webps.push(img); }
          if (b.frame == -1) { img.webp.data = b.data; }
          else { img.webp.frames[b.frame] = b.data; }
        } else { delete img._listi; }
        return img;
      }));
    }
    return Promise.all(proms).then(async (list) => {
      let proms = [];
      for (let i = 0, l = webps.length; i < l; i++) {
        let img = webps[i], listi = img._listi;
        listi.webp = img.webp;
        listi.type = consts.IMGTYPE_WEBPFINAL;
        delete img._listi;
        let p = new Promise((res, rej) => {
          let worker = new Worker('./imagesaver.threads.mjs', { workerData: listi });
          worker.on('message', res);
          worker.on('error', rej);
          worker.on('exit', (code) => { if (code != 0) { rej(new Error(`Worker stopped with exit code ${code}`)); } });
        });
        proms.push(p.then((b) => { if (b.buffer) { img.buffer = Buffer.from(b.buffer); } }));
      }
      if (proms.length) { await Promise.all(proms); }
      return list;
    });
  }
}

