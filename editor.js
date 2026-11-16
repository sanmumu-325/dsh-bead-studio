import { normalizeProject } from './project.js';

const canonical = pattern => normalizeProject(pattern).pattern;
function cellIndex(index, length) {
  if (!Number.isInteger(index) || index < 0 || index >= length) throw new RangeError('Cell index must be an integer inside the pattern');
  return index;
}
function colorIndex(pattern, id) {
  if (typeof id !== 'string') throw new TypeError('Color ID must be a string');
  const index = pattern.palette.findIndex(color => color.id === id);
  if (index < 0) throw new RangeError(`Unknown color ID: ${id}`);
  return index;
}

/** Paint row-major zero-based indices with an existing color, or null to erase.
 * Accept an Array or Set; duplicates are harmless. Validate the entire stroke
 * before applying it. Keep zero-count palette entries available to the brush.
 * A stroke that changes no cells returns the exact original pattern.
 */
export function paintCells(pattern, indices, colorId) {
  const next = canonical(pattern);
  if (!Array.isArray(indices) && !(indices instanceof Set)) throw new TypeError('indices must be an Array or Set');
  const selected = colorId === null ? -1 : colorIndex(next, colorId);
  const unique = new Set();
  for (const index of indices) unique.add(cellIndex(index, next.cells.length));
  let changed = false;
  for (const index of unique) if (next.cells[index] !== selected) {
    next.cells[index] = selected;
    changed = true;
  }
  return changed ? canonical(next) : pattern;
}

/** Replace every fromId bead with toId, then prune all zero-count colors.
 * Remaining palette order and IDs are preserved; cell indices are remapped.
 * Merging a color into itself is a no-op, including unused palette entries.
 */
export function mergeColors(pattern, fromId, toId) {
  const next = canonical(pattern);
  const from = colorIndex(next, fromId), to = colorIndex(next, toId);
  if (from === to) return pattern;
  const counts = next.palette.map(() => 0);
  next.cells = next.cells.map(index => {
    const merged = index === from ? to : index;
    if (merged >= 0) counts[merged]++;
    return merged;
  });
  const remap = new Map();
  next.palette = next.palette.filter((_, i) => {
    if (!counts[i]) return false;
    remap.set(i, remap.size);
    return true;
  });
  next.cells = next.cells.map(index => index < 0 ? -1 : remap.get(index));
  return canonical(next);
}

/** Global coordinates are 1-based; index remains zero-based. Empty color=null.
 * Returns detached color data, so tooltip consumers cannot mutate the artwork.
 */
export function getCellInfo(pattern, index) {
  const p = canonical(pattern);
  cellIndex(index, p.cells.length);
  const col = index % p.width + 1, row = Math.floor(index / p.width) + 1;
  const boardRow = Math.floor((row - 1) / p.boardSize) + 1;
  const boardCol = Math.floor((col - 1) / p.boardSize) + 1;
  return {index, row, col, x: col, y: row, boardId: `R${boardRow}C${boardCol}`, color: p.cells[index] < 0 ? null : p.palette[p.cells[index]]};
}

/** Bounded in-memory undo/redo. Snapshots are canonical independent patterns.
 * commit returns after (before for semantic no-ops); undo/redo return current
 * unchanged when unavailable. A new real commit invalidates the redo branch.
 * Call clear when opening or generating a different project.
 */
export function createHistory(limit = 50) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new RangeError('History limit must be an integer in 1..1000');
  const past = [], future = [];
  return {
    commit(before, after) {
      const previous = canonical(before), next = canonical(after);
      if (JSON.stringify(previous) === JSON.stringify(next)) return before;
      past.push(previous);
      if (past.length > limit) past.shift();
      future.length = 0;
      return after;
    },
    undo(current) {
      if (!past.length) return current;
      const snapshot = canonical(current), result = canonical(past[past.length - 1]);
      past.pop(); future.push(snapshot);
      return result;
    },
    redo(current) {
      if (!future.length) return current;
      const snapshot = canonical(current), result = canonical(future[future.length - 1]);
      future.pop(); past.push(snapshot);
      if (past.length > limit) past.shift();
      return result;
    },
    clear() { past.length = 0; future.length = 0; },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; }
  };
}
