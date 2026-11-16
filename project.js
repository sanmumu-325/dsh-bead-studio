// Portable project import boundary. No storage, source-image retention or clock reads.
const MAX_BYTES = 1024 * 1024;
const encoder = new TextEncoder();
const fail = message => { throw new TypeError(message); };
const int = (value, min, max, name) => {
  if (!Number.isInteger(value) || value < min || value > max) fail(`${name} must be an integer in ${min}..${max}`);
  return value;
};
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// Inspect descriptors before reading values: accessors/toJSON never execute.
// A bounded walk also rejects cycles, exotic objects and non-JSON primitives.
function jsonCopy(input) {
  let bytes = 0, nodes = 0;
  const active = new Set();
  const add = text => {
    if (text.length > MAX_BYTES || (bytes += encoder.encode(text).length) > MAX_BYTES) fail('Project exceeds 1 MiB');
  };
  function walk(value, depth) {
    if (++nodes > 100000 || depth > 32) fail('Project is too complex');
    if (value === null || typeof value === 'boolean') { add(String(value)); return value; }
    if (typeof value === 'number') { if (!Number.isFinite(value)) fail('Non-finite JSON number'); add(String(value)); return value; }
    if (typeof value === 'string') { if (value.length > MAX_BYTES) fail('Project exceeds 1 MiB'); add(JSON.stringify(value)); return value; }
    if (typeof value !== 'object') fail('Only JSON values are accepted');
    const array = Array.isArray(value), proto = Object.getPrototypeOf(value);
    if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) fail('Only plain JSON objects are accepted');
    if (active.has(value)) fail('Cyclic project');
    active.add(value);
    const keys = Reflect.ownKeys(value), out = array ? [] : Object.create(null);
    if (keys.length > 100001) fail('Project is too complex');
    if (array && value.length > 100000) fail('Project is too complex');
    add(array ? '[]' : '{}');
    let count = 0;
    for (const key of keys) {
      if (array && key === 'length') continue;
      if (typeof key !== 'string') fail('Symbol keys are not JSON');
      if (['__proto__', 'prototype', 'constructor'].includes(key)) fail('Unsafe project key');
      const d = Object.getOwnPropertyDescriptor(value, key);
      if (!d || !('value' in d) || !d.enumerable) fail('Only enumerable JSON data properties are accepted');
      if (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) fail('Invalid array property');
      if (count++) add(',');
      if (!array) { add(JSON.stringify(key)); add(':'); }
      out[key] = walk(d.value, depth + 1);
    }
    if (array && count !== value.length) fail('Sparse arrays are not JSON data');
    active.delete(value);
    return out;
  }
  return walk(input, 0);
}

function patternCopy(p) {
  if (!record(p) || p.version !== '1.0') fail('Unsupported pattern version (expected 1.0)');
  const width = int(p.width, 1, 128, 'width'), height = int(p.height, 1, 128, 'height');
  const maxColors = int(Object.hasOwn(p, 'maxColors') ? p.maxColors : Math.max(16, Array.isArray(p.palette) ? p.palette.length : 0), 2, 32, 'maxColors');
  const boardSize = int(p.boardSize, 8, 120, 'boardSize');
  const background = Object.hasOwn(p, 'background') ? p.background : 'transparent';
  if (!['transparent', 'white'].includes(background)) fail('Invalid background');
  if (!Array.isArray(p.palette) || p.palette.length > maxColors) fail('Invalid palette size');
  if (!Array.isArray(p.cells) || p.cells.length !== width * height) fail('Invalid cell length');
  const ids = new Set();
  const palette = p.palette.map(color => {
    if (!record(color) || typeof color.id !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(color.id)) fail('Invalid color ID (1..32 letters, digits, underscore or hyphen)');
    if (ids.has(color.id)) fail('Duplicate color ID');
    ids.add(color.id);
    if (!Array.isArray(color.rgb) || color.rgb.length !== 3) fail('Invalid palette RGB');
    const rgb = color.rgb.map(v => int(v, 0, 255, 'RGB'));
    return {id: color.id, hex: '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase(), rgb, count: 0};
  });
  let totalBeads = 0;
  const cells = p.cells.map(value => {
    const i = int(value, -1, palette.length - 1, 'cell');
    if (i >= 0) { palette[i].count++; totalBeads++; }
    return i;
  });
  const boards = [];
  for (let y = 0; y < height; y += boardSize) for (let x = 0; x < width; x += boardSize) {
    const row = y / boardSize + 1, col = x / boardSize + 1;
    const w = Math.min(boardSize, width - x), h = Math.min(boardSize, height - y);
    let count = 0;
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (cells[yy * width + xx] !== -1) count++;
    boards.push({id: `R${row}C${col}`, row, col, x, y, width: w, height: h, count});
  }
  return {version: '1.0', width, height, maxColors, boardSize, background, palette, cells, totalBeads, boards};
}

function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  const iso = new Date(ms).toISOString();
  // Date.parse normalizes impossible dates such as February 30: reject them.
  if (iso.slice(0, 19) !== value.slice(0, 19)) return null;
  return iso;
}

/** Accept a legacy v1.0 pattern or version-1 dsh-bead-project envelope.
 * Returns a fresh canonical project; derived statistics are never trusted.
 * Name <=120 UTF-16 units, IDs <=32 ASCII characters, input <=1 MiB JSON.
 * Invalid view preferences reset to safe defaults; invalid pattern data throws.
 */
export function normalizeProject(input) {
  const data = jsonCopy(input);
  if (!record(data)) fail('Project must be a JSON object');
  const wrapped = Object.hasOwn(data, 'format');
  if (wrapped && (data.format !== 'dsh-bead-project' || data.version !== 1)) fail('Unsupported project format or version');
  const pattern = patternCopy(wrapped ? data.pattern : data);
  let name = '未命名工程';
  if (wrapped && Object.hasOwn(data, 'name')) {
    if (typeof data.name !== 'string' || data.name.length > 120 || /[\u0000-\u001F\u007F]/.test(data.name)) fail('Invalid project name (maximum 120 characters)');
    name = data.name.trim() || name;
  }
  const v = wrapped && record(data.view) ? data.view : {};
  const view = {
    boardId: typeof v.boardId === 'string' && pattern.boards.some(b => b.id === v.boardId) ? v.boardId : '',
    labels: typeof v.labels === 'boolean' ? v.labels : true,
    grid: typeof v.grid === 'boolean' ? v.grid : true,
    fit: typeof v.fit === 'boolean' ? v.fit : false,
    zoom: Number.isInteger(v.zoom) && v.zoom >= 50 && v.zoom <= 400 ? v.zoom : 100,
    highlight: typeof v.highlight === 'string' && pattern.palette.some(p => p.id === v.highlight) ? v.highlight : ''
  };
  return {format: 'dsh-bead-project', version: 1, name, pattern, view, updatedAt: wrapped ? timestamp(data.updatedAt) : null};
}

/** Parse at most 1 MiB of UTF-8 JSON. A single optional UTF-8 BOM is accepted. */
export function parseProject(text) {
  if (typeof text !== 'string') fail('Project text must be a string');
  if (text.length > MAX_BYTES || encoder.encode(text).length > MAX_BYTES) fail('Project exceeds 1 MiB');
  const clean = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  let input;
  try { input = JSON.parse(clean); } catch { fail('Project is not valid JSON'); }
  return normalizeProject(input);
}
