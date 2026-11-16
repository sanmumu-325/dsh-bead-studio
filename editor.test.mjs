import test from 'node:test';
import assert from 'node:assert/strict';
import {paintCells, mergeColors, getCellInfo, createHistory} from './editor.js';
import {normalizeProject, parseProject} from './project.js';
import {toCsv, toSvg} from './core.js';

const fixture = () => normalizeProject({version: '1.0', width: 17, height: 9, boardSize: 8, maxColors: 4, background: 'transparent', palette: [{id: 'C02', rgb: [200, 40, 60]}, {id: 'C07', rgb: [30, 140, 210]}, {id: 'unused', rgb: [0, 0, 0]}], cells: Array.from({length: 153}, (_, i) => i % 3 === 0 ? -1 : i % 2)}).pattern;
const snapshot = p => JSON.parse(JSON.stringify(p));
function checkCounts(p) {
  const counts = p.palette.map(() => 0);
  p.cells.forEach(i => { if (i >= 0) counts[i]++; });
  assert.deepEqual(p.palette.map(c => c.count), counts);
  assert.equal(p.totalBeads, counts.reduce((a, b) => a + b, 0));
  const visited = Array(p.cells.length).fill(0);
  for (const b of p.boards) {
    let count = 0;
    for (let y = b.y; y < b.y + b.height; y++) for (let x = b.x; x < b.x + b.width; x++) {
      const i = y * p.width + x; visited[i]++; if (p.cells[i] >= 0) count++;
    }
    assert.equal(b.count, count);
  }
  assert.ok(visited.every(n => n === 1));
}

test('paint one stroke across boards rebuilds counts without modifying original', () => {
  const p = fixture(), copy = snapshot(p), indices = [0, 8, 16, 136, 144, 152];
  const painted = paintCells(p, indices, 'C07');
  assert.notEqual(painted, p); assert.deepEqual(p, copy);
  for (const i of indices) assert.equal(painted.cells[i], 1);
  checkCounts(painted);
  painted.palette[0].rgb[0] = 99; painted.boards[0].count = -1;
  assert.deepEqual(p, copy);
});

test('erase preserves all palette IDs including zero-count colors and repaint works', () => {
  const p = fixture(), erased = paintCells(p, [...p.cells.keys()], null);
  assert.equal(erased.totalBeads, 0); assert.ok(erased.cells.every(c => c === -1));
  assert.deepEqual(erased.palette.map(c => c.id), ['C02', 'C07', 'unused']);
  assert.ok(erased.palette.every(c => c.count === 0));
  const restored = paintCells(erased, [0, 152], 'C07');
  assert.equal(restored.totalBeads, 2); assert.equal(restored.palette[1].count, 2);
  checkCounts(restored);
});

test('empty and repeated strokes preserve identity; Array/Set supported', () => {
  const p = fixture();
  assert.equal(paintCells(p, [], 'C02'), p);
  assert.equal(paintCells(p, [0, 0, 0], null), p);
  const a = paintCells(p, [0, 0, 8, 8], 'C02');
  assert.deepEqual(a, paintCells(p, new Set([0, 8]), 'C02'));
  assert.equal(paintCells(a, [0, 8], 'C02'), a);
});

test('stroke validation is strict and atomic even after valid indices', () => {
  const p = fixture(), before = snapshot(p);
  for (const value of [-1, 153, 1.2, '1', NaN, Infinity, undefined, null]) assert.throws(() => paintCells(p, [0, value], 'C02'));
  for (const value of ['0', null, {}, new Uint32Array([0]), 1]) assert.throws(() => paintCells(p, value, 'C02'));
  for (const color of ['missing', '', 0, undefined]) assert.throws(() => paintCells(p, [0], color));
  assert.throws(() => paintCells(p, Array(1), 'C02'));
  assert.deepEqual(p, before);
});

