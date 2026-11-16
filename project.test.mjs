import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const load = async name => import(`data:text/javascript;base64,${Buffer.from(await readFile(new URL(name, import.meta.url), 'utf8')).toString('base64')}`);
const {normalizeProject, parseProject} = await load('./project.js');
const {generate, toCsv, toSvg} = await load('./core.js');
const fixture = (width = 17, height = 9) => generate({width, height, boardSize: 8, maxColors: 4, rgba: Array.from({length: width * height}, (_, i) => [i % 2 ? 220 : 40, 100, 150, i % 5 ? 255 : 0]).flat()});
const envelope = (extra = {}) => ({format: 'dsh-bead-project', version: 1, name: '花猫', pattern: fixture(), ...extra});

test('legacy pattern is wrapped with agreed defaults, without altering artwork', () => {
  const pattern = fixture(), out = normalizeProject(pattern);
  assert.deepEqual(out.pattern, pattern);
  assert.deepEqual(out.view, {boardId: '', labels: true, grid: true, fit: false, zoom: 100, highlight: ''});
  assert.equal(out.name, '未命名工程'); assert.equal(out.updatedAt, null);
  assert.equal(out.format, 'dsh-bead-project'); assert.equal(out.version, 1);
  assert.equal(toCsv(out.pattern), toCsv(pattern)); assert.equal(toSvg(out.pattern), toSvg(pattern));
});

test('legacy missing maxColors/background receives compatible defaults', () => {
  const p = fixture(); delete p.maxColors; delete p.background;
  const result = normalizeProject(p);
  assert.equal(result.pattern.maxColors, 16); assert.equal(result.pattern.background, 'transparent');
  const many = {...p, palette: Array.from({length: 20}, (_, i) => ({id: `C${i}`, rgb: [i, 0, 0]}))};
  assert.equal(normalizeProject(many).pattern.maxColors, 20);
  assert.throws(() => normalizeProject({...p, maxColors: null}));
  assert.throws(() => normalizeProject({...p, background: null}));
});

test('envelope retains valid preferences and canonicalizes timestamp/name', () => {
  const out = normalizeProject(envelope({name: '  小猫  ', updatedAt: '2026-11-16T08:20:00Z', view: {boardId: 'R2C3', labels: false, grid: false, fit: true, zoom: 175, highlight: 'C01'}}));
  assert.equal(out.name, '小猫'); assert.equal(out.updatedAt, '2026-11-16T08:20:00.000Z');
  assert.deepEqual(out.view, {boardId: 'R2C3', labels: false, grid: false, fit: true, zoom: 175, highlight: 'C01'});
  assert.deepEqual(normalizeProject(out), out);
  assert.deepEqual(parseProject(JSON.stringify(out)), out);
});

test('unknown preferences reset safely; zoom endpoints accepted', () => {
  const defaults = normalizeProject(fixture()).view;
  for (const zoom of [0, 49, 401, 100.5, '100', null]) {
    const out = normalizeProject(envelope({view: {boardId: 'R9C9', highlight: 'unknown', labels: 'false', grid: 0, fit: 1, zoom}}));
    assert.deepEqual(out.view, defaults);
  }
  for (const zoom of [50, 400]) assert.equal(normalizeProject(envelope({view: {zoom}})).view.zoom, zoom);
  assert.deepEqual(normalizeProject(envelope({view: null})).view, defaults);
});

test('all counts, hex colors and board geometry are rebuilt from authoritative cells', () => {
  const original = fixture(), damaged = structuredClone(original);
  damaged.totalBeads = -888; damaged.boards = [{id: 'evil', count: 99999}];
  damaged.palette.forEach(p => { p.hex = 'url(javascript:evil)'; p.count = 999; });
  const out = normalizeProject(damaged).pattern;
  assert.deepEqual(out, original);
  const reconstructed = [], visited = Array(out.cells.length).fill(0);
  for (const b of out.boards) {
    let count = 0;
    for (let y = b.y; y < b.y + b.height; y++) for (let x = b.x; x < b.x + b.width; x++) {
      const i = y * out.width + x; visited[i]++; reconstructed[i] = out.cells[i]; if (out.cells[i] >= 0) count++;
    }
    assert.equal(count, b.count);
  }
  assert.deepEqual(reconstructed, out.cells); assert.ok(visited.every(n => n === 1));
});

test('only explicit output fields survive; source images and extras are discarded', () => {
  const input = envelope({source: {data: [1, 2, 3, 4], url: 'private-file'}, custom: 'omit', view: {extra: 'omit'}});
  input.pattern.source = 'private-image'; input.pattern.palette[0].vendor = 'not a brand';
  const out = normalizeProject(input), text = JSON.stringify(out);
  assert.deepEqual(Object.keys(out), ['format', 'version', 'name', 'pattern', 'view', 'updatedAt']);
  for (const s of ['private-file', 'private-image', 'vendor', 'custom', 'extra', 'source']) assert.ok(!text.includes(s));
});

test('input stays unchanged and output shares no mutable arrays or objects', () => {
  const input = envelope(), before = structuredClone(input);
  const a = normalizeProject(input), b = normalizeProject(input);
  assert.deepEqual(input, before); assert.deepEqual(a, b);
  a.pattern.cells[0] = 0; a.pattern.palette[0].rgb[0] = 255; a.pattern.boards[0].count = 999; a.view.grid = false;
  assert.deepEqual(input, before); assert.deepEqual(b, normalizeProject(before));
});

test('rejects unsupported versions, format and malformed envelope', () => {
  for (const value of [null, [], 1, 'x', {}, {...fixture(), version: '2.0'}, {...fixture(), version: 1}, envelope({version: 2}), envelope({version: '1'}), envelope({format: 'other'}), envelope({pattern: null})]) assert.throws(() => normalizeProject(value));
});

