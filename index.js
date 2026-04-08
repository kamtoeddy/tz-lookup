import loadData from '#load-data';
import TIMEZONE_LIST from './data/tz.json' with { type: 'json' };

const COARSE_WIDTH = 48;
const COARSE_HEIGHT = 24;
const FINE_WIDTH = 2;
const FINE_HEIGHT = 2;
const COARSE = COARSE_WIDTH * COARSE_HEIGHT;

const promiseDATA = loadData();
let DATA;

const LEN = 65536 - TIMEZONE_LIST.length;

export async function init() {
  if (!DATA) DATA = await promiseDATA;
}

export async function getData() {
  if (!DATA) await init();

  return { TIMEZONE_LIST, DATA };
}

export function tz(lat, lon) {
  if (DATA) return lookup(lat, lon);
}

export async function tzAsync(lat, lon) {
  if (!DATA) await init();

  return lookup(lat, lon);
}

function lookup(lat, lon) {
  if (!(lat >= -90.0 && lat <= +90.0 && lon >= -180.0 && lon <= +180.0)) throw new RangeError('invalid coordinates');

  /* The root node of the tree is wider than a normal node, acting essentially
   * as a "flattened" few layers of the tree. This saves a bit of overhead,
   * since the topmost nodes will probably all be full. */
  let x = ((180.0 + lon) * COARSE_WIDTH) / 360.00000000000006;

  let y = ((90.0 - lat) * COARSE_HEIGHT) / 180.00000000000003;
  let u = x | 0;
  let v = y | 0;
  let t = -1;
  let i = DATA[v * COARSE_WIDTH + u];

  /* Recurse until we hit a leaf node. */
  while (i < LEN) {
    x = ((x - u) % 1.0) * FINE_WIDTH;
    y = ((y - v) % 1.0) * FINE_HEIGHT;
    u = x | 0;
    v = y | 0;
    t = t + i + 1;
    i = DATA[COARSE + (t * FINE_HEIGHT + v) * FINE_WIDTH + u];
  }

  /* Once we hit a leaf, return the relevant timezone. */
  return TIMEZONE_LIST[i - LEN];
}
