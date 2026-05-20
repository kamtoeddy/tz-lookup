import { pad } from './hints.js';

export function normalize(geojson) {
  for (const feature of geojson.features) {
    // Ensure all features are MultiPolygons.
    switch (feature.geometry.type) {
      case 'Point':
        Object.assign(feature, pad(feature.geometry.coordinates));
        continue;
      case 'LineString': {
        // Add properties representing the bounding box of the timezone.
        let min_lat = 90;
        let min_lon = 180;
        let max_lat = -90;
        let max_lon = -180;

        for (const [lon, lat] of feature.geometry.coordinates) {
          if (lat < min_lat) min_lat = lat;

          if (lon < min_lon) min_lon = lon;

          if (lat > max_lat) max_lat = lat;

          if (lon > max_lon) max_lon = lon;
        }

        Object.assign(feature, {
          geometry: false,
          properties: {
            min_lat,
            min_lon,
            max_lat,
            max_lon
          }
        });
        continue;
      }

      case 'MultiPolygon':
        break;
      case 'Polygon':
        feature.geometry.type = 'MultiPolygon';
        feature.geometry.coordinates = [feature.geometry.coordinates];
        break;
      default:
        throw new Error('unrecognized type ' + feature.geometry.type);
    }

    // geojson includes duplicate vertices at the beginning and end of each
    // vertex list, so remove them. (This makes some of the algorithms used,
    // like clipping and the like, simpler.)
    for (const polygon of feature.geometry.coordinates)
      for (const vertices of polygon) {
        const first = vertices[0];
        const last = vertices[vertices.length - 1];

        if (first[0] === last[0] && first[1] === last[1]) vertices.pop();
      }

    // Add properties representing the bounding box of the timezone.
    let min_lat = 90;
    let min_lon = 180;
    let max_lat = -90;
    let max_lon = -180;

    for (const [vertices] of feature.geometry.coordinates)
      for (const [lon, lat] of vertices) {
        if (lat < min_lat) min_lat = lat;
        if (lon < min_lon) min_lon = lon;
        if (lat > max_lat) max_lat = lat;
        if (lon > max_lon) max_lon = lon;
      }

    feature.properties.min_lat = min_lat;
    feature.properties.min_lon = min_lon;
    feature.properties.max_lat = max_lat;
    feature.properties.max_lon = max_lon;
  }
}

export function box_overlap(feature, min_lat, min_lon, max_lat, max_lon) {
  return (
    min_lat <= feature.properties.max_lat &&
    min_lon <= feature.properties.max_lon &&
    max_lat >= feature.properties.min_lat &&
    max_lon >= feature.properties.min_lon
  );
}

export function polygon_overlap(feature, min_lat, min_lon, max_lat, max_lon) {
  let total = 0;

  for (const polygon of feature.geometry.coordinates) {
    total += area(clip(polygon[0], min_lat, min_lon, max_lat, max_lon));

    for (let i = 1; i < polygon.length; i++) total -= area(clip(polygon[i], min_lat, min_lon, max_lat, max_lon));
  }
  return total / ((max_lat - min_lat) * (max_lon - min_lon));
}

function area(polygon) {
  let sum = 0;
  let b = polygon[polygon.length - 1];

  for (let i = 0; i < polygon.length; i++) {
    const a = b;
    b = polygon[i];
    sum += a[0] * b[1] - a[1] * b[0];
  }

  return Math.abs(sum * 0.5);
}

function clip(polygon, min_lat, min_lon, max_lat, max_lon) {
  const p = Array.from(polygon);
  const q = [];
  let b = p[p.length - 1];

  for (let i = 0; i < p.length; i++) {
    const a = b;
    b = p[i];

    if (a[0] >= min_lon !== b[0] >= min_lon)
      q.push([min_lon, a[1] + ((b[1] - a[1]) * (min_lon - a[0])) / (b[0] - a[0])]);

    if (b[0] >= min_lon) q.push(b);
  }

  p.length = 0;
  b = q[q.length - 1];

  for (let i = 0; i < q.length; i++) {
    const a = b;
    b = q[i];

    if (a[1] >= min_lat !== b[1] >= min_lat)
      p.push([a[0] + ((b[0] - a[0]) * (min_lat - a[1])) / (b[1] - a[1]), min_lat]);

    if (b[1] >= min_lat) p.push(b);
  }

  q.length = 0;
  b = p[p.length - 1];

  for (let i = 0; i < p.length; i++) {
    const a = b;
    b = p[i];

    if (a[0] <= max_lon !== b[0] <= max_lon)
      q.push([max_lon, a[1] + ((b[1] - a[1]) * (max_lon - a[0])) / (b[0] - a[0])]);

    if (b[0] <= max_lon) q.push(b);
  }

  p.length = 0;
  b = q[q.length - 1];

  for (let i = 0; i < q.length; i++) {
    const a = b;
    b = q[i];

    if (a[1] <= max_lat !== b[1] <= max_lat)
      p.push([a[0] + ((b[0] - a[0]) * (max_lat - a[1])) / (b[1] - a[1]), max_lat]);

    if (b[1] <= max_lat) p.push(b);
  }

  return p;
}
