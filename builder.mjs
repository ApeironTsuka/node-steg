import { Writable } from 'node:stream';
import { Image } from './image.mjs';

async function readStdin() {
  let res, p = new Promise((r,r2) => { res = r; }), buffers = [], f;
  process.stdin.resume();
  process.stdin.setRawMode(true);
  process.stdin.on('data', f = (chunk) => {
    let ind;
    // handle ctrl+c
    if (chunk[0] == 0x03) { process.stdout.write('\n'); process.exit(); }
    // handle backspace
    else if (chunk[0] == 0x7f) {
      let bufNum = buffers.length - 1, lastBuf = buffers[bufNum], lastChar;
      if (!lastBuf) { return; }
      ind = 0;
      while ((lastChar = lastBuf[lastBuf.length - 1 - ind]) == 0) {
        if ((lastBuf.length - 1 - ind) == 0) {
          bufNum--;
          lastBuf = buffers[bufNum];
          if (!lastBuf) { return; }
          ind = 0;
          continue;
        }
        ind++;
      }
      lastBuf[lastBuf.length - 1 - ind] = 0;
    }
    // ignore escape sequences (often arrow keys) but print warning
    else if (chunk[0] == 0x1b) {
      if (chunk[1] == 0x5b) {
        switch (chunk[2]) {
          case 0x41: case 0x42: case 0x43: case 0x44: console.log('This simple reader does not support arrow keys; ignoring'); return;
          default: break;
        }
      }
      console.log('This simple reader does not support escape sequences; ignoring');
    }
    // handle enter
    else if (((ind = chunk.indexOf(0x0d)) != -1) ||
             ((ind = chunk.indexOf(0x0a)) != -1) ||
             ((ind = chunk.indexOf(0x04)) != -1)) {
      let r;
      buffers.push(chunk.subarray(0, ind));
      chunk.fill(0);
      r = Buffer.concat(buffers);
      for (let i = 0, l = buffers.length; i < l; i++) { buffers[i].fill(0); }
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.off('data', f);
      process.stdout.write('\n');
      res(r);
    } else { buffers.push(chunk); }
  });
  return p;
}
export class Builder {
  #pwcb = null;
  useThreads(b = true) { Image.useThreads = b; return this; }
  setPasswordHandler(f) { this.#pwcb = f; return this; }
  getPasswordHandler() {
    return () => {
      if (!this.#pwcb) { throw new Error('No password handler registered'); }
      return this.#pwcb();
    };
  }
  cliPasswordHandler() {
    return this.setPasswordHandler(() => {
      process.stdout.write('Enter password: ');
      return readStdin();
    });
  }
}