test('merge replaces cells, prunes unused colors and preserves target ID', () => {
  const p = fixture(), before = snapshot(p), out = mergeColors(p, 'C02', 'C07');
  assert.deepEqual(p, before); assert.equal(out.totalBeads, p.totalBeads);
  assert.deepEqual(out.palette.map(c => c.id), ['C07']);
  assert.ok(out.cells.every((c, i) => c === (p.cells[i] < 0 ? -1 : 0)));
  assert.deepEqual(out.palette[0].rgb, p.palette[1].rgb);
  checkCounts(out);
  assert.ok(toCsv(out).includes('C07')); assert.ok(toSvg(out).includes('C07'));
});

test('merge target can be unused; remapping handles target before or after source', () => {
  const p = fixture();
  const a = mergeColors(p, 'C07', 'C02');
  assert.deepEqual(a.palette.map(c => c.id), ['C02']); checkCounts(a);
  const b = mergeColors(p, 'C02', 'unused');
  assert.deepEqual(b.palette.map(c => c.id), ['C07', 'unused']);
  assert.ok(b.cells.every((v, i) => v === (p.cells[i] === -1 ? -1 : p.cells[i] === 0 ? 1 : 0)));
  checkCounts(b);
  const c = mergeColors(p, 'unused', 'C02');
  assert.deepEqual(c.palette.map(c => c.id), ['C02', 'C07']);
  assert.deepEqual(c.cells, p.cells);
});

test('same-color merge is identity; invalid source/target rejects without mutations', () => {
  const p = fixture(), before = snapshot(p);
  assert.equal(mergeColors(p, 'C02', 'C02'), p);
  assert.equal(mergeColors(p, 'unused', 'unused'), p);
  for (const [from, to] of [['bad', 'bad'], ['C02', 'bad'], [null, 'C02'], ['C02', 1]]) assert.throws(() => mergeColors(p, from, to));
  assert.deepEqual(p, before);
});

test('getCellInfo gives one-based global coordinates, edge boards and detached colors', () => {
  const p = fixture();
  assert.deepEqual(getCellInfo(p, 0), {index: 0, row: 1, col: 1, x: 1, y: 1, boardId: 'R1C1', color: null});
  const edge = getCellInfo(p, 152);
  assert.equal(edge.row, 9); assert.equal(edge.col, 17); assert.equal(edge.boardId, 'R2C3');
  assert.deepEqual(edge.color, p.palette[p.cells[152]]);
  edge.color.rgb[0] = 0; assert.notDeepEqual(edge.color.rgb, p.palette[p.cells[152]].rgb);
  assert.equal(getCellInfo(p, 8).boardId, 'R1C2');
  assert.equal(getCellInfo(p, 136).boardId, 'R2C1');
  for (const i of [-1, 153, 1.1, null, '0', undefined]) assert.throws(() => getCellInfo(p, i));
});

test('history commits, undoes and redoes complete strokes including merges', () => {
  const history = createHistory(), a = fixture(), b = paintCells(a, [0, 8, 152], 'C02'), c = mergeColors(b, 'C02', 'C07');
  assert.equal(history.canUndo, false); assert.equal(history.canRedo, false);
  assert.equal(history.undo(a), a); assert.equal(history.redo(a), a);
  assert.equal(history.commit(a, b), b); assert.equal(history.commit(b, c), c);
  assert.equal(history.canUndo, true); assert.equal(history.canRedo, false);
  let current = history.undo(c); assert.deepEqual(current, b);
  current = history.undo(current); assert.deepEqual(current, a);
  assert.equal(history.canUndo, false); assert.equal(history.canRedo, true);
  current = history.redo(current); assert.deepEqual(current, b);
  current = history.redo(current); assert.deepEqual(current, c);
  assert.equal(history.canRedo, false); checkCounts(current);
});

test('semantic no-op commits preserve redo; a new actual branch clears redo', () => {
  const history = createHistory(), a = fixture(), b = paintCells(a, [0], 'C02');
  assert.equal(history.commit(a, snapshot(a)), a); assert.equal(history.canUndo, false);
  history.commit(a, b); const previous = history.undo(b);
  assert.equal(history.commit(previous, snapshot(previous)), previous); assert.equal(history.canRedo, true);
  const branch = paintCells(previous, [0], 'C07'); history.commit(previous, branch);
  assert.equal(history.canRedo, false); assert.deepEqual(history.undo(branch), a);
});

