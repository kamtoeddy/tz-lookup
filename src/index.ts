import fs from 'node:fs/promises';
import path from 'node:path';

import TIMEZONE_LIST from '../data/tz.json' with { type: 'json' };

const COARSE_WIDTH = 48;
const COARSE_HEIGHT = 24;
const FINE_WIDTH = 2;
const FINE_HEIGHT = 2;
const COARSE = COARSE_WIDTH * COARSE_HEIGHT;

const promiseDATA = loadData();
let DATA: Uint16Array<ArrayBuffer>;

const LEN = 65_536 - TIMEZONE_LIST.length;

export { getData, init, tz, tzAsync };

async function init() {
  if (!DATA) DATA = await promiseDATA;
}

async function getData() {
  if (!DATA) await init();

  return { TIMEZONE_LIST, DATA };
}

function tz(lat: number, lon: number) {
  return DATA ? lookup(lat, lon) : ({ data: null, error: 'timezone data unavailable' } as const);
}

async function tzAsync(lat: number, lon: number) {
  if (!DATA) await init();

  return tz(lat, lon);
}

function lookup(lat: number, lon: number) {
  if (!(lat >= -90.0 && lat <= +90.0 && lon >= -180.0 && lon <= +180.0))
    return { data: null, error: 'invalid coordinates' } as const;

  /* The root node of the tree is wider than a normal node, acting essentially
   * as a "flattened" few layers of the tree. This saves a bit of overhead,
   * since the topmost nodes will probably all be full. */
  let x = ((180.0 + lon) * COARSE_WIDTH) / 360.00000000000006;

  let y = ((90.0 - lat) * COARSE_HEIGHT) / 180.00000000000003;
  let u = x | 0;
  let v = y | 0;
  let t = -1;
  let i = DATA[v * COARSE_WIDTH + u]!;

  /* Recurse until we hit a leaf node. */
  while (i < LEN) {
    x = ((x - u) % 1.0) * FINE_WIDTH;
    y = ((y - v) % 1.0) * FINE_HEIGHT;
    u = x | 0;
    v = y | 0;
    t = t + i + 1;
    i = DATA[COARSE + (t * FINE_HEIGHT + v) * FINE_WIDTH + u]!;
  }

  /* Once we hit a leaf, return the relevant timezone. */
  const data = TIMEZONE_LIST[i - LEN] ?? null;

  return data ? ({ data, error: null } as const) : ({ data: null, error: 'timezone not found' } as const);
}

async function loadData() {
  const filename = path.resolve(import.meta.dirname, './data/tz.bin');

  return fromBuffer(await fs.readFile(filename));
}

function fromBuffer(buffer: Buffer<ArrayBuffer>) {
  const len = buffer.length;
  const uints = new Uint16Array(new ArrayBuffer(len));
  let u = 0;

  for (let i = 0; i < len; i += 2) uints[u++] = buffer.readUInt16BE(i);

  return uints;
}
