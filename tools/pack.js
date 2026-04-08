import { writeFile } from 'node:fs/promises';
import { box_overlap, normalize, polygon_overlap } from './lib/geo.js';
import { getHints } from './lib/hints.js';

const COLS = 48;
const ROWS = 24;
const MIN_DEPTH = 3; // Minimum recursion depth to allow lossy compression.
const MAX_DEPTH = 10; // Maximum recursion depth (forcing lossy compression).
const EPS = 1e-6; // Epsilon value for floating-point equality checks.

// NOTE: This value (~0.01°) is arbitrary and ported from a prior version. It
// could easily be tuned smaller or larger if appropriate.

import border_geojson from './border-control.json' with { type: 'json' };
import tz_geojson from './combined.json' with { type: 'json' };
import urban_geojson from './ne_10m_urban_areas.json' with { type: 'json' };

// Make the geojson files consistent.
normalize(tz_geojson);
normalize(urban_geojson);
normalize(border_geojson);

const ALL_HINTS = [
  ...urban_geojson.features,
  ...border_geojson.features,
  // HACK: Add custom urban areas in order to fix reported errors.
  ...getHints()
];

const root = buildTree(tz_geojson);

Promise.all([
  writeFile('tz_data.json', JSON.stringify(root)),
  writeFile('tz.json', JSON.stringify(timezoneList(root)))
]).catch(err => {
  console.error(err);
  process.exit(1);
});

// Build up a tree representing a raster version of the timezone map.
function buildTree(tz_geojson) {
  const root = new Array(COLS * ROWS);

  for (let row = 0; row < ROWS; row++) {
    const min_lat = 90 - ((row + 1) * 180) / ROWS;
    const max_lat = 90 - ((row + 0) * 180) / ROWS;

    for (let col = 0; col < COLS; col++) {
      const min_lon = -180 + ((col + 0) * 360) / COLS;
      const max_lon = -180 + ((col + 1) * 360) / COLS;
      const etc_tzid = maritime_zone(min_lon + (max_lon - min_lon) / 2);

      // Determine which timezones potentially overlap this tile.
      const candidates = tz_geojson.features.filter(feature =>
        box_overlap(feature, min_lat, min_lon, max_lat, max_lon)
      );

      root[row * COLS + col] = tile(candidates, etc_tzid, min_lat, min_lon, max_lat, max_lon, 1);
    }
  }

  return root;
}

// Generate list of timezones.
function timezoneList(root) {
  const tz_set = new Set();

  add(root);

  return Array.from(tz_set).sort();

  function add(node) {
    if (Array.isArray(node)) node.forEach(add);
    else tz_set.add(node);
  }
}

function overlap(features, min_lat, min_lon, max_lat, max_lon) {
  for (const feature of features) {
    if (!box_overlap(feature, min_lat, min_lon, max_lat, max_lon)) continue;

    // HACK: If there's no geometry, we only need to check for box overlap
    if (!feature.geometry) return true;

    if (polygon_overlap(feature, min_lat, min_lon, max_lat, max_lon) >= EPS) return true;
  }
}

function maritime_zone(lon) {
  const x = Math.round(12 - (lon + 180) / 15);

  if (x > 0) return 'Etc/GMT+' + x;
  if (x < 0) return 'Etc/GMT' + x;

  return 'Etc/GMT';
}

function tile(candidates, etc_tzid, min_lat, min_lon, max_lat, max_lon, depth) {
  const mid_lat = min_lat + (max_lat - min_lat) / 2;
  const mid_lon = min_lon + (max_lon - min_lon) / 2;

  const subset = Array.from(
    (function* () {
      for (const candidate of candidates) {
        const overlap = polygon_overlap(candidate, min_lat, min_lon, max_lat, max_lon);

        if (overlap >= EPS) yield [candidate, overlap];
      }
    })()
  );

  // No coverage should not happen?
  if (subset.length === 0) return etc_tzid;

  // One zone means use it.
  if (subset.length === 1) return subset[0][0].properties.tzid;

  subset.sort(by_coverage_and_tzid);

  // If the first zone has max coverage OR we hit the maximum recursion depth
  // OR this is a rural area that doesn't matter, then we're going to return a
  // leaf node rather than recurse further.
  if (
    subset[0][1] > 1 - EPS ||
    depth >= MAX_DEPTH ||
    (depth >= MIN_DEPTH && !overlap(ALL_HINTS, min_lat, min_lon, max_lat, max_lon))
  ) {
    const a = subset[0][0].properties.tzid;

    // If the second zone in the list has nearly the same coverage level as the
    // first, then sort out how to favor one over the other.
    // NOTE: We assume that no more than two zones ever conflict! This is true
    // as of 2018i, but...
    if (subset[0][1] - subset[1][1] < EPS) {
      const b = subset[1][0].properties.tzid;

      // Xinjiang conflict. We select Asia/Urumqi in order to make it clear
      // that there is, in fact, a conflict.
      if (a === 'Asia/Shanghai' && b === 'Asia/Urumqi') return b;

      // Israeli-Palestinian conflict. We select Asia/Hebron in order to make
      // it clear that there is, in fact, a conflict.
      if (a === 'Asia/Hebron' && b === 'Asia/Jerusalem') return a;

      // Sudan-South Sudan conflict. We select Africa/Khartoum arbitrarily and
      // will tweak it if anyone complains.
      if (a === 'Africa/Juba' && b === 'Africa/Khartoum') return b;

      // These are just conflicts that occur due to the resolution of our data.
      // Resolve them arbitrarily and we'll tweak it if anyone complains.
      if (a === 'Europe/Amsterdam' && b === 'Europe/Berlin') return a;

      if (a === 'Australia/Sydney' && b === 'Australia/Melbourne') return a;

      if (a === 'Asia/Tbilisi' && b === 'Europe/Moscow') return a;

      throw new Error('unresolved zone conflict: ' + a + ' vs ' + b);
    }

    // Otherwise, we just care about the top zone.
    return a;
  }

  // No easy way to pick a timezone for this tile. Recurse!
  const subset_candidates = subset.map(x => x[0]);
  const child_depth = depth + 1;
  const children = [
    tile(subset_candidates, etc_tzid, mid_lat, min_lon, max_lat, mid_lon, child_depth),
    tile(subset_candidates, etc_tzid, mid_lat, mid_lon, max_lat, max_lon, child_depth),
    tile(subset_candidates, etc_tzid, min_lat, min_lon, mid_lat, mid_lon, child_depth),
    tile(subset_candidates, etc_tzid, min_lat, mid_lon, mid_lat, max_lon, child_depth)
  ];

  // If all the children are leaves, and they're either identical or a maritime
  // zone, then collapse them up into a single node.
  if (!children.some(Array.isArray)) {
    const clean_children = children.filter(x => x !== etc_tzid);

    if (clean_children.length === 0) return etc_tzid;

    let all_equal = true;

    for (let i = 1; i < clean_children.length; i++)
      if (clean_children[0] !== clean_children[i]) {
        all_equal = false;
        break;
      }

    if (all_equal) return clean_children[0];
  }

  return children;
}

function by_coverage_and_tzid([a, a_coverage], [b, b_coverage]) {
  const order = b_coverage - a_coverage;

  if (order !== 0) return order;

  return a.properties.tzid.localeCompare(b.properties.tzid);
}
