export class Steg {
  get #VERSION_MAJOR() { return 0; }
  get #VERSION_MINOR() { return 0; }
  async save(input) { throw new Error(`Unimplemented func ::save`); }
  async load(input) { throw new Error(`Unimplemented func ::load`); }
}
export class StegFile {
  get name() { throw new Error(`Unimplemented func ::name`); }
  get size() { throw new Error(`Unimplemented func ::size`); }
  get realSize() { throw new Error(`Unimplemented func ::realSize`); }
  get state() { throw new Error(`Unimplemented func ::state`); }
  get compressed() { throw new Error(`Unimplemented func ::compressed`); }
  get encrypted() { throw new Error(`Unimplemented func ::encrypted`); }
  async extract(path = './extracted') { throw new Error(`Unimplemented func ::extract`); }
}
export class StegPartialFile extends StegFile {
  get name() { throw new Error(`Unimplemented func ::name`); }
  get size() { throw new Error(`Unimplemented func ::size`); }
  get realSize() { throw new Error(`Unimplemented func ::realSize`); }
  get state() { throw new Error(`Unimplemented func ::state`); }
  get compressed() { throw new Error(`Unimplemented func ::compressed`); }
  get encrypted() { throw new Error(`Unimplemented func ::encrypted`); }
  get count() { throw new Error(`Unimplemented func ::count`); }
  async extract(path = './extracted') { throw new Error(`Unimplemented func ::extract`); }
}
export class StegText {
  get size() { throw new Error(`Unimplemented func ::size`); }
  get realSize() { throw new Error(`Unimplemented func ::realSize`); }
  get state() { throw new Error(`Unimplemented func ::state`); }
  get compressed() { throw new Error(`Unimplemented func ::compressed`); }
  get encrypted() { throw new Error(`Unimplemented func ::encrypted`); }
  async extract() { throw new Error(`Unimplemented func ::extract`); }
}

export default { StegFile, StegPartialFile, StegText };
