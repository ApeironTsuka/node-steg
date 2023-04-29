import v1 from './specs/v1.mjs';
import consts from './consts.mjs';
export default function CreateBuilder(verMajor = consts.LATEST_MAJOR, verMinor = consts.LATEST_MINOR) {
  switch (verMajor) {
    case 1: return new v1.Builder(verMajor, verMinor);
    default: throw new Error(`Unknown version ${verMajor}.x`);
  }
}