test('history uses detached snapshots and validates before changing stacks', () => {
  const history = createHistory(), a = fixture(), original = snapshot(a), b = paintCells(a, [0], 'C02');
  history.commit(a, b); a.cells[0] = 1;
  assert.throws(() => history.undo({})); assert.equal(history.canUndo, true);
  const restored = history.undo(b); assert.deepEqual(restored, original);
  b.cells[0] = 1;
  const redo = history.redo(restored); assert.equal(redo.cells[0], 0);
  assert.throws(() => history.commit(redo, {})); assert.equal(history.canUndo, true);
  history.clear(); assert.equal(history.canUndo, false); assert.equal(history.canRedo, false);
});

test('history respects finite limit and default 50 entries', () => {
  const h = createHistory(2); let current = fixture(); const states = [snapshot(current)];
  for (let i = 0; i < 3; i++) { const next = paintCells(current, [0], i % 2 ? 'C07' : 'C02'); h.commit(current, next); current = next; states.push(snapshot(current)); }
  current = h.undo(current); assert.deepEqual(current, states[2]);
  current = h.undo(current); assert.deepEqual(current, states[1]);
  assert.equal(h.undo(current), current); assert.equal(h.canUndo, false);
  const defaultHistory = createHistory(); current = fixture();
  for (let i = 0; i < 52; i++) { const next = paintCells(current, [0], i % 2 ? 'C07' : 'C02'); defaultHistory.commit(current, next); current = next; }
  let undoCount = 0; while (defaultHistory.canUndo) { current = defaultHistory.undo(current); undoCount++; }
  assert.equal(undoCount, 50);
  for (const limit of [0, -1, 1001, 1.1, '50', null, NaN]) assert.throws(() => createHistory(limit));
});

test('legacy JSON missing optional metadata can be edited and exported', () => {
  const old = snapshot(fixture()); delete old.maxColors; delete old.background; old.palette.forEach(p => { delete p.hex; p.count = 999; }); old.boards = []; old.totalBeads = 999;
  const imported = parseProject(JSON.stringify(old));
  const out = paintCells(old, [0], 'C02');
  assert.equal(out.maxColors, 16); assert.equal(out.background, 'transparent');
  assert.deepEqual(out, paintCells(imported.pattern, [0], 'C02'));
  assert.deepEqual(parseProject(JSON.stringify(out)).pattern, out);
  checkCounts(out);
});

test('maximum-size edge cell edits and fully erased merges remain consistent', () => {
  const large = normalizeProject({...fixture(), width: 128, height: 128, boardSize: 120, cells: Array(16384).fill(-1)}).pattern;
  const painted = paintCells(large, [0, 119, 120, 15360, 16383], 'C07');
  checkCounts(painted);
  assert.equal(painted.totalBeads, 5);
  assert.equal(getCellInfo(painted, 16383).boardId, 'R2C2');
  const erased = paintCells(painted, [0, 119, 120, 15360, 16383], null);
  assert.equal(erased.palette.length, 3);
  const merged = mergeColors(erased, 'C02', 'C07');
  assert.deepEqual(merged.palette, []); assert.equal(merged.totalBeads, 0);
  checkCounts(merged);
});

test('invalid patterns reject before edits and valid empty patterns remain editable', () => {
  for (const p of [null, {}, {...fixture(), cells: []}, {...fixture(), cells: Array(153).fill(99)}]) {
    assert.throws(() => paintCells(p, [], null)); assert.throws(() => mergeColors(p, 'C02', 'C07')); assert.throws(() => getCellInfo(p, 0));
  }
  const empty = {...fixture(), palette: [], cells: Array(153).fill(-1)};
  assert.equal(paintCells(empty, [0], null), empty); assert.equal(getCellInfo(empty, 0).color, null);
});
