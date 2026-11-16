// Portable, dependency-free ESM. Palette identifiers are generic, not brand codes.
const integer = (value, min, max, name) => {
  if (!Number.isInteger(value) || value < min || value > max) throw new RangeError(`${name} must be an integer in ${min}..${max}`);
  return value;
};
function pixels(data, length) {
  if ((!Array.isArray(data) && !(data instanceof Uint8ClampedArray)) || data.length !== length) throw new TypeError('RGBA must be an Array or Uint8ClampedArray of the exact pixel length');
  if (Array.isArray(data)) for (let i = 0; i < length; i++) {
    if (!Number.isInteger(data[i]) || data[i] < 0 || data[i] > 255) throw new RangeError(`RGBA[${i}] must be an integer in 0..255`);
  }
}
const pack = ([r, g, b]) => r * 65536 + g * 256 + b;
const unpack = key => [key >>> 16, (key >>> 8) & 255, key & 255];
const hex = rgb => '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
const xml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;'}[c]));

function box(colors) {
  const lo = [255, 255, 255], hi = [0, 0, 0];
  let weight = 0;
  for (const c of colors) {
    weight += c.count;
    c.rgb.forEach((v, i) => { lo[i] = Math.min(lo[i], v); hi[i] = Math.max(hi[i], v); });
  }
  const ranges = hi.map((v, i) => v - lo[i]);
  const range = Math.max(...ranges);
  return {colors, weight, range, axis: ranges.indexOf(range), key: Math.min(...colors.map(c => c.key))};
}

/** Deterministic weighted median-cut; RGB axis ties use R, G, B in that order.
 * Box ties use range*population, range, population, then smallest RGB key.
 * Representatives are frequency-weighted means; nearest-color ties use RGB order.
 */
export function generate({width, height, rgba, maxColors = 16, background = 'transparent', boardSize = 29} = {}) {
  integer(width, 1, 128, 'width'); integer(height, 1, 128, 'height');
  integer(maxColors, 2, 32, 'maxColors'); integer(boardSize, 8, 120, 'boardSize');
  if (!['transparent', 'white'].includes(background)) throw new TypeError('background must be transparent or white');
  pixels(rgba, width * height * 4);
  const histogram = new Map(), keys = [];
  for (let i = 0; i < rgba.length; i += 4) {
    const alpha = rgba[i + 3];
    if (background === 'transparent' && alpha < 128) { keys.push(-1); continue; }
    const rgb = [rgba[i], rgba[i + 1], rgba[i + 2]].map(v => background === 'white' ? Math.round((v * alpha + 255 * (255 - alpha)) / 255) : v);
    const key = pack(rgb);
    keys.push(key); histogram.set(key, (histogram.get(key) || 0) + 1);
  }
  const colors = [...histogram].sort((a, b) => a[0] - b[0]).map(([key, count]) => ({key, count, rgb: unpack(key)}));
  const boxes = colors.length ? [box(colors)] : [];
  while (boxes.length < maxColors) {
    const candidates = boxes.filter(b => b.colors.length > 1).sort((a, b) => b.range * b.weight - a.range * a.weight || b.range - a.range || b.weight - a.weight || a.key - b.key);
    if (!candidates.length) break;
    const current = candidates[0];
    const sorted = [...current.colors].sort((a, b) => a.rgb[current.axis] - b.rgb[current.axis] || a.key - b.key);
    let sum = 0, cut = 0;
    do { sum += sorted[cut++].count; } while (sum < current.weight / 2 && cut < sorted.length - 1);
    cut = Math.min(cut, sorted.length - 1);
    boxes.splice(boxes.indexOf(current), 1, box(sorted.slice(0, cut)), box(sorted.slice(cut)));
  }
  const representatives = boxes.map(b => [0, 1, 2].map(axis => Math.round(b.colors.reduce((s, c) => s + c.rgb[axis] * c.count, 0) / b.weight)));
  const palette = [...new Set(representatives.map(pack))].sort((a, b) => a - b).map(key => ({rgb: unpack(key), count: 0}));
  const mapping = new Map();
  for (const color of colors) {
    let best = 0, distance = Infinity;
    palette.forEach((p, i) => {
      const d = p.rgb.reduce((s, v, axis) => s + (v - color.rgb[axis]) ** 2, 0);
      if (d < distance) { best = i; distance = d; }
    });
    mapping.set(color.key, best);
  }
  let cells = keys.map(key => { if (key === -1) return -1; const i = mapping.get(key); palette[i].count++; return i; });
  // Remove unused representatives and keep canonical ascending-RGB palette order.
  const remap = new Map();
  const used = palette.filter((p, i) => { if (!p.count) return false; remap.set(i, remap.size); return true; }).map((p, i) => ({id: `C${String(i + 1).padStart(2, '0')}`, hex: hex(p.rgb), ...p}));
  cells = cells.map(i => i < 0 ? -1 : remap.get(i));
  const boards = [];
  for (let y = 0; y < height; y += boardSize) for (let x = 0; x < width; x += boardSize) {
    const row = y / boardSize + 1, col = x / boardSize + 1;
    const w = Math.min(boardSize, width - x), h = Math.min(boardSize, height - y);
    let count = 0;
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (cells[yy * width + xx] !== -1) count++;
    boards.push({id: `R${row}C${col}`, row, col, x, y, width: w, height: h, count});
  }
  return {version: '1.0', width, height, maxColors, boardSize, background, palette: used, cells, totalBeads: used.reduce((s, p) => s + p.count, 0), boards};
}