test('strict dimensions, board size, palette and cell validation', () => {
  const p = fixture();
  for (const width of [0, 129, 1.2, '17']) assert.throws(() => normalizeProject({...p, width}));
  for (const height of [0, 129, 1.2, '9']) assert.throws(() => normalizeProject({...p, height}));
  for (const boardSize of [7, 121, 8.1, '8']) assert.throws(() => normalizeProject({...p, boardSize}));
  assert.equal(normalizeProject({...p, boardSize: 120}).pattern.boards.length, 1);
  for (const maxColors of [1, 33, 2.5, '4']) assert.throws(() => normalizeProject({...p, maxColors}));
  for (const cells of [[], p.cells.slice(1), p.cells.map(() => 99), p.cells.map(() => -2), p.cells.map(() => '0')]) assert.throws(() => normalizeProject({...p, cells}));
  for (const rgb of [[0, 0], [0, 0, 0, 0], [0, -1, 0], [256, 0, 0], [1.5, 0, 0], ['0', 0, 0]]) assert.throws(() => normalizeProject({...p, palette: [{id: 'C01', rgb}]}));
  assert.throws(() => normalizeProject({...p, palette: Array.from({length: 33}, (_, i) => ({id: `C${i}`, rgb: [0, 0, 0]}))}));
});

test('name and ID bounds, unique IDs, safe ID alphabet', () => {
  assert.equal(normalizeProject(envelope({name: ' '})).name, '未命名工程');
  assert.equal(normalizeProject(envelope({name: '猫'.repeat(120)})).name.length, 120);
  for (const name of ['猫'.repeat(121), '\u0000bad', 'line\nbreak', 123]) assert.throws(() => normalizeProject(envelope({name})));
  const p = fixture();
  for (const id of ['', 'x'.repeat(33), '<script>', 'a b', 'a\nb', '=SUM(1)']) assert.throws(() => normalizeProject({...p, palette: p.palette.map(c => ({...c, id}))}));
  assert.throws(() => normalizeProject({...p, palette: p.palette.map(c => ({...c, id: 'same'}))}));
});

test('empty artwork and largest board/dimensions retain valid statistics', () => {
  const empty = generate({width: 1, height: 1, rgba: [0, 0, 0, 0]});
  assert.equal(normalizeProject(empty).pattern.totalBeads, 0);
  assert.deepEqual(normalizeProject(empty).pattern.palette, []);
  const big = {...empty, width: 128, height: 128, boardSize: 120, cells: Array(16384).fill(-1)};
  assert.equal(normalizeProject(big).pattern.boards.length, 4);
  assert.deepEqual(normalizeProject(big).pattern.boards.at(-1), {id: 'R2C2', row: 2, col: 2, x: 120, y: 120, width: 8, height: 8, count: 0});
});

test('timestamp is deterministic, valid UTC ISO only and never synthesized', () => {
  for (const updatedAt of [null, 'tomorrow', '2026-02-30T00:00:00Z', '2026-11-16T25:00:00Z', 0, '', '2026-11-16']) assert.equal(normalizeProject(envelope({updatedAt})).updatedAt, null);
  assert.equal(normalizeProject(envelope({updatedAt: '2024-02-29T00:00:00.1Z'})).updatedAt, '2024-02-29T00:00:00.100Z');
  assert.equal(normalizeProject(envelope()).updatedAt, null);
});

test('plain JSON only: rejects accessors, functions, cycles, sparse arrays and exotic objects', () => {
  let executed = false;
  const getter = {}; Object.defineProperty(getter, 'pattern', {enumerable: true, get() { executed = true; return fixture(); }});
  assert.throws(() => normalizeProject(getter)); assert.equal(executed, false);
  const cycle = {}; cycle.self = cycle;
  for (const extra of [undefined, () => {}, Symbol('x'), 1n, Infinity, NaN, new Date(), new Uint8Array(4), cycle, Array(2)]) assert.throws(() => normalizeProject(envelope({extra})));
  const withToJSON = envelope({toJSON() { executed = true; return {}; }});
  assert.throws(() => normalizeProject(withToJSON)); assert.equal(executed, false);
  const nested = {}; let at = nested; for (let i = 0; i < 40; i++) { at.next = {}; at = at.next; }
  assert.throws(() => normalizeProject(envelope({nested})));
});

test('JSON parser rejects poison keys, script syntax and malformed/non-string input', () => {
  for (const text of ['{"__proto__":{"polluted":true}}', '{"constructor":{}}', '{"prototype":{}}', '({a:1})', 'alert(1)', '{', '', 'null', '[]', 42]) assert.throws(() => parseProject(text));
  assert.equal({}.polluted, undefined);
  assert.deepEqual(parseProject('\uFEFF' + JSON.stringify(fixture())), normalizeProject(fixture()));
});

test('1 MiB limit is measured as UTF-8, includes ignored fields and JSON escape overhead', () => {
  const huge = 'a'.repeat(1024 * 1024 + 1);
  assert.throws(() => parseProject(huge), /1 MiB/);
  assert.throws(() => normalizeProject(envelope({source: huge})), /1 MiB/);
  const unicode = '猫'.repeat(350000);
  assert.throws(() => parseProject(JSON.stringify(envelope({source: unicode}))), /1 MiB/);
  assert.throws(() => normalizeProject(envelope({source: unicode})), /1 MiB/);
  assert.throws(() => normalizeProject(envelope({source: '\u0000'.repeat(180000)})), /1 MiB/);
});
