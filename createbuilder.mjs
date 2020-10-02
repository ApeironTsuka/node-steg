import v1 from './specs/v1.mjs';
export const LATEST_MAJOR = 1, LATEST_MINOR = 1;
export default function CreateBuilder(verMajor = LATEST_MAJOR, verMinor = LATEST_MINOR) {
  switch (verMajor) {
    case 1: return new v1.Builder(verMajor, verMinor);
    default: throw new Error(`Unknown version ${verMajor}.x`);
  }
}

