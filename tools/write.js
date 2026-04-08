import fs from 'node:fs';
import assert from 'assert';
import tz_list from './tz.json' with { type: 'json' };
import tz_data from './tz_data.json' with { type: 'json' };

fs.writeFileSync('tz.bin', pack(tz_data));

// Pack tree into a buffer
function pack(root) {
  const list = [];
  const queue = [root];
  const tz_2_index = new Map(tz_list.map((tz, index) => [tz, index]));

  while (queue.length > 0) {
    const node = queue.shift();

    node.index = list.length;
    list.push(node);

    for (let i = 0; i < node.length; i++) {
      if (Array.isArray(node[i])) queue.push(node[i]);
      else node[i] = tz_2_index.get(node[i]);
    }
  }

  const buffer = Buffer.allocUnsafe(2 * (24 * 48 + (list.length - 1) * 4));
  let off = 0;

  for (let i = 0; i < list.length; i++) {
    const a = list[i];

    for (let j = 0; j < a.length; j++) {
      const b = a[j];

      const value = Array.isArray(b) ? b.index - a.index - 1 : 65536 - tz_list.length + b;

      buffer.writeUIntBE(value, off, 2);
      off += 2;
    }
  }

  assert.equal(off, buffer.length);

  return buffer;
}
