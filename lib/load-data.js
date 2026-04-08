import fs from 'node:fs/promises';
import path from 'node:path';

export default async function fromFile() {
  const filename = path.resolve(import.meta.dirname, '../data/tz.bin');
  return fromBuffer(await fs.readFile(filename));
}

function fromBuffer(buffer) {
  const len = buffer.length;
  const ab = new ArrayBuffer(len);
  let u = 0;

  const uints = new Uint16Array(ab);

  for (let i = 0; i < len; i += 2) uints[u++] = buffer.readUInt16BE(i, false);

  return uints;
}
