import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
// Load the identical ESM source even when the parent project has no package.json.
const source = await readFile(new URL('./core.js', import.meta.url), 'utf8');
const {generate, toCsv, toSvg, sampleImage, demoImage} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const input = (width = 1, height = 1, color = [20, 30, 40, 255]) => ({width, height, rgba: Array.from({length: width * height}, () => color).flat()});
const fixture = (width = 35, height = 31) => ({width, height, rgba: Array.from({length: width * height}, (_, i) => [(i * 71) % 256, (i * 13) % 256, (i * 193) % 256, i % 7 ? 255 : 0]).flat()});

test('exact API, stable deterministic output and nonmutation', () => {
  const a = fixture(), before = structuredClone(a);
  const first = generate(a);
  assert.deepEqual(generate(a), first);
  assert.deepEqual(generate({...a, rgba: new Uint8ClampedArray(a.rgba)}), first);
  assert.deepEqual(a, before);
  assert.equal(first.version, '1.0');
  assert.equal(first.maxColors, 16); assert.equal(first.boardSize, 29);
  assert.equal(first.background, 'transparent');
  assert.deepEqual(Object.keys(first), ['version', 'width', 'height', 'maxColors', 'boardSize', 'background', 'palette', 'cells', 'totalBeads', 'boards']);
  first.palette.forEach((p, i) => { assert.equal(p.id, `C${String(i + 1).padStart(2, '0')}`); assert.match(p.hex, /^#[0-9A-F]{6}$/); });
});

test('palette and board counts agree; all board cells reconstruct exactly once', () => {
  const p = generate({...fixture(), boardSize: 8, maxColors: 7});
  const counts = p.palette.map(() => 0), reconstructed = [], visited = Array(p.cells.length).fill(0);
  for (const b of p.boards) {
    assert.equal(b.id, `R${b.row}C${b.col}`);
    assert.equal(b.x, (b.col - 1) * p.boardSize); assert.equal(b.y, (b.row - 1) * p.boardSize);
    let count = 0;
    for (let y = b.y; y < b.y + b.height; y++) for (let x = b.x; x < b.x + b.width; x++) {
      const i = y * p.width + x, cell = p.cells[i]; visited[i]++; reconstructed[i] = cell;
      if (cell >= 0) { count++; counts[cell]++; }
    }
    assert.equal(count, b.count);
  }
  assert.deepEqual(reconstructed, p.cells); assert.ok(visited.every(n => n === 1));
  assert.deepEqual(counts, p.palette.map(p => p.count));
  assert.equal(counts.reduce((s, n) => s + n, 0), p.totalBeads);
  assert.equal(p.boards.reduce((s, b) => s + b.count, 0), p.totalBeads);
  assert.equal(p.boards.length, 20);
  assert.deepEqual(p.boards.at(-1), {id: 'R4C5', row: 4, col: 5, x: 32, y: 24, width: 3, height: 7, count: p.boards.at(-1).count});
});

test('transparent threshold is exactly 128; white composites every pixel', () => {
  const a = {width: 4, height: 1, rgba: [255, 0, 0, 0, 0, 0, 0, 127, 0, 0, 0, 128, 10, 20, 30, 255]};
  const t = generate(a);
  assert.deepEqual(t.cells.slice(0, 2), [-1, -1]); assert.equal(t.totalBeads, 2);
  assert.deepEqual(t.palette.map(p => p.rgb), [[0, 0, 0], [10, 20, 30]]);
  const w = generate({...a, background: 'white'});
  assert.equal(w.totalBeads, 4); assert.ok(w.cells.every(i => i >= 0));
  assert.deepEqual(w.palette.map(p => p.rgb), [[10, 20, 30], [127, 127, 127], [128, 128, 128], [255, 255, 255]]);
});

test('empty, one color and exact colors work without fake colors', () => {
  const empty = generate(input(9, 9, [12, 24, 36, 0]));
  assert.deepEqual(empty.palette, []); assert.ok(empty.cells.every(i => i === -1)); assert.equal(empty.totalBeads, 0);
  const one = generate(input(2, 3));
  assert.deepEqual(one.palette, [{id: 'C01', hex: '#141E28', rgb: [20, 30, 40], count: 6}]);
  assert.ok(toSvg(empty).includes('No beads')); assert.ok(toCsv(empty).includes('"TOTAL","","","","","0"'));
});

test('all requested palette caps and maximum dimensions', () => {
  for (const maxColors of [2, 3, 7, 16, 32]) {
    const p = generate({...fixture(128, 128), maxColors, boardSize: 64});
    assert.ok(p.palette.length <= maxColors); assert.ok(p.palette.length > 0);
    assert.ok(p.cells.every(i => i === -1 || (i >= 0 && i < p.palette.length)));
    assert.equal(p.boards.length, 4);
  }
});

test('median-cut uses frequencies and is independent of input traversal order', () => {
  const colors = [...Array(9).fill([0, 0, 0, 255]), [10, 0, 0, 255], [100, 0, 0, 255]];
  const a = generate({width: 11, height: 1, rgba: colors.flat(), maxColors: 2});
  const b = generate({width: 11, height: 1, rgba: colors.toReversed ? colors.toReversed().flat() : [...colors].reverse().flat(), maxColors: 2});
  assert.deepEqual(a.palette, b.palette);
  assert.deepEqual(a.palette.map(p => p.rgb), [[0, 0, 0], [55, 0, 0]]);
  assert.deepEqual(a.cells, [...b.cells].reverse());
});

test('axis ties are stable and maximum-size unique-color input is supported', () => {
  const p = generate({width: 4, height: 1, maxColors: 2, rgba: [0, 0, 0, 255, 0, 100, 0, 255, 100, 0, 0, 255, 100, 100, 0, 255]});
  assert.deepEqual(p.palette.map(c => c.rgb), [[0, 50, 0], [100, 50, 0]]);
  const unique = Array.from({length: 128 * 128}, (_, i) => [(i >> 8) & 255, i & 255, (i * 31) & 255, 255]).flat();
  const large = generate({width: 128, height: 128, rgba: unique, maxColors: 32});
  assert.equal(large.palette.length, 32); assert.equal(large.totalBeads, 16384);
  assert.deepEqual(generate({width: 128, height: 128, rgba: unique, maxColors: 32}), large);
});

test('generate strictly rejects invalid dimensions, options, channel values and lengths', () => {
  for (const field of ['width', 'height']) for (const value of [0, -1, 129, 1.5, '2', NaN, Infinity, undefined]) assert.throws(() => generate({...input(), [field]: value}));
  for (const value of [1, 33, 2.1, '16', null]) assert.throws(() => generate({...input(), maxColors: value}));
  for (const value of [7, 121, 8.1, '29', null]) assert.throws(() => generate({...input(), boardSize: value}));
  for (const value of ['black', '', null, {}]) assert.throws(() => generate({...input(), background: value}));
  for (const value of [-1, 256, 1.1, NaN, Infinity, undefined, null, '4']) assert.throws(() => generate({...input(), rgba: [value, 0, 0, 255]}));
  for (const rgba of [[], [0, 0, 0], [0, 0, 0, 0, 0], new Uint8Array(4), {}, null, Array(4)]) assert.throws(() => generate({...input(), rgba}));
  assert.throws(() => generate());
});

test('SVG is white paper with grid, ids, coordinates, title, legend and safe colors', () => {
  const p = generate({...input(10, 10), boardSize: 8});
  const svg = toSvg(p);
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
  for (const text of ['<title', 'fill="#FFFFFF"', '>C01</text>', 'global coordinates', '100 beads', 'Materials', 'not brand codes', 'data-board-lines="true"', 'stroke="#A0A7B2"']) assert.ok(svg.includes(text), text);
  const board = toSvg(p, {boardId: 'R2C2'});
  assert.ok(board.includes('2 × 2 cells · 4 beads')); assert.ok(board.includes('>9</text>')); assert.ok(board.includes('>10</text>'));
  assert.equal((board.match(/>C01<\/text>/g) || []).length, 4);
  const quiet = toSvg(p, {labels: false, grid: false, boardLines: false});
  assert.ok(!quiet.includes('>C01</text>')); assert.ok(!quiet.includes('<path')); assert.ok(!quiet.includes('data-board-lines'));
  assert.deepEqual(p, generate({...input(10, 10), boardSize: 8}));
});

test('SVG escapes untrusted IDs and ignores supplied color strings; CSV quotes and guards formulas', () => {
  const p = generate(input()); p.palette[0].id = '<script a="x">&\'</script>'; p.palette[0].hex = 'red" onload="bad()';
  const svg = toSvg(p);
  assert.ok(svg.includes('&lt;script a=&quot;x&quot;&gt;&amp;&apos;&lt;/script&gt;'));
  assert.ok(!svg.includes('<script')); assert.ok(!svg.includes('onload')); assert.ok(svg.includes('#141E28'));
  assert.ok(toCsv(p).includes('a=""x""'));
  p.palette[0].id = '=HYPERLINK("x")'; assert.ok(toCsv(p).includes('"\'=HYPERLINK(""x"")"'));
});

test('CSV has exact materials and total with CRLF, no BOM or HTML', () => {
  const csv = toCsv(generate(input(2, 3)));
  assert.equal(csv, '"Color ID","HEX","R","G","B","Count"\r\n"C01","#141E28","20","30","40","6"\r\n"TOTAL","","","","","6"\r\n');
  assert.equal(Buffer.from(csv, 'utf8').toString('utf8'), csv);
});

test('export validation rejects bad pattern, options and nonexistent boards', () => {
  const p = generate(input());
  for (const bad of [null, {}, {...p, cells: []}, {...p, cells: [1]}, {...p, cells: [-2]}, {...p, palette: [{id: 'x', rgb: [256, 0, 0]}]}]) {
    assert.throws(() => toSvg(bad)); assert.throws(() => toCsv(bad));
  }
  for (const boardId of ['R0C1', 'R1C2', 'R2C1', '<bad>', 1]) assert.throws(() => toSvg(p, {boardId}));
  for (const cellSize of [0, 11, 65, 24.1, NaN, '24']) assert.throws(() => toSvg(p, {cellSize}));
  assert.throws(() => toSvg(p, {grid: 'false'}));
});

test('sampling computes exact small block means and supports nearest upscaling', () => {
  const a = {width: 2, height: 2, data: [0, 20, 40, 0, 100, 40, 80, 100, 200, 60, 120, 200, 100, 80, 160, 100]};
  const copy = structuredClone(a);
  const small = sampleImage(a, 1, 1);
  assert.deepEqual([...small.data], [150, 60, 120, 100]); assert.equal(small.width, 1); assert.equal(small.height, 1);
  assert.ok(small.data instanceof Uint8ClampedArray); assert.deepEqual(a, copy);
  const large = sampleImage({width: 1, height: 1, data: [10, 20, 30, 40]}, 3, 2);
  assert.deepEqual([...large.data], Array(6).fill([10, 20, 30, 40]).flat());
  assert.deepEqual(sampleImage(a, 2, 2).data, new Uint8ClampedArray([0, 0, 0, 0, ...a.data.slice(4)]));
});

test('alpha-weighted sampling preserves edges and discards hidden transparent RGB', () => {
  const mixed = {width: 2, height: 1, data: [240, 120, 60, 255, 0, 0, 0, 0]};
  assert.deepEqual([...sampleImage(mixed, 1, 1).data], [240, 120, 60, 128]);
  mixed.data.splice(4, 4, 0, 255, 255, 0);
  assert.deepEqual([...sampleImage(mixed, 1, 1).data], [240, 120, 60, 128]);
  const transparent = {width: 2, height: 1, data: [250, 100, 50, 0, 10, 200, 240, 0]};
  assert.deepEqual([...sampleImage(transparent, 1, 1).data], [0, 0, 0, 0]);
  const opaque = {width: 2, height: 1, data: [20, 40, 60, 255, 100, 120, 140, 255]};
  assert.deepEqual([...sampleImage(opaque, 1, 1).data], [60, 80, 100, 255]);
  const partial = {width: 2, height: 1, data: [200, 0, 0, 64, 0, 0, 200, 192]};
  assert.deepEqual([...sampleImage(partial, 1, 1).data], [50, 0, 150, 128]);
});

test('sampling regular large blocks is deterministic, bounded and validates input', () => {
  const data = new Uint8ClampedArray(100 * 100 * 4).fill(123);
  assert.deepEqual([...sampleImage({width: 100, height: 100, data}, 1, 1).data], [123, 123, 123, 123]);
  assert.deepEqual(sampleImage({width: 100, height: 100, data}, 7, 9), sampleImage({width: 100, height: 100, data}, 7, 9));
  for (const args of [[{width: 20000001, height: 1, data: []}, 1, 1], [{width: 5000, height: 4001, data: []}, 1, 1], [{width: 1, height: 1, data: [0, 0, 0, -1]}, 1, 1], [{width: 1, height: 1, data: [0, 0, 0, 0]}, 0, 1], [{width: 1, height: 1, data: [0, 0, 0, 0]}, 1, 129]]) assert.throws(() => sampleImage(...args));
});

test('demo is a fresh deterministic cat and can run the entire export pipeline', () => {
  const a = demoImage(), b = demoImage(); assert.deepEqual(a, b); assert.notEqual(a.data, b.data);
  assert.equal(a.width, 16); assert.equal(a.height, 16); assert.equal(a.data.length, 1024);
  const p = generate({width: a.width, height: a.height, rgba: a.data});
  assert.ok(p.totalBeads > 60 && p.totalBeads < 256); assert.ok(p.palette.length >= 4);
  assert.ok(toSvg(p).length > 1000); assert.ok(toCsv(p).includes('TOTAL'));
});