function validatePattern(pattern) {
  if (!pattern || typeof pattern !== 'object') throw new TypeError('pattern is required');
  integer(pattern.width, 1, 128, 'width'); integer(pattern.height, 1, 128, 'height');
  integer(pattern.boardSize, 8, 120, 'boardSize');
  if (!Array.isArray(pattern.palette) || pattern.palette.length > 32 || !Array.isArray(pattern.cells) || pattern.cells.length !== pattern.width * pattern.height) throw new TypeError('Invalid pattern');
  for (const p of pattern.palette) {
    if (!p || typeof p.id !== 'string' || !Array.isArray(p.rgb) || p.rgb.length !== 3) throw new TypeError('Invalid palette');
    p.rgb.forEach(v => integer(v, 0, 255, 'palette RGB'));
  }
  const counts = pattern.palette.map(() => 0);
  for (const cell of pattern.cells) { integer(cell, -1, pattern.palette.length - 1, 'cell'); if (cell >= 0) counts[cell]++; }
  return counts;
}
const csvCell = value => '"' + String(value).replace(/"/g, '""') + '"';
/** UTF-8 text, no BOM, RFC 4180 CRLF records. Counts are recomputed from cells. */
export function toCsv(pattern) {
  const counts = validatePattern(pattern);
  const rows = [['Color ID', 'HEX', 'R', 'G', 'B', 'Count']];
  pattern.palette.forEach((p, i) => rows.push([p.id.replace(/^([=+@-])/, "'$1"), hex(p.rgb), ...p.rgb, counts[i]]));
  rows.push(['TOTAL', '', '', '', '', counts.reduce((a, b) => a + b, 0)]);
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** Printable white paper. boardLines optionally marks board seams on the full sheet. */
export function toSvg(pattern, {boardId = null, cellSize = 24, labels = true, grid = true, boardLines = true} = {}) {
  validatePattern(pattern);
  integer(cellSize, 12, 64, 'cellSize');
  for (const [name, v] of Object.entries({labels, grid, boardLines})) if (typeof v !== 'boolean') throw new TypeError(`${name} must be boolean`);
  let view = {x: 0, y: 0, width: pattern.width, height: pattern.height};
  if (boardId !== null) {
    if (typeof boardId !== 'string') throw new TypeError('boardId must be a string');
    const match = /^R([1-9]\d*)C([1-9]\d*)$/.exec(boardId);
    if (!match) throw new RangeError('Unknown boardId');
    const x = (Number(match[2]) - 1) * pattern.boardSize, y = (Number(match[1]) - 1) * pattern.boardSize;
    if (x >= pattern.width || y >= pattern.height) throw new RangeError('Unknown boardId');
    view = {x, y, width: Math.min(pattern.boardSize, pattern.width - x), height: Math.min(pattern.boardSize, pattern.height - y)};
  }
  const counts = pattern.palette.map(() => 0), left = 52, top = 104;
  const plotWidth = view.width * cellSize, plotHeight = view.height * cellSize;
  const legendY = top + plotHeight + 40, sheetWidth = Math.max(360, plotWidth + left + 28);
  for (let y = 0; y < view.height; y++) for (let x = 0; x < view.width; x++) { const i = pattern.cells[(y + view.y) * pattern.width + x + view.x]; if (i >= 0) counts[i]++; }
  const legend = pattern.palette.map((p, i) => ({...p, count: counts[i]})).filter(p => p.count);
  const sheetHeight = legendY + Math.max(1, legend.length) * 25 + 60;
  const title = `Bead pattern${boardId ? ' / ' + boardId : ''}`;
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${sheetWidth}" height="${sheetHeight}" viewBox="0 0 ${sheetWidth} ${sheetHeight}" role="img" aria-labelledby="pattern-title">`, `<title id="pattern-title">${xml(title)}</title>`, `<rect width="100%" height="100%" fill="#FFFFFF"/>`, '<g font-family="Arial,sans-serif" fill="#172033">', `<text x="24" y="32" font-size="20" font-weight="bold">${xml(title)}</text>`, `<text x="24" y="56" font-size="12">${view.width} × ${view.height} cells · ${counts.reduce((a, b) => a + b, 0)} beads · global coordinates</text>`];
  for (let x = 0; x < view.width; x++) out.push(`<text x="${left + (x + .5) * cellSize}" y="${top - 10}" text-anchor="middle" font-size="10">${view.x + x + 1}</text>`);
  for (let y = 0; y < view.height; y++) {
    out.push(`<text x="${left - 12}" y="${top + (y + .5) * cellSize + 3}" text-anchor="end" font-size="10">${view.y + y + 1}</text>`);
    for (let x = 0; x < view.width; x++) {
      const i = pattern.cells[(y + view.y) * pattern.width + x + view.x];
      if (i < 0) continue;
      const p = pattern.palette[i], xx = left + x * cellSize, yy = top + y * cellSize;
      out.push(`<rect x="${xx}" y="${yy}" width="${cellSize}" height="${cellSize}" fill="${hex(p.rgb)}"/>`);
      if (labels) {
        const ink = p.rgb[0] * .299 + p.rgb[1] * .587 + p.rgb[2] * .114 > 145 ? '#172033' : '#FFFFFF';
        out.push(`<text x="${xx + cellSize / 2}" y="${yy + cellSize / 2}" dominant-baseline="central" text-anchor="middle" font-size="${Math.min(10, cellSize * .29)}" fill="${ink}">${xml(p.id)}</text>`);
      }
    }
  }
  if (grid) {
    out.push('<g stroke="#A0A7B2" stroke-width="0.6" fill="none">');
    for (let x = 0; x <= view.width; x++) out.push(`<path d="M${left + x * cellSize} ${top}v${plotHeight}"/>`);
    for (let y = 0; y <= view.height; y++) out.push(`<path d="M${left} ${top + y * cellSize}h${plotWidth}"/>`);
    out.push('</g>');
  }
  if (boardLines && boardId === null) {
    out.push('<g stroke="#172033" stroke-width="2" fill="none" data-board-lines="true">');
    for (let x = pattern.boardSize; x < view.width; x += pattern.boardSize) out.push(`<path d="M${left + x * cellSize} ${top}v${plotHeight}"/>`);
    for (let y = pattern.boardSize; y < view.height; y += pattern.boardSize) out.push(`<path d="M${left} ${top + y * cellSize}h${plotWidth}"/>`);
    out.push('</g>');
  }
  out.push(`<text x="24" y="${legendY}" font-size="14" font-weight="bold">Materials · generic palette (not brand codes)</text>`);
  legend.forEach((p, i) => {
    const y = legendY + 12 + i * 25;
    out.push(`<rect x="24" y="${y}" width="16" height="16" fill="${hex(p.rgb)}" stroke="#A0A7B2"/><text x="50" y="${y + 12}" font-size="12">${xml(p.id)} · ${hex(p.rgb)} · ${p.count} beads</text>`);
  });
  if (!legend.length) out.push(`<text x="24" y="${legendY + 28}" font-size="12">No beads (all cells empty)</text>`);
  out.push('</g></svg>');
  return out.join('\n');
}

/** Regular midpoint samples (at most 8×8 per target cell), alpha-weighted RGB.
 * Alpha is the sample mean; fully transparent results have RGB zero.
 * Upscaling uses nearest pixels; no random values and no input mutation.
 */
export function sampleImage({width, height, data} = {}, targetWidth, targetHeight) {
  integer(width, 1, 20000000, 'source width'); integer(height, 1, 20000000, 'source height');
  if (width * height > 20000000) throw new RangeError('Source image exceeds 20 megapixels');
  integer(targetWidth, 1, 128, 'targetWidth'); integer(targetHeight, 1, 128, 'targetHeight');
  pixels(data, width * height * 4);
  const output = new Uint8ClampedArray(targetWidth * targetHeight * 4);
  for (let y = 0; y < targetHeight; y++) for (let x = 0; x < targetWidth; x++) {
    const x0 = Math.floor(x * width / targetWidth), x1 = Math.max(x0 + 1, Math.floor((x + 1) * width / targetWidth));
    const y0 = Math.floor(y * height / targetHeight), y1 = Math.max(y0 + 1, Math.floor((y + 1) * height / targetHeight));
    const nx = Math.min(8, x1 - x0), ny = Math.min(8, y1 - y0), sums = [0, 0, 0, 0];
    for (let sy = 0; sy < ny; sy++) for (let sx = 0; sx < nx; sx++) {
      const xx = x0 + Math.floor((sx + .5) * (x1 - x0) / nx), yy = y0 + Math.floor((sy + .5) * (y1 - y0) / ny);
      const offset = (yy * width + xx) * 4;
      const alpha = data[offset + 3];
      for (let c = 0; c < 3; c++) sums[c] += data[offset + c] * alpha;
      sums[3] += alpha;
    }
    const target = (y * targetWidth + x) * 4;
    for (let c = 0; c < 3; c++) output[target + c] = sums[3] ? Math.round(sums[c] / sums[3]) : 0;
    output[target + 3] = Math.round(sums[3] / (nx * ny));
  }
  return {width: targetWidth, height: targetHeight, data: output};
}

/** Original hand-drawn 16×16 peach cat with a mint scarf. */
export function demoImage() {
  const art = [
    '................', '...oo......oo...', '...opo....opo...', '...opoooooopo...',
    '..offfffffffo...', '..offfffffffo...', '..ofefffffefo...', '..offffpffffo...',
    '..offfwwwfffo...', '...offfffffo....', '....ommmmmo.....', '...offmmfffo....',
    '...offmmfffo.oo.', '...offfffffofoo.', '....ooooooofoo..', '........oooo....'
  ];
  const colors = {o: [88, 62, 67], f: [255, 202, 145], p: [243, 140, 155], e: [53, 56, 73], w: [255, 240, 215], m: [102, 190, 167]};
  const data = new Uint8ClampedArray(16 * 16 * 4);
  art.forEach((line, y) => [...line].forEach((c, x) => { if (colors[c]) data.set([...colors[c], 255], (y * 16 + x) * 4); }));
  return {width: 16, height: 16, data};
}
