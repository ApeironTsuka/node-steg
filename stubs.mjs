export class Steg {
  get #VERSION_MAJOR() { return 0; }
  get #VERSION_MINOR() { return 0; }
  async save(input) { throw new Error(`Unimplemented func ::save`); }
  async load(input) { throw new Error(`Unimplemented func ::load`); }
}
export class StegFile {
  get name() { throw new Error(`Unimplemented func ::name`); }
  get size() { throw new Error(`Unimplemented func ::size`); }
  get state() { throw new Error(`Unimplemented func ::state`); }
  async extract(path = './extracted') { throw new Error(`Unimplemented func ::extract`); }
}
export class StegPartialFile extends StegFile {
  get name() { throw new Error(`Unimplemented func ::name`); }
  get size() { throw new Error(`Unimplemented func ::size`); }
  get state() { throw new Error(`Unimplemented func ::state`); }
  async extract(path = './extracted') { throw new Error(`Unimplemented func ::extract`); }
}
export class StegText {
  async extract() { throw new Error(`Unimplemented func ::extract`); }
}

export default { StegFile, StegPartialFile, StegText };
