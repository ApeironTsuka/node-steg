import readline from 'readline';
import { Writable } from 'stream';
import { Image } from './image.mjs';
const mutableStdout = new Writable({ write: function (chunk, encoding, cb) { if (!this.muted) { process.stdout.write(chunk, encoding); } cb(); } });
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
      return new Promise((res, rej) => {
        let rl = readline.createInterface({ input: process.stdin, output: mutableStdout, terminal: true });
        rl.question('Enter password: ', (pw) => { res(pw); rl.close(); console.log(''); mutableStdout.muted = false; });
        mutableStdout.muted = true;
      });
    });
  }
}
