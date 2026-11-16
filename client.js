window.__ModuleLoader__.load({id:'@sanmumu/dsh-bead-studio',factory(require){const React=require('react');const core=(()=>{// Portable, dependency-free ESM. Palette identifiers are generic, not brand codes.
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
function generate({width, height, rgba, maxColors = 16, background = 'transparent', boardSize = 29} = {}) {
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
function toCsv(pattern) {
  const counts = validatePattern(pattern);
  const rows = [['Color ID', 'HEX', 'R', 'G', 'B', 'Count']];
  pattern.palette.forEach((p, i) => rows.push([p.id.replace(/^([=+@-])/, "'$1"), hex(p.rgb), ...p.rgb, counts[i]]));
  rows.push(['TOTAL', '', '', '', '', counts.reduce((a, b) => a + b, 0)]);
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** Printable white paper. boardLines optionally marks board seams on the full sheet. */
function toSvg(pattern, {boardId = null, cellSize = 24, labels = true, grid = true, boardLines = true} = {}) {
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
function sampleImage({width, height, data} = {}, targetWidth, targetHeight) {
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
function demoImage() {
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

/** Dependency-free vector PDF. No popup, print API, network, filesystem or bitmap conversion. */
function toPdf(pattern) {
  toCsv(pattern); // Shared strict pattern validation, including RGB and cell indices.
  const safe=s=>String(s).slice(0,120).replace(/[^\x20-\x7e]/g,'?').replace(/[\\()]/g,'\\$&');
  const n=x=>Number(x.toFixed(3)).toString();
  const color=rgb=>rgb.map(v=>n(v/255)).join(' ');
  const text=(x,y,size,value,ink='0.12 0.14 0.18')=>`${ink} rg BT /F1 ${n(size)} Tf 1 0 0 1 ${n(x)} ${n(y)} Tm (${safe(value)}) Tj ET\n`;
  const counts=pattern.palette.map(()=>0);for(const c of pattern.cells)if(c>=0)counts[c]++;
  const boards=[];for(let y=0;y<pattern.height;y+=pattern.boardSize)for(let x=0;x<pattern.width;x+=pattern.boardSize)boards.push({id:`R${y/pattern.boardSize+1}C${x/pattern.boardSize+1}`,x,y,width:Math.min(pattern.boardSize,pattern.width-x),height:Math.min(pattern.boardSize,pattern.height-y)});
  const pages=[];
  let summary=text(40,796,22,'Bead pattern - materials')+text(40,770,11,`${pattern.width} x ${pattern.height} cells | ${counts.reduce((a,b)=>a+b,0)} beads | ${boards.length} boards`)+text(40,748,10,`Board size: ${pattern.boardSize} x ${pattern.boardSize} | Engine ${pattern.version||'1.0'}`)+text(40,725,9,'Generic color IDs only. Match colors to real beads before purchase.');
  pattern.palette.forEach((p,i)=>{const y=696-i*18;summary+=`${color(p.rgb)} rg 40 ${y-3} 12 12 re f\n`+text(62,y,10,p.id)+text(120,y,9,'#'+p.rgb.map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase())+text(220,y,10,`${counts[i]} beads`);});
  summary+=text(40,70,9,'One board per following page. Coordinates refer to the complete pattern.')+text(40,54,9,'Large boards have small print. Zoom the vector PDF or print on larger paper.')+text(40,38,9,'1 / '+(boards.length+1));pages.push(summary);
  for(const [page,b] of boards.entries()){
    const s=Math.min(22,510/b.width,610/b.height),left=46,top=730,bottom=top-b.height*s;
    let total=0;let out=text(40,796,19,'Bead pattern / '+b.id)+text(40,772,10,`${b.width} x ${b.height} cells | columns ${b.x+1}-${b.x+b.width} | rows ${b.y+1}-${b.y+b.height}`);
    for(let y=0;y<b.height;y++)for(let x=0;x<b.width;x++){
      const c=pattern.cells[(b.y+y)*pattern.width+b.x+x];if(c<0)continue;total++;
      const p=pattern.palette[c],xx=left+x*s,yy=top-(y+1)*s;
      out+=`${color(p.rgb)} rg ${n(xx)} ${n(yy)} ${n(s)} ${n(s)} re f\n`;
      const size=s*.28,ink=p.rgb[0]*.299+p.rgb[1]*.587+p.rgb[2]*.114>145?'0.05 0.05 0.05':'1 1 1';
      out+=text(xx+s/2-p.id.length*size*.278,yy+s*.39,size,p.id,ink);
    }
    for(let x=0;x<=b.width;x++){const strong=(b.x+x)%5===0;out+=`${strong?'0.25 0.28 0.3':'0.6 0.6 0.6'} RG ${strong?'0.45':'0.15'} w ${n(left+x*s)} ${n(bottom)} m ${n(left+x*s)} ${n(top)} l S\n`;}
    for(let y=0;y<=b.height;y++){const strong=(b.y+y)%5===0;out+=`${strong?'0.25 0.28 0.3':'0.6 0.6 0.6'} RG ${strong?'0.45':'0.15'} w ${n(left)} ${n(top-y*s)} m ${n(left+b.width*s)} ${n(top-y*s)} l S\n`;}
    const coord=Math.min(8,s*.35);
    for(let x=0;x<b.width;x++)out+=text(left+(x+.5)*s-String(b.x+x+1).length*coord*.278,top+7,coord,String(b.x+x+1));
    for(let y=0;y<b.height;y++)out+=text(left-6-String(b.y+y+1).length*coord*.556,top-(y+.63)*s,coord,String(b.y+y+1));
    out+=text(40,90,10,`${b.id}: ${total} beads | Empty cells need no beads.`)+text(40,70,9,'Color IDs and total quantities: see the materials page.')+text(40,38,9,`${page+2} / ${boards.length+1}`);
    pages.push(out);
  }
  const objects=['','<< /Type /Catalog /Pages 2 0 R >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'];
  const kids=[];
  for(const content of pages){const pageId=objects.length,streamId=pageId+1;kids.push(`${pageId} 0 R`);objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.276 841.89] /Resources << /Font << /F1 3 0 R >> >> /Contents ${streamId} 0 R >>`);objects.push(`<< /Length ${content.length} >>\nstream\n${content}endstream`);}
  objects[2]=`<< /Type /Pages /Count ${pages.length} /Kids [${kids.join(' ')}] >>`;
  let pdf='%PDF-1.4\n%DSH vector bead pattern\n';const offsets=[0];
  for(let i=1;i<objects.length;i++){offsets.push(pdf.length);pdf+=`${i} 0 obj\n${objects[i]}\nendobj\n`;}
  const xref=pdf.length;pdf+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for(const offset of offsets.slice(1))pdf+=`${String(offset).padStart(10,'0')} 00000 n \n`;
  pdf+=`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

return {sampleImage,demoImage,toSvg,toCsv,toPdf};})();
const projects=(()=>{// Portable project import boundary. No storage, source-image retention or clock reads.
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
function normalizeProject(input) {
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
function parseProject(text) {
  if (typeof text !== 'string') fail('Project text must be a string');
  if (text.length > MAX_BYTES || encoder.encode(text).length > MAX_BYTES) fail('Project exceeds 1 MiB');
  const clean = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  let input;
  try { input = JSON.parse(clean); } catch { fail('Project is not valid JSON'); }
  return normalizeProject(input);
}

return {normalizeProject,parseProject};})();
const editor=(()=>{const {normalizeProject}=projects;
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
function paintCells(pattern, indices, colorId) {
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
function mergeColors(pattern, fromId, toId) {
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
function getCellInfo(pattern, index) {
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
function createHistory(limit = 50) {
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

return {paintCells,mergeColors,getCellInfo,createHistory};})();
// Native SVG elements: text and paths stay vector at every zoom and display density.
function createPreview(React) {
  const h=React.createElement;
  return function Preview({pattern,boardId,labels,grid,fit,zoom,highlight='',t,strokePreview=null}) {
    const b=pattern.boards.find(b=>b.id===boardId)||{x:0,y:0,width:pattern.width,height:pattern.height};
    const s=32,m=32,w=b.width*s+m*2,height=b.height*s+m*2;
    const nodes=React.useMemo(()=>{
      const output=[h('rect',{key:'paper',width:w,height,fill:'#ffffff'})];
      const text=(key,x,y,value,fill='#333333',size=11)=>h('text',{key,x,y,fill,fontSize:size,fontFamily:'Arial, sans-serif',textAnchor:'middle',dominantBaseline:'central'},value);
      for(let y=0;y<b.height;y++)for(let x=0;x<b.width;x++){
        const p=pattern.palette[pattern.cells[(b.y+y)*pattern.width+b.x+x]],xx=m+x*s,yy=m+y*s,key=`${x}:${y}`;
        if(p){
          const cell=[h('rect',{key:'c'+key,x:xx,y:yy,width:s,height:s,fill:p.hex,shapeRendering:'crispEdges'})];
          if(labels){const [r,g,blue]=p.rgb;cell.push(text('t'+key,xx+s/2,yy+s/2,p.id,r*.299+g*.587+blue*.114>145?'#111111':'#ffffff'));}
          output.push(h('g',{key:'cell'+key,opacity:highlight && p.id!==highlight ? .18 : 1,'data-color-id':p.id},cell));
        }else output.push(h('circle',{key:'e'+key,cx:xx+s/2,cy:yy+s/2,r:1,fill:'#bbbbbb'}));
      }
      if(grid){
        for(let x=0;x<=b.width;x++)output.push(h('path',{key:'vx'+x,d:`M${m+x*s} ${m}v${b.height*s}`,stroke:(b.x+x)%pattern.boardSize===0?'#222222':'#999999',strokeWidth:(b.x+x)%pattern.boardSize===0?2:((b.x+x)%5===0?1:.5),fill:'none'}));
        for(let y=0;y<=b.height;y++)output.push(h('path',{key:'hy'+y,d:`M${m} ${m+y*s}h${b.width*s}`,stroke:(b.y+y)%pattern.boardSize===0?'#222222':'#999999',strokeWidth:(b.y+y)%pattern.boardSize===0?2:((b.y+y)%5===0?1:.5),fill:'none'}));
      }
      for(let x=0;x<b.width;x++)output.push(text('col'+x,m+x*s+s/2,m/2,String(b.x+x+1)));
      for(let y=0;y<b.height;y++)output.push(text('row'+y,m/2,m+y*s+s/2,String(b.y+y+1)));
      return output;
    },[pattern,boardId,labels,grid,highlight]);
    // This transient SVG layer never enters pattern, counts, history or exports.
    const draft=[];
    if(strokePreview){
      const color=pattern.palette.find(p=>p.id===strokePreview.colorId),erase=strokePreview.erase;
      if(erase||color)for(const index of strokePreview.indices){
        const x=index%pattern.width-b.x,y=Math.floor(index/pattern.width)-b.y;
        if(x<0||y<0||x>=b.width||y>=b.height)continue;
        const xx=m+x*s,yy=m+y*s;
        draft.push(h('g',{key:index,'data-draft-index':index},
          h('rect',{x:xx,y:yy,width:s,height:s,fill:erase?'#ffffff':color.hex,shapeRendering:'crispEdges'}),
          erase?h('circle',{cx:xx+s/2,cy:yy+s/2,r:1,fill:'#bbbbbb'}):labels?h('text',{x:xx+s/2,y:yy+s/2,fill:color.rgb[0]*.299+color.rgb[1]*.587+color.rgb[2]*.114>145?'#111111':'#ffffff',fontSize:11,fontFamily:'Arial, sans-serif',textAnchor:'middle',dominantBaseline:'central'},color.id):null));
      }
    }
    const overlay=draft.length?h('g',{key:'stroke-preview','data-stroke-preview':strokePreview.erase?'erase':'paint',pointerEvents:'none',style:{pointerEvents:'none'},'aria-hidden':true},draft):null;
    return h('svg',{xmlns:'http://www.w3.org/2000/svg',viewBox:`0 0 ${w} ${height}`,width:fit?'100%':w*zoom/100,height:fit?undefined:height*zoom/100,style:{display:'block',flexShrink:0,width:fit?'100%':w*zoom/100,height:fit?'auto':height*zoom/100,maxWidth:'none',background:'#ffffff'},role:'img','aria-label':t('previewAria'),'data-preview-kind':'vector','data-zoom':fit?'fit':zoom},overlay?[...nodes.slice(0,1+b.width*b.height),overlay,...nodes.slice(1+b.width*b.height)]:nodes);
  };
}

// No document/window input listeners: gestures belong only to this viewport.
function clampViewportZoom(value) {
  return Math.max(50,Math.min(400,Math.round(Number.isFinite(value)?value:100)));
}

// Keep the same SVG point under a viewport-local anchor, including SVG padding.
function viewportAnchorScroll(scroll,anchor,oldOrigin,newOrigin,oldSize,newSize,maxScroll) {
  const value=oldSize>0?(scroll+anchor-oldOrigin)*newSize/oldSize+newOrigin-anchor:0;
  return Math.max(0,Math.min(Math.max(0,maxScroll),value));
}

// SVG uses a 32-unit margin and 32-unit cells at every rendered scale.
function viewportCellAt(pattern,boardId,rect,clientX,clientY) {
  if(!pattern||!rect||!(rect.width>0&&rect.height>0))return null;
  const b=pattern.boards.find(b=>b.id===boardId)||{x:0,y:0,width:pattern.width,height:pattern.height};
  const x=Math.floor(((clientX-rect.left)*(b.width*32+64)/rect.width-32)/32);
  const y=Math.floor(((clientY-rect.top)*(b.height*32+64)/rect.height-32)/32);
  return Number.isFinite(x)&&Number.isFinite(y)&&x>=0&&y>=0&&x<b.width&&y<b.height?(b.y+y)*pattern.width+b.x+x:null;
}

function viewportLineIndices(from,to,width) {
  let x=from%width,y=Math.floor(from/width);const tx=to%width,ty=Math.floor(to/width),dx=Math.abs(tx-x),dy=-Math.abs(ty-y),sx=x<tx?1:-1,sy=y<ty?1:-1;
  let error=dx+dy;const result=[];
  for(;;){result.push(y*width+x);if(x===tx&&y===ty)break;const twice=2*error;if(twice>=dy){error+=dy;x+=sx;}if(twice<=dx){error+=dx;y+=sy;}}
  return result;
}

function createViewport(React,Preview) {
  const h=React.createElement;
  return function Viewport({pattern,boardId,labels,grid,fit,zoom,highlight='',t,setZoom,setFit,resetKey,mode='view',tool='brush',brushColorId='',disabled=false,onStroke,onPick,onHover,onUndo,onRedo}) {
    const ref=React.useRef(null),latest=React.useRef(null),previous=React.useRef(null),pending=React.useRef(null),cancelDrag=React.useRef(()=>{});
    const [strokePreview,setStrokePreview]=React.useState(null);
    latest.current={pattern,boardId,fit,zoom,setZoom,setFit,resetKey,mode,tool,brushColorId,disabled,onStroke,onPick,onHover,onUndo,onRedo};
    function measure(el) {
      const svg=el.querySelector('svg');if(!svg)return null;
      const r=svg.getBoundingClientRect(),box=el.getBoundingClientRect();
      return {width:r.width,height:r.height,x:r.left-box.left-el.clientLeft+el.scrollLeft,y:r.top-box.top-el.clientTop+el.scrollTop};
    }
    function reconcile() {
      const el=ref.current;if(!el)return;
      const p=latest.current,old=previous.current;
      if(old&&(old.mode!==p.mode||old.tool!==p.tool||old.brushColorId!==p.brushColorId||old.disabled!==p.disabled||old.pattern!==p.pattern))cancelDrag.current();
      const current=measure(el);if(!current){cancelDrag.current();previous.current=null;return;}
      if(!old||old.patternWidth!==p.pattern?.width||old.patternHeight!==p.pattern?.height||old.boardId!==p.boardId||old.resetKey!==p.resetKey){
        cancelDrag.current();pending.current=null;el.scrollLeft=0;el.scrollTop=0;
      }else if(old.width!==current.width||old.height!==current.height||old.fit!==p.fit||old.zoom!==p.zoom){
        cancelDrag.current();
        const anchor=pending.current||{x:el.clientWidth/2,y:el.clientHeight/2,left:old.left,top:old.top,geometry:old};
        const g=anchor.geometry;
        el.scrollLeft=viewportAnchorScroll(anchor.left,anchor.x,g.x,current.x,g.width,current.width,el.scrollWidth-el.clientWidth);
        el.scrollTop=viewportAnchorScroll(anchor.top,anchor.y,g.y,current.y,g.height,current.height,el.scrollHeight-el.clientHeight);
        pending.current=null;
      }
      previous.current={...current,left:el.scrollLeft,top:el.scrollTop,pattern:p.pattern,patternWidth:p.pattern?.width,patternHeight:p.pattern?.height,boardId:p.boardId,resetKey:p.resetKey,fit:p.fit,zoom:p.zoom,mode:p.mode,tool:p.tool,brushColorId:p.brushColorId,disabled:p.disabled};
    }
    React.useLayoutEffect(reconcile);
    React.useEffect(()=>{
      const el=ref.current;if(!el)return;
      let drag=null,space=false,hover=null,frame=null,alive=true;
      const requestFrame=typeof requestAnimationFrame==='function'?requestAnimationFrame:fn=>setTimeout(fn,16);
      const cancelFrame=typeof cancelAnimationFrame==='function'?cancelAnimationFrame:clearTimeout;
      const preview=()=>{
        if(frame!==null)return;
        frame=requestFrame(()=>{
          frame=null;if(!alive||drag?.kind!=='stroke')return;
          const p=latest.current;
          setStrokePreview({indices:[...drag.indices],colorId:p.brushColorId,erase:p.tool==='eraser'});
        });
      };
      const cursor=()=>{const p=latest.current;el.style.cursor=p.disabled?'default':drag?.kind==='pan'?'grabbing':p.mode==='view'||space?'grab':'crosshair';};
      const setHover=index=>{if(hover!==index){hover=index;latest.current.onHover?.(index);}};
      const cell=e=>{const p=latest.current;return viewportCellAt(p.pattern,p.boardId,el.querySelector('svg')?.getBoundingClientRect(),e.clientX,e.clientY);};
      const append=index=>{
        if(!drag||drag.kind!=='stroke')return;
        if(index===null){drag.last=null;return;}
        const size=drag.indices.size;
        for(const i of drag.last===null?[index]:viewportLineIndices(drag.last,index,latest.current.pattern.width))drag.indices.add(i);
        drag.last=index;if(size!==drag.indices.size)preview();
      };
      const scroll=()=>{
        const old=previous.current,g=measure(el);
        if(old&&g&&old.width===g.width&&old.height===g.height){old.left=el.scrollLeft;old.top=el.scrollTop;}
      };
      const finish=()=>{
        if(frame!==null){cancelFrame(frame);frame=null;}
        if(alive)setStrokePreview(null);
        const id=drag?.id;drag=null;
        if(id!==undefined&&el.hasPointerCapture?.(id))el.releasePointerCapture(id);
        cursor();
      };
      const cancel=()=>{space=false;finish();setHover(null);};
      cancelDrag.current=cancel;
      const down=e=>{
        const p=latest.current;
        if(p.disabled||!p.pattern||e.pointerType==='touch'||drag||!(e.button===0||e.button===1))return;
        e.preventDefault();el.focus({preventScroll:true});
        if(p.mode==='view'||e.button===1||space){
          drag={kind:'pan',id:e.pointerId,x:e.clientX,y:e.clientY,left:el.scrollLeft,top:el.scrollTop};
        }else{
          const index=cell(e);setHover(index);if(index===null)return;
          if(p.tool==='pick'||p.tool==='picker'){p.onPick?.(index);return;}
          drag={kind:'stroke',id:e.pointerId,indices:new Set(),last:null};append(index);
        }
        el.setPointerCapture(e.pointerId);cursor();
      };
      const move=e=>{
        if(latest.current.disabled)return;
        if(drag&&drag.id!==e.pointerId)return;
        const index=cell(e);setHover(index);
        if(!drag)return;e.preventDefault();
        if(drag.kind==='stroke'){append(index);return;}
        el.scrollLeft=drag.left+drag.x-e.clientX;el.scrollTop=drag.top+drag.y-e.clientY;scroll();
      };
      const up=e=>{
        if(drag?.id!==e.pointerId)return;
        if(drag.kind==='stroke')append(cell(e));
        const indices=drag.kind==='stroke'?[...drag.indices]:null;finish();
        if(indices?.length&&!latest.current.disabled)latest.current.onStroke?.(indices);
      };
      const abort=e=>{if(drag?.id===e.pointerId)cancel();};
      const leave=()=>{setHover(null);if(drag?.kind==='stroke')drag.last=null;};
      const keydown=e=>{
        const p=latest.current;if(e.target!==el||p.disabled)return;
        if((e.ctrlKey||e.metaKey)&&!e.altKey&&(e.code==='KeyZ'||e.key?.toLowerCase()==='z')){
          e.preventDefault();cancel();(e.shiftKey?p.onRedo:p.onUndo)?.();return;
        }
        if(e.code!=='Space')return;e.preventDefault();space=true;cursor();
      };
      const keyup=e=>{if(e.code!=='Space'||!space)return;e.preventDefault();space=false;cursor();};
      const blur=cancel;
      const wheel=e=>{
        if(latest.current.disabled||!(e.ctrlKey||e.metaKey)||!e.deltaY)return;
        const p=latest.current,g=measure(el);if(!g||!p.pattern)return;
        e.preventDefault();finish();
        const b=p.pattern.boards.find(b=>b.id===p.boardId)||p.pattern;
        const actualZoom=g.width/(b.width*32+64)*100;
        const base=pending.current?.targetZoom??(p.fit?actualZoom:clampViewportZoom(p.zoom));
        const next=clampViewportZoom(base*(e.deltaY<0?1.1:1/1.1));
        if(!p.fit&&next===clampViewportZoom(p.zoom)){
          if(pending.current){pending.current=null;p.setZoom(next);}
          return;
        }
        const box=el.getBoundingClientRect();
        pending.current={x:e.clientX-box.left-el.clientLeft,y:e.clientY-box.top-el.clientTop,left:el.scrollLeft,top:el.scrollTop,geometry:g,targetZoom:next};
        p.setFit(false);p.setZoom(next);
      };
      const aux=e=>{if(!latest.current.disabled&&e.button===1)e.preventDefault();};
      const listeners={scroll,pointerdown:down,pointermove:move,pointerup:up,pointercancel:abort,lostpointercapture:abort,pointerleave:leave,keydown,keyup,blur,wheel,auxclick:aux};
      for(const [type,fn]of Object.entries(listeners))el.addEventListener(type,fn,type==='wheel'?{passive:false}:false);
      const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(reconcile);observer?.observe(el);
      return()=>{
        for(const [type,fn]of Object.entries(listeners))el.removeEventListener(type,fn,false);
        observer?.disconnect();alive=false;cancel();cancelDrag.current=()=>{};pending.current=null;previous.current=null;
      };
    },[]);
    return h('div',{ref,className:'bs-preview',tabIndex:0,role:'region','aria-disabled':disabled||undefined,'aria-label':t('viewportAria'),title:t(mode==='view'?'viewportHint':'viewportEditHint'),style:{overflow:'auto',userSelect:'none',cursor:disabled?'default':mode==='view'?'grab':'crosshair',overscrollBehavior:'contain',overflowAnchor:'none'}},
      pattern?h(Preview,{pattern,boardId,labels,grid,fit,zoom:clampViewportZoom(zoom),highlight,t,strokePreview}):null);
  };
}

// One serialized optimistic save queue; no browser storage and no original-image persistence.
function createAutosave({load,save,onState=()=>{},delay=250}) {
  let revision=0,ready=false,blocked=false,pending=null,timer=null,running=null,last='',disposed=false,loading=false;
  const fingerprint=p=>JSON.stringify({...p,updatedAt:null});
  const notify=state=>{if(!disposed)onState(state);};
  async function open(){
    if(loading||running)throw new Error('A project operation is already running.');
    loading=true;ready=false;blocked=false;pending=null;clearTimeout(timer);notify({state:'loading'});
    try{const row=await load();if(disposed)throw new Error('Project reader disposed.');revision=row.revision;last=row.project?fingerprint(row.project):'';ready=true;notify({state:'saved',updatedAt:row.project?.updatedAt||null});return row;}
    catch(e){blocked=true;notify({state:'error',message:e.message});throw e;}finally{loading=false;}
  }
  function schedule(project){
    if(!ready||disposed)return;
    const key=fingerprint(project);if(key===last&&!running){pending=null;clearTimeout(timer);return;}
    pending={project,key};clearTimeout(timer);
    if(blocked)return;
    notify({state:'pending'});timer=setTimeout(()=>{flush().catch(()=>{});},delay);
  }
  function flush(){
    clearTimeout(timer);
    if(running)return running;
    if(!ready||blocked||!pending)return Promise.resolve();
    running=(async()=>{
      while(pending&&!blocked){
        const item=pending;pending=null;if(item.key===last)continue;
        notify({state:'saving'});
        try{const row=await save(item.project,revision);revision=row.revision;last=item.key;notify({state:pending?'pending':'saved',updatedAt:row.project?.updatedAt||null});}
        catch(e){if(!pending)pending=item;blocked=true;notify({state:e.code==='CONFLICT'?'conflict':'error',message:e.message});throw e;}
      }
    })().finally(()=>{running=null;});
    return running;
  }
  async function retry(){if(!ready)throw new Error('Load saved project before retrying.');blocked=false;return flush();}
  function close(){clearTimeout(timer);const p=flush();disposed=true;return p;}
  function discard(){clearTimeout(timer);pending=null;disposed=true;return running?running.catch(()=>{}):Promise.resolve();}
  return {open,schedule,flush,retry,close,discard,get dirty(){return !!pending||!!running;}};
}

// A page owns one selected record. Every save closes over its record ID.
function createLibrarySession({request,onState=()=>{},delay=250}) {
  let active=null,closed=false,operation=false;
  const emit=s=>{if(!closed)onState(s);};
  async function flush(){if(!active)return;await active.queue.flush();if(active.queue.dirty){const e=Error('Unsaved changes prevent switching projects. Export JSON or resolve the save error first.');e.code='UNSAVED';throw e;}}
  async function attach(row,discard=false){
    if(closed)throw Error('Library session closed.');
    const entry={row,queue:null};
    entry.queue=createAutosave({delay,load:async()=>row,save:async(project,expectedRevision)=>{const saved=await request({action:'save',id:row.id,project,expectedRevision});entry.row=saved;return saved;},onState:s=>{if(active===entry)emit(s);}});
    await entry.queue.open();
    if(closed){await entry.queue.discard();throw Error('Library session closed.');}
    const previous=active;try{if(previous&&!discard){await previous.queue.flush();if(previous.queue.dirty)throw Error('Unsaved changes prevent switching projects.');}if(closed)throw Error('Library session closed.');if(previous)await previous.queue.discard();}catch(e){await entry.queue.discard();throw e;}if(closed){await entry.queue.discard();throw Error('Library session closed.');}active=entry;emit({state:'saved',updatedAt:row.project.updatedAt});return row;
  }
  async function exclusive(fn){if(closed)throw Error('Library session closed.');if(operation)throw Error('A project operation is running.');operation=true;try{return await fn();}finally{operation=false;}}
  async function open(id,{discard=false}={}){return exclusive(async()=>{
    if(discard&&active)await active.queue.flush().catch(()=>{});else await flush();
    if(!id)id=active?.row.id;
    if(!id){const list=await request({action:'list',limit:1});id=list.items[0]?.id;}
    if(!id){emit({state:'saved'});return{id:null,revision:0,project:null};}
    const row=await request({action:'get',id});if(row.deletedAt)throw Error('Restore this project from trash before opening it.');return attach(row,discard);
  });}
  async function create(project,name){return exclusive(async()=>{await flush();return attach(await request({action:'create',...(project?{project}:{}),...(name?{name}:{})}));});}
  async function duplicate(){return exclusive(async()=>{await flush();if(!active)throw Error('No current project.');return attach(await request({action:'duplicate',id:active.row.id,expectedRevision:active.row.revision}));});}
  async function mutate(action,item,extra={}){return exclusive(async()=>{
    await flush();const isCurrent=active?.row.id===item.id;const expectedRevision=isCurrent?active.row.revision:item.revision;
    const result=await request({action,id:item.id,expectedRevision,...extra});
    if(isCurrent&&['trash','purge'].includes(action)){await active.queue.close();active=null;emit({state:'saved'});}
    return result;
  });}
  return {open,create,duplicate,mutate,flush,schedule:p=>active?.queue.schedule(p),retry:()=>active?.queue.retry()||Promise.resolve(),
    async close(){closed=true;await active?.queue.close();},get dirty(){return !!active?.queue.dirty;},get id(){return active?.row.id||null;},get row(){return active?.row||null;},get operating(){return operation;}};
}

function exportFilename(name,pattern,boardId='') {
  const stem=String(name||'bead').replace(/\.[a-zA-Z0-9]{1,6}$/,'').replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g,'_').replace(/^\.+|[. ]+$/g,'').slice(0,60)||'bead';
  return `${stem}-${pattern.width}x${pattern.height}${boardId?'-'+boardId:''}`;
}
async function prepareExport(core,kind,{pattern,view,name,project}) {
  const filename=exportFilename(name,pattern,['png','svg'].includes(kind)?view.boardId:'');
  let data,type,extension=kind;
  const svg=()=>core.toSvg(pattern,{boardId:view.boardId||null,labels:view.labels,grid:view.grid,cellSize:32});
  if(kind==='svg'){data=svg();type='image/svg+xml';}
  else if(kind==='csv'){data='\uFEFF'+core.toCsv(pattern);type='text/csv;charset=utf-8';}
  else if(kind==='json'){data=JSON.stringify(project,null,2);type='application/json';}
  else if(kind==='pdf'){data=core.toPdf(pattern);type='application/pdf';}
  else if(kind==='png'){
    const url=URL.createObjectURL(new Blob([svg()],{type:'image/svg+xml'}));
    try{const image=new Image();image.src=url;await image.decode();if(image.width*image.height>25000000)throw new Error('Image exceeds 25 MP; select one board or use SVG.');const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;canvas.getContext('2d').drawImage(image,0,0);data=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!data)throw new Error('PNG encoding failed.');type='image/png';}finally{URL.revokeObjectURL(url);}
  }else throw new Error('Unsupported export format.');
  return {blob:data instanceof Blob?data:new Blob([data],{type}),filename:filename+(kind==='pdf'?'-boards':kind==='csv'?'-materials':'')+'.'+extension,type};
}

// Suggested bead density, not source pixel dimensions. Keep board/color choices.
function imageSizing(image, previous, keep=false) {
  if(!image || !Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width<1 || image.height<1)throw Error('Invalid source dimensions');
  if(keep)return {...previous};
  return {...previous,width:Math.max(8,Math.min(128,Math.round(48*image.width/Math.max(image.width,image.height)))),crop:'original'};
}

// Same-origin API only. No returned URL is ever fetched.
async function beadAiPost(body) {
  const response=await fetch('/api/local-bead-studio/ai',{method:'POST',headers:{'Content-Type':'application/json','X-DSH-Bead-Studio':'1'},body:JSON.stringify(body)});
  const data=await response.json();if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);return data;
}
async function encodeBeadAiSource(source) {
  if(!source||!Number.isInteger(source.width)||!Number.isInteger(source.height)||source.width<1||source.height<1||source.data?.length!==source.width*source.height*4)throw new Error('Invalid source image');
  const input=document.createElement('canvas');input.width=source.width;input.height=source.height;
  const context=input.getContext('2d'),pixels=context.createImageData(source.width,source.height);
  pixels.data.set(source.data);context.putImageData(pixels,0,0);
  const ratio=Math.min(1,1024/Math.max(source.width,source.height)),output=document.createElement('canvas');
  output.width=Math.max(1,Math.round(source.width*ratio));output.height=Math.max(1,Math.round(source.height*ratio));
  output.getContext('2d').drawImage(input,0,0,output.width,output.height);return output.toDataURL('image/png');
}
function beadAiImageBytes(url) {
  if(typeof url!=='string'||url.length>40*1024*1024)throw new Error('Invalid AI image');
  const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(url);
  if(!match||match[2].length%4!==0)throw new Error('Expected PNG, JPEG or WebP data URL');
  const raw=atob(match[2]),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0)),is=(offset,values)=>values.every((n,i)=>bytes[offset+i]===n);
  const valid=match[1]==='png'?is(0,[137,80,78,71,13,10,26,10]):match[1]==='jpeg'?is(0,[255,216,255]):is(0,[82,73,70,70])&&is(8,[87,69,66,80]);
  if(!valid)throw new Error('Image signature does not match its type');return {bytes,type:'image/'+match[1]};
}
async function decodeBeadAiImage(url) {
  const {bytes,type}=beadAiImageBytes(url),bitmap=await createImageBitmap(new Blob([bytes],{type}));
  try{
    if(bitmap.width<1||bitmap.height<1||bitmap.width*bitmap.height>20000000)throw new Error('AI image exceeds 20 million pixels');
    const c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;const g=c.getContext('2d');g.drawImage(bitmap,0,0);return g.getImageData(0,0,c.width,c.height);
  }finally{bitmap.close();}
}

// Keep only public configuration metadata, even if a buggy server returns extra fields.
function beadAiPublicConfig(value={}) {
  return {baseUrl:typeof value.baseUrl==='string'?value.baseUrl:'',model:typeof value.model==='string'?value.model:'',endpoint:typeof value.endpoint==='string'?value.endpoint:'',hasKey:!!value.hasKey,revision:typeof value.revision==='string'?value.revision:'',keyStorage:'host-credentials'};
}
async function saveBeadAiConfig({baseUrl,model,apiKey='',config,clearKey=()=>{}},post=beadAiPost) {
  try{
    if(baseUrl!==config.baseUrl&&!apiKey.trim())throw new Error('A new API key is required when changing the base URL');
    return beadAiPublicConfig(await post({action:'custom_save',baseUrl,model,...(apiKey?{apiKey}:{}),expectedRevision:config.revision}));
  }finally{clearKey();}
}

async function readBeadAiModels({baseUrl,apiKey='',config},post=beadAiPost) {
  if(baseUrl!==config.baseUrl&&!apiKey.trim())throw new Error('A new API key is required when changing the base URL');
  const result=await post({action:'custom_models',baseUrl,...(apiKey?{apiKey}:{}),expectedRevision:config.revision});
  if(!Array.isArray(result.models))throw new Error('No model list was returned; you can enter a model manually');
  const seen=new Set(),models=[];
  for(const item of result.models){if(typeof item?.id!=='string'||!item.id||seen.has(item.id))continue;seen.add(item.id);models.push({id:item.id,imageCandidate:item.imageCandidate===true,editingVerified:false});}
  return {models,truncated:result.truncated===true};
}

function createBeadAiController({post=beadAiPost,encode=encodeBeadAiSource,decode=decodeBeadAiImage,onChange=()=>{},onBusyChange=()=>{},now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout}={}) {
  let state={provider:'codex',status:null,phase:'idle',candidate:null,error:'',pendingStart:false},active=null,disposed=false,statusVersion=0;
  const snapshot=()=>({...state,busy:!!active||state.pendingStart});
  let reportedBusy=false;
  function emit(patch={}){state={...state,...patch};const value=snapshot();if(!disposed){onChange(value);if(value.busy!==reportedBusy){reportedBusy=value.busy;onBusyChange(value.busy);}}}
  const valid=job=>!disposed&&active===job;
  function clear(job){if(job?.timer!==undefined)clearTimer(job.timer);if(job?.deadlineTimer!==undefined)clearTimer(job.deadlineTimer);}
  function remoteCancel(job){if(!job.id||job.cancelSent)return;job.cancelSent=true;Promise.resolve().then(()=>post({action:'cancel',id:job.id})).catch(()=>{});}
  function cancel(phase='cancelled') {const job=active;active=null;clear(job);if(job){job.cancelled=true;remoteCancel(job);}emit({phase,candidate:null,error:''});}
  function fail(job,error){if(!valid(job))return;active=null;clear(job);job.cancelled=true;remoteCancel(job);emit({phase:'failed',candidate:null,error:String(error?.message||error)});}
  async function accept(job,result){
    if(result?.id&&!job.id)job.id=result.id;
    if(!valid(job)){if(job.cancelled)remoteCancel(job);return;}
    if(result.state==='failed'){fail(job,result.error||'AI generation failed');return;}
    if(result.state==='succeeded'){
      try{const image=await decode(result.imageDataUrl);if(!valid(job))return;active=null;clear(job);emit({phase:'succeeded',candidate:image,error:''});}catch(e){fail(job,e);}return;
    }
    if(result.state!=='running'||!job.id){fail(job,'Invalid AI job response');return;}
    if(now()-job.started>=360000){fail(job,'AI generation timed out');return;}
    emit({phase:'running'});
    job.timer=setTimer(async()=>{if(!valid(job))return;try{await accept(job,await post({action:'poll',id:job.id}));}catch(e){fail(job,e);}},2000);
  }
  return {
    snapshot,
    async status(provider=state.provider){
      if(!['codex','custom'].includes(provider)||disposed)return;
      const version=++statusVersion;if(provider!==state.provider){cancel('idle');emit({provider,status:null});}
      try{const result=await post({action:'status',provider});if(!disposed&&version===statusVersion){if(state.status&&(state.status.endpoint!==result.endpoint||state.status.revision!==result.revision))cancel('idle');emit({status:result});}}
      catch(e){if(!disposed&&version===statusVersion)emit({status:{available:false,reason:String(e.message||e)}});}
    },
    async start({source,consent,sessionId,provider=state.provider,style='faithful',background='keep',notes='',width,maxColors}){
      if(disposed||active||state.pendingStart||!state.status?.available||!source||!consent)return false;
      if(provider!==state.provider)return false;
      if(provider==='codex'&&(typeof sessionId!=='string'||!sessionId||!state.status.sessions?.some(s=>s.id===sessionId)))return false;
      if(provider==='custom'&&typeof state.status.revision!=='string')return false;
      const route=provider==='custom'?{provider,configRevision:state.status.revision}:{provider,sessionId};
      if(!['faithful','cute','outline'].includes(style)||!['keep','white'].includes(background)||typeof notes!=='string'||notes.length>500)return false;
      const job={started:now(),cancelled:false};active=job;emit({phase:'preparing',candidate:null,error:''});
      job.deadlineTimer=setTimer(()=>fail(job,'AI generation timed out'),360000);
      try{
        const imageDataUrl=await encode(source);if(!valid(job))return false;
        emit({phase:'running',pendingStart:true});
        let result;try{result=await post({action:'start',...route,imageDataUrl,style,background,notes,width,maxColors});}
        finally{emit({pendingStart:false});}
        await accept(job,result);return true;
      }catch(e){fail(job,e);return false;}
    },
    cancel,
    reset(){cancel('idle');},
    adopt(callback){if(disposed||active||state.pendingStart||state.phase!=='succeeded'||!state.candidate)return false;const image=state.candidate;emit({phase:'adopted',candidate:null});callback(image);return true;},
    dispose(){disposed=true;cancel('idle');statusVersion++;if(reportedBusy){reportedBusy=false;onBusyChange(false);}}
  };
}


const aiPanelLocales={
  zh:{aiReadModels:'连接并读取模型（联网，不生成图片）',aiModelsHelp:'仅点击后向所填基础地址发送认证信息并 GET /models；不上传图片，不验证图像编辑能力。',aiModelsFilter:'显示全部模型',aiModelsSelect:'选择模型 ID（仅修改草稿）',aiModelsPlaceholder:'请手动选择，不会自动保存',aiModelsUnverified:'图像候选筛选仅基于名称，编辑能力未验证；可切换全部或继续手填模型。',aiModelsEmpty:'没有匹配的模型；可切换全部或手填。',aiModelsTruncated:'模型列表已截断，仍可手填精确 ID。',aiModelsLoading:'正在读取模型列表…',aiModelsKey:'读取成功后，新输入密钥仅暂留前端内存供保存配置使用，不回显、不写入工程或聊天；失败会清空。',aiProvider:'图像引擎',aiCodex:'Codex 订阅',aiCustom:'自定义 API',aiBaseUrl:'HTTPS 基础地址（含供应商要求的 /v1）',aiCustomModel:'图像模型',aiApiKey:'API Key（留空仅保留同地址已有密钥）',aiKeyPresent:'已有密钥（不回显）',aiKeyMissing:'尚无密钥',aiCustomHelp:'仅支持 HTTPS 公网 OpenAI 兼容 images/edits；自动在基础地址后追加 /images/edits。不保证所有供应商兼容。',aiKeyStorage:'密钥交给 DSH 主机凭据存储；默认本机后端为明文文件，受文件权限保护，并非加密保险箱。建议使用专用限额密钥。',aiSaveConfig:'保存 API 配置',aiClearConfig:'删除 API 配置和密钥',aiConfirmClear:'再次确认删除配置和密钥（不影响原作品）',aiDismissClear:'取消删除',aiCheckConfig:'检查配置格式（不联网）',aiCheckHelp:'仅校验已保存配置格式，不测试连接、登录或额度，不发送图像。',aiCustomPrivacy:'将向下方显示的基础地址发送当前图像，并消耗该供应商额度；真实价格未知。不使用 Codex 或聊天会话；工作台仅将候选暂存在内存，工程不保存原图。供应商如何留存图片以其政策为准。',aiCustomConsent:'我同意向显示的基础地址发送图像并消耗该供应商额度，了解图像可能变化。',aiEndpoint:'实际图像接口',aiSaved:'配置已保存，请重新确认同意。',aiAddressChanged:'基础地址已改变，必须重新输入密钥。',aiRefreshStatus:'刷新可用性与对话列表',aiNeedSource:'请先在下方「选择图片」上传原图。仅恢复已保存图纸不会提供 AI 所需的参考图片。',aiConfiguredModel:'沿用 Codex 插件图像设置',aiTitle:'AI 原稿助手 · Beta',aiWarning:'AI 可能改变长相、花纹和细节，输出不是忠实抠图。',aiPrivacy:'参考图和生成结果都会保存在所选 DSH 对话及附件存储中；参考图作为用户请求附图交给 Codex 图像服务，消耗订阅额度；真实价格未知。作品库仍只存图纸；确认采用前不会替换当前上传源。',aiConsent:'我同意将参考图和生成结果保存在所选对话及附件存储中，并将参考图交给 Codex 图像服务；了解订阅额度消耗和图像变化风险。',aiSession:'用于执行的 DSH 对话',aiChooseSession:'请明确选择一个对话',aiSessionNote:'可用仅代表工具入口存在；会话模型权限、登录和额度以实际执行结果为准。请求可能被拒绝，不自动重试或切换模型、对话。',aiUnavailable:'AI 引擎尚未接入或当前不可用',aiEngine:'引擎 / 模型',aiQuota:'额度',aiUnknown:'未知',aiStyle:'风格',aiFaithful:'尽量保留原貌',aiCute:'可爱简化',aiOutline:'轮廓清晰',aiBackground:'背景',aiKeep:'尽量保留',aiWhite:'白色',aiNotes:'额外要求（最多 500 字）',aiGenerate:'生成一次 AI 候选',aiCancel:'取消等待',aiCancelled:'已取消等待；远端请求可能已计费。不会自动重试。',aiWorking:'正在等待 AI 候选…',aiOriginal:'原图',aiCandidate:'AI 候选',aiAdopt:'确认采用候选作为上传源',aiAdoptHint:'采用只替换上传源；不会保存作品或生成图纸。采用后请点击“生成”创建新作品。',aiAdopted:'候选已采用，请继续生成图纸。',aiLoading:'正在检查 AI 可用性…',aiFailed:'AI 请求失败（未自动重试）'},
  en:{aiReadModels:'Connect and read models (online, no image generation)',aiModelsHelp:'Only clicking sends authentication to the entered base URL for GET /models. No image is uploaded and editing capability is not verified.',aiModelsFilter:'Show all models',aiModelsSelect:'Select model ID (draft only)',aiModelsPlaceholder:'Choose explicitly; nothing is saved automatically',aiModelsUnverified:'Image candidates are filtered by name only; editing is unverified. Show all models or keep entering an ID manually.',aiModelsEmpty:'No matching models. Show all or enter an ID manually.',aiModelsTruncated:'The model list was truncated; exact IDs can still be entered manually.',aiModelsLoading:'Reading model list…',aiModelsKey:'On success, a newly entered key stays only in frontend memory for saving configuration. It is not displayed or written to projects or chats, and is cleared on failure.',aiProvider:'Image engine',aiCodex:'Codex subscription',aiCustom:'Custom API',aiBaseUrl:'HTTPS base URL (include /v1 if required)',aiCustomModel:'Image model',aiApiKey:'API key (blank preserves an existing key only at the same URL)',aiKeyPresent:'Key stored (never displayed)',aiKeyMissing:'No key stored',aiCustomHelp:'HTTPS public OpenAI-compatible images/edits only; /images/edits is appended to the base URL. Not all providers are compatible.',aiKeyStorage:'Keys are stored by DSH host credentials. The default local backend uses plaintext files protected by file permissions, not an encrypted vault. Use a dedicated key with a spending limit.',aiSaveConfig:'Save API configuration',aiClearConfig:'Delete API configuration and key',aiConfirmClear:'Confirm deletion of configuration and key (artworks are unaffected)',aiDismissClear:'Keep configuration',aiCheckConfig:'Check configuration format (offline)',aiCheckHelp:'Validates saved configuration only. Does not test connectivity, login or quota, or send an image.',aiCustomPrivacy:'The current image will be sent to the base URL shown below and use that provider’s quota; the actual price is unknown. No Codex or chat session is used. This workbench keeps candidates temporarily in memory; projects do not store source images. Provider-side image retention follows its own policies.',aiCustomConsent:'I consent to sending this image to the displayed base URL and using that provider’s quota, and understand possible image changes.',aiEndpoint:'Image endpoint',aiSaved:'Configuration saved. Please confirm consent again.',aiAddressChanged:'Changing the base URL requires entering a new API key.',aiRefreshStatus:'Refresh availability and conversations',aiNeedSource:'Upload a reference under Select Image below. Restoring a saved pattern does not provide a source photo for AI.',aiConfiguredModel:'Uses Codex plugin image settings',aiTitle:'AI Source Assistant · Beta',aiWarning:'AI may change appearance, markings and details. This is not a faithful background cutout.',aiPrivacy:'Both the reference image and generated results will be stored in the selected DSH conversation and attachment storage. The reference is sent as a user-request attachment to the Codex image service using subscription quota. The actual price is unknown. The artwork library still stores patterns only; the upload source is not replaced until you confirm adoption.',aiConsent:'I consent to storing this reference and generated results in the selected conversation and attachment storage and sending the reference to the Codex image service, with subscription quota usage and possible image changes.',aiSession:'DSH conversation for execution',aiChooseSession:'Explicitly choose a conversation',aiSessionNote:'Availability only means the tool entry exists. Session model permissions, login and quota are checked during execution. Requests may be refused; no automatic retries or model/conversation switching.',aiUnavailable:'The AI engine is not connected or is unavailable',aiEngine:'Engine / model',aiQuota:'Quota',aiUnknown:'Unknown',aiStyle:'Style',aiFaithful:'Preserve appearance',aiCute:'Cute and simplified',aiOutline:'Clear outlines',aiBackground:'Background',aiKeep:'Try to preserve',aiWhite:'White',aiNotes:'Additional instructions (500 characters maximum)',aiGenerate:'Generate one AI candidate',aiCancel:'Cancel waiting',aiCancelled:'Waiting cancelled; the remote request may already be charged. No automatic retry.',aiWorking:'Waiting for an AI candidate…',aiOriginal:'Original',aiCandidate:'AI candidate',aiAdopt:'Confirm candidate as upload source',aiAdoptHint:'Adopting only replaces the upload source; it does not save an artwork or generate a pattern. Click Generate afterward to create a new artwork.',aiAdopted:'Candidate adopted. You can now generate a pattern.',aiLoading:'Checking AI availability…',aiFailed:'AI request failed (not retried automatically)'}
};

function createAiPanel(React,{Source,t}) {
  const h=React.createElement;
  return function AiPanel({source,sourceId,params={},disabled=false,onAdopt,onBusyChange}){
    const [state,setState]=React.useState({status:null,phase:'idle',candidate:null,busy:false,pendingStart:false,error:''});
    const [sessionId,setSessionId]=React.useState('');
    const [style,setStyle]=React.useState('faithful'),[background,setBackground]=React.useState('keep'),[notes,setNotes]=React.useState(''),[consent,setConsent]=React.useState(false);
    const [provider,setProvider]=React.useState('codex'),[config,setConfig]=React.useState(beadAiPublicConfig()),[baseUrl,setBaseUrl]=React.useState(''),[model,setModel]=React.useState(''),[apiKey,setApiKey]=React.useState(''),[configBusy,setConfigBusy]=React.useState(false),[configMessage,setConfigMessage]=React.useState(''),[confirmClear,setConfirmClear]=React.useState(false);
    const [modelList,setModelList]=React.useState({models:null,busy:false,error:'',truncated:false}),[allModels,setAllModels]=React.useState(false);
    const controller=React.useRef(null),latest=React.useRef(null),configTicket=React.useRef(0),modelTicket=React.useRef(0);latest.current={onAdopt,onBusyChange};
    React.useEffect(()=>{const c=createBeadAiController({onChange:setState,onBusyChange:value=>latest.current.onBusyChange?.(value)});controller.current=c;c.status();return()=>{configTicket.current++;modelTicket.current++;c.dispose();if(controller.current===c)controller.current=null;};},[]);
    React.useLayoutEffect(()=>{controller.current?.reset();setConsent(false);clearModels();},[sourceId]);
    React.useLayoutEffect(()=>{controller.current?.reset();setConsent(false);clearModels();},[state.status?.endpoint,state.status?.revision]);
    const locked=disabled||state.busy||configBusy,sessionValid=provider==='custom'||!!sessionId&&!!state.status?.sessions?.some(s=>s.id===sessionId);
    function invalidate(){controller.current?.reset();setConsent(false);}
    function clearModels(){modelTicket.current++;setModelList({models:null,busy:false,error:'',truncated:false});setAllModels(false);}
    async function readModels(){
      if(locked||modelList.busy||provider!=='custom'||!baseUrl)return;
      const ticket=++modelTicket.current;invalidate();setModelList({models:null,busy:true,error:'',truncated:false});setAllModels(false);
      try{const result=await readBeadAiModels({baseUrl,apiKey,config});if(ticket===modelTicket.current)setModelList({...result,busy:false,error:''});}
      catch(e){if(ticket===modelTicket.current){setApiKey('');setModelList({models:null,busy:false,error:String(e.message||e),truncated:false});}}
    }
    function installConfig(value){const safe=beadAiPublicConfig(value);setConfig(safe);setBaseUrl(safe.baseUrl);setModel(safe.model);}
    async function configAction(action){
      if(configBusy||disabled)return;
      if(action==='custom_clear'&&!confirmClear){setConfirmClear(true);return;}
      const ticket=++configTicket.current;clearModels();setConfigBusy(true);setConfigMessage('');invalidate();
      const key=apiKey;setApiKey('');
      try{
        let result;
        if(action==='custom_save')result=await saveBeadAiConfig({baseUrl,model,apiKey:key,config});
        else result=await beadAiPost({action,...(action==='custom_clear'?{expectedRevision:config.revision}:{})});
        if(ticket!==configTicket.current)return;
        if(action==='custom_check')setConfigMessage(result.message||String(result.valid));
        else{installConfig(result);setConfirmClear(false);if(action==='custom_save')setConfigMessage(t('aiSaved'));await controller.current?.status('custom');}
      }catch(e){if(ticket===configTicket.current)setConfigMessage(String(e.message||e));}
      finally{if(ticket===configTicket.current){setApiKey('');setConfigBusy(false);}}
    }
    function changeProvider(value){
      clearModels();configTicket.current++;setConfigBusy(false);setConfigMessage('');setConfirmClear(false);setApiKey('');invalidate();setProvider(value);controller.current?.status(value);
      if(value==='custom'){
        const ticket=++configTicket.current;setConfigBusy(true);
        beadAiPost({action:'custom_config'}).then(result=>{if(ticket===configTicket.current)installConfig(result);}).catch(e=>{if(ticket===configTicket.current)setConfigMessage(String(e.message||e));}).finally(()=>{if(ticket===configTicket.current)setConfigBusy(false);});
      }
    }
    const field=(label,child)=>h('label',{className:'bs-field'},h('span',null,label),child);
    const select=(value,set,options)=>h('select',{value,disabled:locked,onChange:e=>set(e.target.value)},...options.map(([id,key])=>h('option',{key:id,value:id},t(key))));
    const visibleModels=(modelList.models||[]).filter(item=>allModels||item.imageCandidate);
    const configReady=provider!=='custom'||!modelList.busy&&apiKey===''&&baseUrl===config.baseUrl&&model===config.model&&state.status?.revision===config.revision;
    function start(){if(locked||!consent||!source||!sessionValid||!configReady)return;controller.current?.start({source,consent,sessionId,provider,style,background,notes,width:params.width,maxColors:params.maxColors});}
    return h('section',{className:'bs-card bs-ai-panel'},
      h('h2',null,t('aiTitle')),
      !source&&h('p',{className:'bs-alert',role:'status'},t('aiNeedSource')),
      h('p',{className:'bs-note'},t('aiWarning')),
      field(t('aiProvider'),h('select',{value:provider,disabled:disabled||configBusy,onChange:e=>changeProvider(e.target.value)},h('option',{value:'codex'},t('aiCodex')),h('option',{value:'custom'},t('aiCustom')))),
      h('p',{className:'bs-note'},t(provider==='custom'?'aiCustomPrivacy':'aiPrivacy')),
      provider==='custom'&&h('div',{className:'bs-ai-config'},
        h('p',{className:'bs-note'},t('aiCustomHelp')),h('p',{className:'bs-note'},t('aiKeyStorage')),
        field(t('aiBaseUrl'),h('input',{type:'url',value:baseUrl,disabled:locked,autoComplete:'off',onChange:e=>{clearModels();invalidate();setBaseUrl(e.target.value);setApiKey('');}})),
        field(t('aiCustomModel'),h('input',{value:model,disabled:locked,autoComplete:'off',onChange:e=>{invalidate();setModel(e.target.value);}})),
        field(t('aiApiKey'),h('input',{type:'password',value:apiKey,disabled:locked,autoComplete:'new-password',onChange:e=>{clearModels();invalidate();setApiKey(e.target.value);}})),
        h('p',{className:'bs-muted'},t(config.hasKey?'aiKeyPresent':'aiKeyMissing')),
        h('button',{type:'button',disabled:locked||modelList.busy||!baseUrl||baseUrl!==config.baseUrl&&!apiKey.trim(),onClick:readModels},t('aiReadModels')),
        h('p',{className:'bs-note'},t('aiModelsHelp')),h('p',{className:'bs-note'},t('aiModelsKey')),
        modelList.busy&&h('p',{className:'bs-note',role:'status'},t('aiModelsLoading')),
        modelList.error&&h('p',{className:'bs-alert',role:'status'},modelList.error),
        modelList.models&&h('div',null,
          h('label',{className:'bs-check'},h('input',{type:'checkbox',checked:allModels,onChange:e=>setAllModels(e.target.checked)}),t('aiModelsFilter')),
          field(t('aiModelsSelect'),h('select',{'data-ai-model-list':true,value:visibleModels.some(item=>item.id===model)?model:'',disabled:locked,onChange:e=>{if(visibleModels.some(item=>item.id===e.target.value)){invalidate();setModel(e.target.value);}}},h('option',{value:''},t('aiModelsPlaceholder')),...visibleModels.map(item=>h('option',{key:item.id,value:item.id},item.id)))),
          h('p',{className:'bs-note'},t('aiModelsUnverified')),!visibleModels.length&&h('p',{className:'bs-note'},t('aiModelsEmpty')),
          modelList.truncated&&h('p',{className:'bs-note'},t('aiModelsTruncated'))),
        baseUrl!==config.baseUrl&&h('p',{className:'bs-note'},t('aiAddressChanged')),
        h('p',{className:'bs-note'},t('aiEndpoint')+': '+(state.status?.endpoint||config.endpoint||t('aiUnknown'))),
        h('div',{className:'bs-exports'},h('button',{type:'button',disabled:locked||!baseUrl||!model||baseUrl!==config.baseUrl&&!apiKey.trim(),onClick:()=>configAction('custom_save')},t('aiSaveConfig')),
          h('button',{type:'button',disabled:locked,onClick:()=>configAction('custom_check')},t('aiCheckConfig')),
          h('button',{type:'button',disabled:locked,onClick:()=>configAction('custom_clear')},t(confirmClear?'aiConfirmClear':'aiClearConfig')),
          confirmClear&&h('button',{type:'button',disabled:locked,onClick:()=>setConfirmClear(false)},t('aiDismissClear'))),
        h('p',{className:'bs-note'},t('aiCheckHelp')),configMessage&&h('p',{className:'bs-note',role:'status'},configMessage)), 
      h('div',{className:'bs-muted'},t('aiEngine')+': '+(state.status?.engine||t('aiUnknown'))+' / '+(state.status?.model==='configured'?t('aiConfiguredModel'):state.status?.model||t('aiUnknown'))),
      h('div',{className:'bs-muted'},t('aiQuota')+': '+(typeof state.status?.quota==='string'&&state.status.quota!=='unknown'?state.status.quota:t('aiUnknown'))),
      !state.status?h('p',{role:'status',className:'bs-note'},t('aiLoading')):!state.status.available?h('p',{role:'status',className:'bs-alert'},state.status.reason||t('aiUnavailable')):null,
      provider==='codex'&&field(t('aiSession'),h('select',{value:sessionId,disabled,onChange:e=>{controller.current?.reset();setSessionId(e.target.value);setConsent(false);}},h('option',{value:''},t('aiChooseSession')),...(state.status?.sessions||[]).map(s=>h('option',{key:s.id,value:s.id},s.label||s.id)))),
      h('button',{type:'button',disabled:locked,onClick:()=>provider==='custom'?configAction('custom_config'):controller.current?.status()},t('aiRefreshStatus')),
      provider==='codex'&&h('p',{className:'bs-note'},t('aiSessionNote')),
      h('div',{className:'bs-pair'},field(t('aiStyle'),select(style,setStyle,[['faithful','aiFaithful'],['cute','aiCute'],['outline','aiOutline']])),field(t('aiBackground'),select(background,setBackground,[['keep','aiKeep'],['white','aiWhite']]))),
      field(t('aiNotes'),h('textarea',{value:notes,maxLength:500,rows:3,disabled:locked,onChange:e=>setNotes(e.target.value.slice(0,500)),style:{width:'100%',resize:'vertical',font:'inherit',color:'inherit',background:'var(--dsw-alias-bg-base)',border:'1px solid var(--dsw-alias-border-l2)',borderRadius:7,padding:8}})),
      h('label',{className:'bs-check'},h('input',{type:'checkbox',checked:consent,disabled:locked,onChange:e=>setConsent(e.target.checked)}),t(provider==='custom'?'aiCustomConsent':'aiConsent')),
      h('div',{className:'bs-exports'},h('button',{type:'button',disabled:locked||!source||!consent||!sessionValid||!configReady||!state.status?.available,onClick:start},t('aiGenerate')),
        state.busy&&h('button',{type:'button',onClick:()=>controller.current?.cancel()},t('aiCancel'))),
      h('div',{className:'bs-note',role:'status'},state.phase==='cancelled'?t('aiCancelled'):state.busy?t('aiWorking'):state.phase==='adopted'?t('aiAdopted'):state.phase==='failed'?t('aiFailed'):''),
      state.error&&h('p',{className:'bs-alert bs-error',role:'alert'},state.error),
      state.candidate&&h('div',{className:'bs-ai-comparison'},h('div',{className:'bs-pair'},h('div',null,h('p',{className:'bs-muted'},t('aiOriginal')),source&&h(Source,{image:source})),h('div',null,h('p',{className:'bs-muted'},t('aiCandidate')),h(Source,{image:state.candidate}))),
        h('p',{className:'bs-note'},t('aiAdoptHint')),h('button',{type:'button',disabled:locked||!consent,onClick:()=>{if(!disabled&&consent)controller.current?.adopt(image=>latest.current.onAdopt?.(image));}},t('aiAdopt'))));
  };
}

function createWorkbench(React,{core,projects,Viewport,Source,AiPanel,Icon,css,t,ctx}) {
  const h=React.createElement,{useState,useRef,useEffect,useMemo,useSyncExternalStore}=React;
  let recoveryDraft=null,closing=Promise.resolve();
  const api=async body=>{const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),15000);try{const response=await fetch('/api/local-bead-studio/library',{method:'POST',headers:{'Content-Type':'application/json','X-DSH-Bead-Studio':'1'},body:JSON.stringify(body),signal:ac.signal});const row=await response.json();if(!response.ok){const e=new Error(row.error||'Project request failed.');e.code=row.code;throw e;}return row;}finally{clearTimeout(timer);}};
  function Thumbnail({thumbnail}){const ref=useRef(null);useEffect(()=>{if(!ref.current||!thumbnail)return;const c=ref.current;c.width=thumbnail.width;c.height=thumbnail.height;const g=c.getContext('2d');g.fillStyle='#eeeeee';g.fillRect(0,0,c.width,c.height);thumbnail.pixels.forEach((color,i)=>{if(color){g.fillStyle=color;g.fillRect(i%c.width,Math.floor(i/c.width),1,1);}});},[thumbnail]);return h('canvas',{ref,className:'bs-thumb','aria-label':t('thumbnail')});}
  return function Workbench(){
    useSyncExternalStore(fn=>ctx.locale.subscribe(fn),()=>ctx.locale.getSnapshot());
    const [mode,setMode]=useState('view'),[tool,setTool]=useState('brush'),[brush,setBrush]=useState(''),[hover,setHover]=useState(null),[fromId,setFromId]=useState(''),[toId,setToId]=useState(''),[mergePreview,setMergePreview]=useState(false),[pendingAction,setPendingAction]=useState(null);
    const [activeId,setActiveId]=useState(null),[libraryOpen,setLibraryOpen]=useState(false),[items,setItems]=useState([]),[libraryTotal,setLibraryTotal]=useState(0),[search,setSearch]=useState(''),[trash,setTrash]=useState(false),[offset,setOffset]=useState(0),[libraryConfirm,setLibraryConfirm]=useState(null),[focusCanvas,setFocusCanvas]=useState(false),[showParams,setShowParams]=useState(true),[showPalette,setShowPalette]=useState(true);
    const listEpoch=useRef(0);
    const history=useRef(editor.createHistory(50)),editPending=useRef(false);
    const [keepImageSize,setKeepImageSize]=useState(false),[sourceName,setSourceName]=useState('');
    const [source,setSource]=useState(null),[sourceId,setSourceId]=useState(0),[name,setName]=useState('');
    const [params,setParams]=useState({width:48,maxColors:16,boardSize:29,background:'transparent',crop:'original'});
    const [pattern,setPattern]=useState(null),[resultKey,setResultKey]=useState('');
    const [boardId,setBoardId]=useState(''),[labels,setLabels]=useState(true),[grid,setGrid]=useState(true),[fit,setFit]=useState(false),[zoom,setZoom]=useState(100),[highlight,setHighlight]=useState(''),[resetKey,setResetKey]=useState(0);
    const [busy,setBusy]=useState(false),[ready,setReady]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
    const [saveState,setSaveState]=useState({state:'loading'}),[exporting,setExporting]=useState(false),[prepared,setPrepared]=useState(null),[downloadState,setDownloadState]=useState(''),[reloadConfirm,setReloadConfirm]=useState(false),[recovery,setRecovery]=useState(null);
    const alive=useRef(true),queue=useRef(null),fileRef=useRef(null),jsonRef=useRef(null),controller=useRef(null),loadTicket=useRef(0),exportTicket=useRef(0),preparedRef=useRef(null),restoreTicket=useRef(0),currentProject=useRef(null),shownId=useRef(null);
    const key=JSON.stringify([sourceId,params]),dirty=!!pattern&&!!source&&resultKey!==key;
    const locked=busy||exporting||!ready;
    const view=useMemo(()=>({boardId,labels,grid,fit,zoom,highlight}),[boardId,labels,grid,fit,zoom,highlight]);
    const project=useMemo(()=>pattern?{format:'dsh-bead-project',version:1,name:name||t('untitled'),pattern,view,updatedAt:null}:null,[pattern,name,view]);
    currentProject.current=project;shownId.current=activeId;
    function adopt(p){
      history.current.clear();setMode('view');setHover(null);setMergePreview(false);setBrush(p.pattern.palette[0]?.id||'');
      controller.current?.abort();loadTicket.current++;exportTicket.current++;
      setSource(null);setSourceId(x=>x+1);setName(p.name);setPattern(p.pattern);
      setParams({width:p.pattern.width,maxColors:p.pattern.maxColors,boardSize:p.pattern.boardSize,background:p.pattern.background,crop:'original'});
      setBoardId(p.view.boardId);setLabels(p.view.labels);setGrid(p.view.grid);setFit(p.view.fit);setZoom(p.view.zoom);setHighlight(p.view.highlight);setResetKey(x=>x+1);setResultKey('');setBusy(false);
    }
    async function openSaved(discard=false){
      const manager=queue.current,ticket=++restoreTicket.current;
      setReady(false);setError('');
      try{await closing;const row=await manager.open(undefined,{discard});if(!alive.current||queue.current!==manager||ticket!==restoreTicket.current)return;setActiveId(row.id);if(row.project){adopt(row.project);setNotice(t('restored'));}else{setPattern(null);setName('');}setRecovery(recoveryDraft);setReady(true);}
      catch(e){if(alive.current&&queue.current===manager&&ticket===restoreTicket.current){setError(e.message);setSaveState({state:'error',message:e.message});if(currentProject.current)setReady(true);}}
    }
    useEffect(()=>{
      alive.current=true;
      const manager=createLibrarySession({request:api,onState:s=>{if(alive.current)setSaveState(s);}});
      queue.current=manager;openSaved();
      const warn=e=>{if(manager.dirty){e.preventDefault();e.returnValue='';}};
      window.addEventListener('beforeunload',warn);
      return()=>{alive.current=false;restoreTicket.current++;loadTicket.current++;exportTicket.current++;controller.current?.abort();window.removeEventListener('beforeunload',warn);
        const candidate=currentProject.current,owned=manager.id===shownId.current;if(candidate){if(owned)manager.schedule(candidate);recoveryDraft={project:candidate,message:t('recoveryHint')};}
        closing=manager.close().then(()=>{if(owned&&!manager.dirty&&recoveryDraft?.project===candidate)recoveryDraft=null;}).catch(e=>{if(candidate)recoveryDraft={project:candidate,message:e.message};});
        if(preparedRef.current)URL.revokeObjectURL(preparedRef.current.url);};
    },[]);
    useEffect(()=>{if(ready&&project&&!busy&&activeId===queue.current.id)queue.current.schedule(project);},[ready,project,busy,activeId]);
    useEffect(()=>{exportTicket.current++;if(preparedRef.current){URL.revokeObjectURL(preparedRef.current.url);preparedRef.current=null;}setPrepared(null);setDownloadState('');},[pattern,name,view]);
    const height=source?Math.max(1,Math.min(128,Math.round(Number(params.width)*(params.crop==='square'?1:source.height/source.width)))):pattern?.height||48;
    const setParam=(k,v)=>setParams(p=>({...p,[k]:v}));
    async function loadFile(file){
      if(!file||locked)return;const ticket=++loadTicket.current;setBusy(true);setError('');
      try{
        if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>12*1024*1024)throw new Error(t('fileError'));
        const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});let image;
        try{if(bitmap.width*bitmap.height>20000000)throw new Error(t('pixelError'));const c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;c.getContext('2d').drawImage(bitmap,0,0);image=c.getContext('2d').getImageData(0,0,c.width,c.height);}finally{bitmap.close();}
        if(!alive.current||ticket!==loadTicket.current)return;
        setSource(image);setSourceName(file.name.slice(0,120));setParams(p=>imageSizing(image,p,keepImageSize));setSourceId(x=>x+1);if(!pattern)setName(file.name.slice(0,120));setNotice(t('previousRetained'));
      }catch(e){if(alive.current&&ticket===loadTicket.current)setError(e.message);}finally{if(alive.current&&ticket===loadTicket.current)setBusy(false);}
    }
    async function importFile(file){
      if(!file||locked)return;const ticket=++loadTicket.current;setBusy(true);setError('');
      try{if(file.size>1024*1024)throw new Error(t('projectTooLarge'));const p=projects.parseProject(await file.text());if(!alive.current||ticket!==loadTicket.current)return;if(await libraryAction('import',p))setNotice(t('imported'));}
      catch(e){if(alive.current&&ticket===loadTicket.current)setError(e.message);}finally{if(alive.current)setBusy(false);}
    }
    async function run(image=source,p=params,snapshot=key,approved=false,afterGenerate=null){
      if(pattern&&!approved)return guardReplace(()=>run(image,p,snapshot,true));
      if(!image||!Number.isInteger(p.width)||p.width<8||p.width>128)return;
      setBusy(true);setError('');controller.current?.abort();const ac=new AbortController(),manager=queue.current,generationTicket=++loadTicket.current;controller.current=ac;
      try{
        let input=image;
        if(p.crop==='square'){const side=Math.min(image.width,image.height),ox=Math.floor((image.width-side)/2),oy=Math.floor((image.height-side)/2),data=new Uint8ClampedArray(side*side*4);for(let y=0;y<side;y++)data.set(image.data.subarray(((oy+y)*image.width+ox)*4,((oy+y)*image.width+ox+side)*4),y*side*4);input={width:side,height:side,data};}
        const targetH=Math.max(1,Math.min(128,Math.round(p.width*input.height/input.width))),sampled=core.sampleImage(input,p.width,targetH);
        const response=await fetch('/api/local-bead-studio/generate',{method:'POST',headers:{'Content-Type':'application/json','X-DSH-Bead-Studio':'1'},body:JSON.stringify({width:p.width,height:targetH,rgba:Array.from(sampled.data),maxColors:p.maxColors,boardSize:p.boardSize,background:p.background}),signal:ac.signal});
        const data=await response.json();if(!response.ok)throw new Error(data.error||t('generateError'));
        const canonical=projects.normalizeProject(data.pattern).pattern;
        if(!alive.current||ac.signal.aborted||queue.current!==manager||generationTicket!==loadTicket.current)return;
        const created=await manager.create({format:'dsh-bead-project',version:1,name:name||t('untitled'),pattern:canonical,view:{boardId:'',labels,grid,fit,zoom,highlight:''},updatedAt:null});
        if(!alive.current||ac.signal.aborted||queue.current!==manager||generationTicket!==loadTicket.current)return;setActiveId(created.id);
        if(alive.current&&!ac.signal.aborted){history.current.clear();setMode('view');setMergePreview(false);setHover(null);setBrush(canonical.palette[0]?.id||'');setPattern(canonical);setResultKey(snapshot);setBoardId('');setHighlight('');setResetKey(x=>x+1);setNotice(t('generated'));afterGenerate?.();}
      }catch(e){if(alive.current&&!ac.signal.aborted)setError(e.message);}finally{if(alive.current&&controller.current===ac)setBusy(false);}
    }
    function demo(approved=false){if(pattern&&approved!==true)return guardReplace(()=>demo(true));const image=core.demoImage(),id=sourceId+1,p={...params,width:image.width,maxColors:12,background:'transparent',crop:'original'};run(image,p,JSON.stringify([id,p]),true,()=>{setSource(image);setSourceName(t('demoName'));setSourceId(id);setName(t('demoName'));setParams(p);});}
    async function prepare(kind){
      if(!pattern||locked)return;const ticket=++exportTicket.current;setExporting(true);setError('');setDownloadState('preparing');
      try{const result=await prepareExport(core,kind,{pattern,view,name,project:projects.normalizeProject(project)});if(!alive.current||ticket!==exportTicket.current)return;
        if(preparedRef.current)URL.revokeObjectURL(preparedRef.current.url);
        const file={...result,url:URL.createObjectURL(result.blob)};preparedRef.current=file;setPrepared(file);setDownloadState('ready');
      }catch(e){if(alive.current){setDownloadState('error');setError(e.message);}}finally{if(alive.current)setExporting(false);}
    }
    async function saveAs(){
      if(!prepared||typeof window.showSaveFilePicker!=='function')return;
      try{const handle=await window.showSaveFilePicker({suggestedName:prepared.filename});setDownloadState('saving');const stream=await handle.createWritable();try{await stream.write(prepared.blob);await stream.close();}catch(e){try{await stream.abort();}catch{}throw e;}if(alive.current)setDownloadState('saved');}
      catch(e){if(alive.current){setDownloadState(e.name==='AbortError'?'cancelled':'error');if(e.name!=='AbortError')setError(e.message);}}
    }
    async function refreshLibrary(){const ticket=++listEpoch.current;try{const result=await api({action:'list',query:search,trash,offset,limit:12});if(alive.current&&ticket===listEpoch.current){setItems(result.items);setLibraryTotal(result.total);}}catch(e){if(alive.current&&ticket===listEpoch.current)setError(e.message);}}
    useEffect(()=>{if(!ready)return;const timer=setTimeout(refreshLibrary,200);return()=>clearTimeout(timer);},[ready,search,trash,offset,saveState.state,activeId]);
    async function libraryAction(action,item){
      const manager=queue.current;
      if(editPending.current||exporting||!ready)return;setBusy(true);setError('');
      try{
        if(currentProject.current&&shownId.current===manager.id)manager.schedule(currentProject.current);
        let row;
        if(action==='open')row=await manager.open(item.id);
        else if(action==='new')row=await manager.create(undefined,t('untitled'));
        else if(action==='copy')row=await manager.duplicate();
        else if(action==='import'||action==='recover')row=await manager.create(item);
        else {await manager.mutate(action,item,action==='purge'?{confirm:'DELETE'}:{});if(!manager.id){setActiveId(null);setPattern(null);setSource(null);setName('');history.current.clear();}}
        if(!alive.current)return;
        if(row){adopt(row.project);setActiveId(row.id);setLibraryOpen(false);setPendingAction(null);}
        if(action==='recover'){setRecovery(null);recoveryDraft=null;}
        setLibraryConfirm(null);await refreshLibrary();return true;
      }catch(e){if(alive.current)setError(e.message);}finally{if(alive.current)setBusy(false);}
    }
    function adoptAiImage(image){if(locked||editPending.current)return;controller.current?.abort();loadTicket.current++;setSource(image);setSourceName(t('aiSourceName'));setSourceId(v=>v+1);setParams(p=>({...p,crop:'original'}));setNotice(t('aiSourceReady'));}
    function guardReplace(fn){if(pattern)setPendingAction(()=>fn);else fn();}
    function applyLocal(next){setPattern(next);if(!next.palette.some(c=>c.id===highlight))setHighlight('');if(!next.palette.some(c=>c.id===brush))setBrush(next.palette[0]?.id||'');setHover(null);}
    function undo(){if(!pattern||locked||editPending.current||pendingAction)return;setMergePreview(false);applyLocal(history.current.undo(pattern));}
    function redo(){if(!pattern||locked||editPending.current||pendingAction)return;setMergePreview(false);applyLocal(history.current.redo(pattern));}
    async function editAction(operation){
      if(!pattern||locked||editPending.current||pendingAction)return;
      editPending.current=true;setBusy(true);setError('');const before=pattern,ac=new AbortController();controller.current=ac;const timer=setTimeout(()=>ac.abort(),15000);
      try{const response=await fetch('/api/local-bead-studio/edit',{method:'POST',headers:{'Content-Type':'application/json','X-DSH-Bead-Studio':'1'},body:JSON.stringify({...operation,project}),signal:ac.signal});const result=await response.json();if(!response.ok)throw Error(result.error||t('editFailed'));if(alive.current&&!ac.signal.aborted&&result.changed){const next=projects.normalizeProject(result.project).pattern;history.current.commit(before,next);applyLocal(next);}if(alive.current)setMergePreview(false);}
      catch(e){if(alive.current)setError(e.message);}finally{clearTimeout(timer);editPending.current=false;if(alive.current&&controller.current===ac)setBusy(false);}
    }
    function stroke(indices){if(tool==='brush'&&!brush)return;editAction({action:'paint',indices,colorId:tool==='eraser'?null:brush});}
    function pick(index){const color=pattern?.palette[pattern.cells[index]];if(color){setBrush(color.id);setTool('brush');}else setNotice(t('pickedEmpty'));}
    const merged=useMemo(()=>{if(!mergePreview||!pattern||!fromId||!toId||fromId===toId)return null;try{return editor.mergeColors(pattern,fromId,toId);}catch{return null;}},[mergePreview,pattern,fromId,toId]);
    const cell=hover===null||!pattern?null:editor.getCellInfo(pattern,hover);
    useEffect(()=>{if(pattern&&!pattern.palette.some(c=>c.id===brush))setBrush(pattern.palette[0]?.id||'');},[pattern,brush]);
    const canExport=!!pattern&&!locked;
    const field=(label,control)=>h('label',{className:'bs-field'},h('span',null,label),control);
    const button=(label,fn,props={})=>h('button',{type:'button',onClick:fn,...props},label);
    const counts=useMemo(()=>{if(!pattern)return{};const b=pattern.boards.find(b=>b.id===boardId)||{x:0,y:0,width:pattern.width,height:pattern.height};const out={};for(let y=b.y;y<b.y+b.height;y++)for(let x=b.x;x<b.x+b.width;x++){const c=pattern.palette[pattern.cells[y*pattern.width+x]];if(c)out[c.id]=(out[c.id]||0)+1;}return out;},[pattern,boardId]);
    const selected=pattern?.palette.find(c=>c.id===highlight);
    return h('main',{className:'bs-root'+(focusCanvas?' bs-focus':''),'data-testid':'bead-studio'},h('style',null,css),
      h('header',{className:'bs-head'},h('div',null,h('h1',null,t('title')),h('div',{className:'bs-muted'},t('subtitle'))),h('span',{className:'bs-tag'},'0.5.2 Beta · '+t('badge'))),
      error&&h('div',{className:'bs-alert bs-error',role:'alert'},error),
      h('div',{className:'bs-toolbar'},button(t('library'),()=>setLibraryOpen(v=>!v)),button(t('newProject'),()=>libraryAction('new'),{disabled:locked}),button(t('copyProject'),()=>libraryAction('copy'),{disabled:locked||!activeId}),button(t(focusCanvas?'exitFocus':'focusCanvas'),()=>setFocusCanvas(v=>!v)),button(t(showParams?'hideParams':'showParams'),()=>setShowParams(v=>!v)),button(t(showPalette?'hidePalette':'showPalette'),()=>setShowPalette(v=>!v))),
      libraryOpen&&h('section',{className:'bs-card bs-library'},h('div',{className:'bs-toolbar'},h('h2',null,t('library')),h('input',{'aria-label':t('searchProjects'),placeholder:t('searchProjects'),value:search,onChange:e=>{setSearch(e.target.value);setOffset(0);}}),h('label',{className:'bs-check'},h('input',{type:'checkbox',checked:trash,onChange:e=>{setTrash(e.target.checked);setOffset(0);}}),t('trash')),button(t('refresh'),refreshLibrary)),
        h('div',{className:'bs-library-grid'},...items.map(item=>h('article',{className:'bs-library-item',key:item.id},h(Thumbnail,{thumbnail:item.thumbnail}),h('strong',null,item.name),h('small',null,item.width+' × '+item.height+' · '+item.colorCount+' '+t('usedColors')+' · '+item.totalBeads+' '+t('beadUnit')),h('small',null,new Date(item.updatedAt).toLocaleString()),
          h('div',{className:'bs-toolbar'},trash?button(t('restoreProject'),()=>libraryAction('restore',item),{disabled:locked}):button(t(item.id===activeId?'currentProject':'openProject'),()=>libraryAction('open',item),{disabled:locked||item.id===activeId}),button(t(trash?'purgeProject':'trashProject'),()=>setLibraryConfirm({action:trash?'purge':'trash',item}),{disabled:locked}))))),
        !items.length&&h('p',null,t('emptyLibrary')),h('div',{className:'bs-toolbar'},button(t('previousPage'),()=>setOffset(n=>Math.max(0,n-12)),{disabled:offset===0}),h('span',null,(libraryTotal?offset+1:0)+'–'+Math.min(offset+12,libraryTotal)+' / '+libraryTotal),button(t('nextPage'),()=>setOffset(n=>n+12),{disabled:offset+12>=libraryTotal}))),
      libraryConfirm&&h('div',{className:'bs-alert',role:'alert'},t(libraryConfirm.action==='purge'?'purgeWarning':'trashWarning')+' '+libraryConfirm.item.name,button(t('confirm'),()=>libraryAction(libraryConfirm.action,libraryConfirm.item),{disabled:locked}),button(t('cancel'),()=>setLibraryConfirm(null))),
      h('section',{className:'bs-card bs-project'},h('div',{className:'bs-toolbar'},h('strong',null,t('project')),h('input',{'aria-label':t('projectName'),placeholder:t('untitled'),value:name,maxLength:120,disabled:locked||!pattern,onChange:e=>setName(e.target.value)}),button(t('importProject'),()=>jsonRef.current.click(),{disabled:locked}),h('input',{ref:jsonRef,type:'file',accept:'.json,application/json',style:{display:'none'},onChange:e=>{importFile(e.target.files[0]);e.target.value='';}}),button(t('reloadSaved'),()=>setReloadConfirm(true),{disabled:busy||exporting}),h('span',{className:'bs-muted',role:'status'},t('save_'+saveState.state),saveState.updatedAt?' · '+new Date(saveState.updatedAt).toLocaleTimeString():'')),
        h('p',{className:'bs-note'},t('saveScope')),
        recovery&&h('div',{className:'bs-alert'},t('recoveryHint'),button(t('recoverDraft'),()=>libraryAction('recover',recovery.project),{disabled:locked})),
        saveState.state==='error'&&h('div',{className:'bs-alert'},saveState.message,button(t('retry'),()=>{if(!ready)openSaved();else queue.current.retry().catch(()=>{});})),
        saveState.state==='conflict'&&h('div',{className:'bs-alert'},t('conflictHint')),
        reloadConfirm&&h('div',{className:'bs-alert',role:'alert'},t('reloadConfirm'),button(t('confirmReload'),()=>{setReloadConfirm(false);openSaved(true);}),button(t('cancel'),()=>setReloadConfirm(false)))),
      AiPanel&&h('details',{className:'bs-ai-shell'},h('summary',null,t('aiTestEntry')),h(AiPanel,{source,sourceId,params,disabled:locked||!!pendingAction,onAdopt:adoptAiImage})),
      h('div',{className:'bs-layout'+(!showParams||focusCanvas?' bs-wide':'')},
        h('aside',{className:'bs-stack',hidden:!showParams||focusCanvas},
          h('section',{className:'bs-card'},h('h2',null,'01 · '+t('source')),
            h('div',{className:'bs-drop',onDragOver:e=>e.preventDefault(),onDrop:e=>{e.preventDefault();loadFile(e.dataTransfer.files[0]);}},source?h(Source,{image:source}):h(Icon,{size:38}),h('div',{className:'bs-muted'},source?sourceName:pattern?t('sourceNotStored'):t('drop')),
              button(t(source?'replace':'upload'),()=>fileRef.current.click(),{disabled:locked}),h('input',{ref:fileRef,type:'file',accept:'image/png,image/jpeg,image/webp',style:{display:'none'},onChange:e=>{loadFile(e.target.files[0]);e.target.value='';}}),h('small',{className:'bs-muted'},t('formats'))),
            h('label',{className:'bs-check'},h('input',{type:'checkbox',checked:keepImageSize,disabled:locked,onChange:e=>setKeepImageSize(e.target.checked)}),t('keepImageSize')),
            source&&h('p',{className:'bs-note','aria-live':'polite'},t('sourcePixels')+': '+source.width+' × '+source.height+' px · '+t('plannedSize')+': '+params.width+' × '+height+' '+t('gridUnit')),
            button(t('resetImageSize'),()=>setParams(p=>imageSizing(source,p,false)),{disabled:locked||!source,className:'bs-full',style:{marginTop:8}}),
            button(t('demo'),demo,{className:'bs-full',style:{marginTop:10},disabled:locked}),h('p',{className:'bs-note'},t('privacy'))),
          h('section',{className:'bs-card'},h('h2',null,'02 · '+t('settings')),
            field(t('crop'),h('select',{value:params.crop,disabled:locked||!source,onChange:e=>setParam('crop',e.target.value)},h('option',{value:'original'},t('original')),h('option',{value:'square'},t('square')))),
            h('div',{className:'bs-pair'},field(t('width'),h('input',{type:'number',min:8,max:128,value:params.width,disabled:locked||!source,onChange:e=>setParam('width',e.target.value===''?'':Number(e.target.value))})),field(t('height'),h('input',{type:'number',readOnly:true,value:height}))),
            source&&Math.round(Number(params.width)*(params.crop==='square'?1:source.height/source.width))>128&&h('p',{className:'bs-note'},t('heightCapped')),
            field(t('colors')+' · '+params.maxColors,h('input',{type:'range',min:2,max:32,value:params.maxColors,disabled:locked||!source,onChange:e=>setParam('maxColors',Number(e.target.value))})),
            field(t('board'),h('select',{value:params.boardSize,disabled:locked||!source,onChange:e=>setParam('boardSize',Number(e.target.value))},...[...new Set([29,32,50,75,100,120,params.boardSize])].sort((a,b)=>a-b).map(n=>h('option',{key:n,value:n},`${n} × ${n}`)))),
            field(t('background'),h('select',{value:params.background,disabled:locked||!source,onChange:e=>setParam('background',e.target.value)},h('option',{value:'transparent'},t('transparent')),h('option',{value:'white'},t('white')))),
            button(t(busy?'working':'generate'),()=>run(),{className:'bs-primary bs-full',disabled:locked||!source||!Number.isInteger(params.width)||params.width<8||params.width>128}),h('p',{className:'bs-note'},t('backgroundNote')))),
        h('div',{className:'bs-stack'},
          h('div',{className:'bs-stats'},...[[pattern?`${pattern.width} × ${pattern.height}`:'—','currentDimensions'],[pattern?pattern.totalBeads.toLocaleString():'—','beads'],[pattern?pattern.palette.filter(c=>c.count>0).length:'—','usedColors'],[pattern?pattern.boards.length:'—','boards']].map(([value,label])=>h('div',{className:'bs-stat',key:label},h('strong',null,value),h('span',null,t(label))))),
          h('section',{className:'bs-card'},h('h2',null,'03 · '+t('preview')),
            h('div',{className:'bs-editor'},
              h('div',{className:'bs-toolbar'},h('strong',null,t('editTitle')),
                ...['view','edit'].map(m=>button(t('mode_'+m),()=>{setMode(m);setMergePreview(false);},{key:m,'aria-pressed':mode===m,disabled:locked||!pattern})),
                button(t('undo'),undo,{disabled:locked||!history.current.canUndo||!!pendingAction}),button(t('redo'),redo,{disabled:locked||!history.current.canRedo||!!pendingAction})),
              mode==='edit'&&h('div',{className:'bs-toolbar'},...['brush','eraser','pick'].map(k=>button(t('tool_'+k),()=>setTool(k),{key:k,'aria-pressed':tool===k,disabled:locked})),
                h('select',{'aria-label':t('brushColor'),value:brush,disabled:locked||!pattern?.palette.length,onChange:e=>{setBrush(e.target.value);setTool('brush');}},...(pattern?.palette||[]).map(c=>h('option',{key:c.id,value:c.id},c.id+' '+c.hex)))),
              h('p',{className:'bs-note'},t(mode==='edit'?'editHint':'viewHint')),
              h('div',{className:'bs-note','aria-live':'polite'},cell?t('cellPosition')+': '+cell.row+', '+cell.col+' · '+cell.boardId+' · '+(cell.color?cell.color.id+' '+cell.color.hex:t('emptyCell')):t('hoverHint')),
              pattern&&h('details',null,h('summary',null,t('mergeTitle')),h('div',{className:'bs-toolbar'},
                ...[[fromId,setFromId,'mergeFrom'],[toId,setToId,'mergeTo']].map(([v,set,label])=>field(t(label),h('select',{value:v,disabled:locked,onChange:e=>{set(e.target.value);setMergePreview(false);}},h('option',{value:''},t('chooseColor')),...pattern.palette.map(c=>h('option',{key:c.id,value:c.id},c.id+' '+c.hex+' ('+c.count+')'))))),
                button(t('mergePreview'),()=>setMergePreview(true),{disabled:locked||!fromId||!toId||fromId===toId})),
                merged&&h('div',{className:'bs-alert'},t('mergeAffected')+': '+(pattern.palette.find(c=>c.id===fromId)?.count||0)+' · '+fromId+' → '+toId+' · '+t('previewOnly'),
                  button(t('confirmMerge'),()=>editAction({action:'merge',fromId,toId}),{disabled:locked}),button(t('cancel'),()=>setMergePreview(false))))),
            pendingAction&&h('div',{className:'bs-alert',role:'alert'},t('replaceWarning'),button(t('json'),()=>prepare('json'),{disabled:locked}),button(t('confirmReplace'),()=>{const fn=pendingAction;setPendingAction(null);fn();},{disabled:locked}),button(t('cancel'),()=>setPendingAction(null))),
            dirty&&h('div',{className:'bs-alert',role:'status'},t('dirty')),
            h('div',{className:'bs-toolbar'},h('select',{'aria-label':t('boardView'),value:boardId,onChange:e=>setBoardId(e.target.value),disabled:!pattern||locked},h('option',{value:''},t('overview')),...(pattern?.boards||[]).map(b=>h('option',{key:b.id,value:b.id},`${b.id} · ${b.width}×${b.height} · ${b.count} ${t('beadUnit')}`))),
              button('−',()=>{setFit(false);setZoom(z=>Math.max(50,z-25));},{disabled:!pattern||locked,'aria-label':t('zoomOut')}),
              h('select',{'aria-label':t('zoom'),value:fit?'fit':zoom,disabled:!pattern||locked,onChange:e=>{if(e.target.value==='fit')setFit(true);else{setFit(false);setZoom(Number(e.target.value));}}},h('option',{value:'fit'},t('fit')),...[...new Set([50,75,100,150,200,300,400,zoom])].sort((a,b)=>a-b).map(z=>h('option',{key:z,value:z},z+'%'))),
              button('+',()=>{setFit(false);setZoom(z=>Math.min(400,z+25));},{disabled:!pattern||locked,'aria-label':t('zoomIn')}),button('100%',()=>{setFit(false);setZoom(100);},{disabled:!pattern||locked}),button(t('resetView'),()=>setResetKey(k=>k+1),{disabled:!pattern}),
              ...[[labels,setLabels,'labels'],[grid,setGrid,'grid']].map(([value,set,label])=>h('label',{className:'bs-check',key:label},h('input',{type:'checkbox',checked:value,disabled:locked,onChange:e=>set(e.target.checked)}),t(label)))),
            h('p',{className:'bs-note'},t('viewportHint')),
            selected&&h('div',{className:'bs-alert'},`${selected.id} · ${t('currentBoardCount')}: ${counts[selected.id]||0} · ${t('totalCount')}: ${selected.count}`,button(t('showAll'),()=>setHighlight(''))),
            pattern?h(Viewport,{pattern:merged||pattern,boardId,labels,grid,fit,zoom,highlight:merged?'':highlight,t,setZoom,setFit,resetKey,mode,tool,brushColorId:brush,disabled:locked||!!merged||!!pendingAction,onStroke:stroke,onPick:pick,onHover:setHover,onUndo:undo,onRedo:redo}):h('div',{className:'bs-preview'},h('div',{className:'bs-empty'},h(Icon,{size:64}),h('strong',null,t('emptyTitle')),h('div',null,t('emptyText')),button(t('demo'),demo,{disabled:locked}))),
            h('div',{className:'bs-exports'},...['png','svg','csv','json','pdf'].map(kind=>button(kind==='csv'?t('csv'):kind==='json'?t('json'):kind==='pdf'?t('print'):kind.toUpperCase(),()=>prepare(kind),{key:kind,disabled:!canExport}))),
            h('div',{className:'bs-note',role:'status'},downloadState?t('download_'+downloadState):notice||t('exportNote')),
            prepared&&h('div',{className:'bs-download'},h('strong',null,prepared.filename),h('span',{className:'bs-muted'},`${(prepared.blob.size/1024).toFixed(1)} KB`),h('a',{href:prepared.url,download:prepared.filename,onClick:()=>setDownloadState('requested')},t('downloadLink')),typeof window.showSaveFilePicker==='function'&&button(t('saveAs'),saveAs)),
            h('p',{className:'bs-note'},t('downloadHint'))),
          h('section',{className:'bs-card',hidden:!showPalette||focusCanvas},h('div',{className:'bs-caption'},h('h2',null,t('palette')),h('span',{className:'bs-tag'},t('generic'))),h('p',{className:'bs-note'},t('highlightHint')),
            h('div',{className:'bs-palette'},...(pattern?.palette||[]).map(c=>button(h(React.Fragment,null,h('span',{className:'bs-swatch',style:{background:c.hex}}),h('span',null,h('strong',null,c.id),h('small',null,c.hex)),h('b',null,c.count.toLocaleString())),()=>setHighlight(x=>x===c.id?'':c.id),{className:'bs-color'+(highlight===c.id?' bs-selected':''),key:c.id,disabled:locked,'aria-pressed':highlight===c.id}))),!pattern&&h('p',{className:'bs-muted'},t('noPalette'))),
          h('p',{className:'bs-note'},t('memoryNote')))));
  };
}

/* Client body; build.mjs wraps this with the shared core and locale dictionaries. */
function createClient(React, core, projects, dictionaries) {
  const h=React.createElement, {useState,useEffect,useRef,useSyncExternalStore}=React;
  const NS='local-bead-studio';
  const css=`
.bs-root{height:100%;overflow:auto;box-sizing:border-box;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:14px/1.5 system-ui,sans-serif;padding:28px 32px}
.bs-root *{box-sizing:border-box}.bs-ai-shell{margin-bottom:18px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:12px}.bs-ai-shell>summary{cursor:pointer;font-weight:650}.bs-ai-panel{margin-top:12px}.bs-ai-panel .bs-check{align-items:flex-start;margin:12px 0}.bs-ai-panel .bs-source{max-height:280px;max-width:100%;object-fit:contain}.bs-ai-panel .bs-pair{max-width:900px}.bs-ai-panel select{max-width:100%}.bs-ai-config input{width:100%;min-height:36px;padding:7px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:var(--dsw-alias-bg-base);color:inherit;font:inherit}.bs-root [hidden]{display:none!important}.bs-layout.bs-wide{grid-template-columns:minmax(0,1fr)}.bs-library{margin-bottom:18px}.bs-library-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px;margin-bottom:14px}.bs-library-item{display:flex;flex-direction:column;gap:6px;padding:12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;min-width:0}.bs-library-item strong{overflow-wrap:anywhere}.bs-library-item small{color:var(--dsw-alias-label-secondary)}.bs-thumb{width:100%;height:100px;object-fit:contain;image-rendering:pixelated;background:#eee}.bs-library input{font:inherit;padding:7px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:6px}.bs-focus .bs-head,.bs-focus .bs-project,.bs-focus .bs-stats{display:none}.bs-focus>.bs-toolbar{position:sticky;top:0;z-index:3;background:var(--dsw-alias-bg-base);padding:8px}.bs-focus .bs-editor{position:sticky;top:58px;z-index:2;background:var(--dsw-alias-bg-layer-1)}.bs-focus .bs-preview{max-height:calc(100vh - 240px);min-height:400px}.bs-editor{padding:12px;margin-bottom:16px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px}.bs-editor button[aria-pressed=true]{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2);font-weight:650}.bs-editor summary{cursor:pointer;margin-bottom:12px}.bs-editor .bs-toolbar{margin-bottom:8px}.bs-editor .bs-field{margin-bottom:0}.bs-project{margin-bottom:18px}.bs-project input{min-width:180px;max-width:300px;flex:1;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);padding:7px;border-radius:6px;font:inherit}.bs-download{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;margin-top:10px}.bs-download strong{overflow-wrap:anywhere}.bs-download a{color:var(--dsw-alias-brand-primary);text-decoration:underline;font-weight:600}.bs-root button.bs-color{text-align:left;width:100%}.bs-root button.bs-selected{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}.bs-alert button{margin-left:10px}.bs-color small{display:block}.bs-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:22px}.bs-head h1{font-size:25px;letter-spacing:-.6px;margin:0 0 5px;font-weight:650}.bs-muted{color:var(--dsw-alias-label-secondary);font-size:12px}.bs-tag{display:inline-flex;align-items:center;border:1px solid var(--dsw-alias-border-l1);border-radius:20px;padding:4px 10px;font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap}.bs-layout{display:grid;grid-template-columns:250px minmax(0,1fr);gap:20px;align-items:start}.bs-card{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:18px;min-width:0}.bs-card h2{margin:0 0 15px;font-size:14px;font-weight:650}.bs-stack{display:flex;flex-direction:column;gap:16px}.bs-drop{border:1px dashed var(--dsw-alias-border-l2);border-radius:10px;padding:22px 12px;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;background:var(--dsw-alias-bg-layer-2)}.bs-root button,.bs-root select,.bs-root input[type=number]{font:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:7px;min-height:34px;padding:6px 10px}.bs-root button{cursor:pointer}.bs-root button:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-brand-primary)}.bs-root button:focus-visible,.bs-root input:focus-visible,.bs-root select:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.bs-root button:disabled{opacity:.45;cursor:not-allowed}.bs-root button.bs-primary{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base);border-color:var(--dsw-alias-brand-primary);font-weight:600}.bs-full{width:100%}.bs-field{display:flex;flex-direction:column;gap:6px;margin-bottom:14px}.bs-field>span{font-size:12px;color:var(--dsw-alias-label-secondary)}.bs-field input,.bs-field select{width:100%}.bs-pair{display:grid;grid-template-columns:1fr 1fr;gap:10px}.bs-root input[type=range]{width:100%;accent-color:var(--dsw-alias-brand-primary)}.bs-check{display:flex;align-items:center;gap:6px;font-size:12px}.bs-check input{accent-color:var(--dsw-alias-brand-primary)}.bs-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:14px}.bs-toolbar select{max-width:230px}.bs-spacer{flex:1}.bs-preview{min-height:360px;max-height:660px;overflow:auto;display:flex;align-items:flex-start;justify-content:flex-start;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:16px}.bs-preview canvas{display:block;image-rendering:pixelated;flex-shrink:0;height:auto}.bs-empty{min-height:360px;width:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:12px;color:var(--dsw-alias-label-secondary);padding:32px}.bs-empty svg{width:64px;height:64px;color:var(--dsw-alias-label-tertiary)}.bs-empty strong{font-size:16px;color:var(--dsw-alias-label-primary)}.bs-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:18px}.bs-stat{border:1px solid var(--dsw-alias-border-l1);border-radius:9px;padding:12px 14px;background:var(--dsw-alias-bg-layer-1)}.bs-stat strong{display:block;font-size:21px;font-variant-numeric:tabular-nums;font-weight:600}.bs-stat span{font-size:11px;color:var(--dsw-alias-label-secondary)}.bs-exports{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.bs-note{font-size:12px;color:var(--dsw-alias-label-secondary);margin-top:12px;line-height:1.7}.bs-alert{border:1px solid var(--dsw-alias-state-warn-primary);background:var(--dsw-alias-bg-layer-1);padding:10px 14px;border-radius:8px;margin-bottom:14px;font-size:12px}.bs-error{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}.bs-palette{display:grid;grid-template-columns:repeat(auto-fill,minmax(145px,1fr));gap:8px}.bs-color{display:flex;gap:10px;align-items:center;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;padding:9px}.bs-swatch{width:30px;height:30px;flex-shrink:0;border-radius:6px;border:1px solid var(--dsw-alias-border-l2)}.bs-color strong{font-size:12px}.bs-color small{font-size:10px;color:var(--dsw-alias-label-secondary);display:block;font-variant-numeric:tabular-nums}.bs-color b{margin-left:auto;font-size:13px;font-variant-numeric:tabular-nums}.bs-source{width:100%;max-height:150px;object-fit:contain;image-rendering:pixelated;border-radius:6px}.bs-filename{font-size:12px;overflow-wrap:anywhere}.bs-caption{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:10px}.bs-caption h2{margin:0}.bs-step{color:var(--dsw-alias-label-tertiary);font-size:11px;margin-right:7px;font-weight:500}@media(max-width:900px){.bs-root{padding:18px}.bs-layout{grid-template-columns:210px minmax(0,1fr);gap:12px}.bs-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:650px){.bs-layout{grid-template-columns:1fr}.bs-head{align-items:flex-start}.bs-head .bs-tag{display:none}.bs-preview,.bs-empty{min-height:260px}.bs-head h1{font-size:22px}}
`;
  function Icon({size=24}) {return h('svg',{width:size,height:size,viewBox:'0 0 24 24',fill:'none','aria-hidden':true},...[3,10,17].flatMap(y=>[3,10,17].map(x=>h('rect',{key:x+','+y,x,y,width:4,height:4,rx:1,fill:'currentColor',opacity:(x+y)%3===0?.5:1}))));}
  function Source({image}){const ref=useRef(null);useEffect(()=>{if(!image)return;const c=ref.current;c.width=image.width;c.height=image.height;c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(image.data),image.width,image.height),0,0);},[image]);return h('canvas',{ref,className:'bs-source','aria-label':'Source image'});}
  const Preview=createPreview(React),Viewport=createViewport(React,Preview);
  return {inject:['slots','locale'],apply(ctx){
    for(const [language,dict]of Object.entries(dictionaries))ctx.effect(()=>ctx.locale.register(NS,language,dict));
    const t=ctx.locale.bind(NS);
    const AiPanel=createAiPanel(React,{Source,t});
    const Workbench=createWorkbench(React,{core,projects,Viewport,Source,AiPanel,Icon,css,t,ctx});
    ctx.slots.inject('sidebar.panellist',()=>ctx.slots.register({name:'sidebar.panellist',id:'local-bead-studio',order:35,label:()=>t('title')},Icon));
    ctx.slots.inject('main',()=>ctx.slots.register({name:'main',key:'local-bead-studio'},Workbench));
  }};
}

return createClient(React,core,projects,{"en":{"title":"Bead Studio","subtitle":"Turn your favorite pictures into patterns you can build.","badge":"Local conversion · Optional AI","source":"Choose an image","drop":"Drop an image here or upload one","upload":"Upload image","replace":"Replace image","formats":"PNG / JPG / WebP · Up to 12 MB","demo":"Try the cat demo","demoName":"Cat demo · 16 × 16","privacy":"Normal pattern conversion stays local and uses no model. AI sends a reference only after explicit consent. Codex retains conversation attachments; the custom API UI workflow does not write chat records.","settings":"Pattern settings","crop":"Image area","original":"Keep aspect ratio","square":"Center square crop","width":"Width / beads","height":"Height / auto","colors":"Maximum colors","board":"Board size / beads","background":"Transparent areas","transparent":"Leave empty","white":"Fill with white beads","generate":"Generate pattern","working":"Processing…","backgroundNote":"Handles existing transparency only; no background removal. Up to 128 × 128 beads.","heightCapped":"Height capped at 128. Reduce width to preserve the original aspect ratio.","dimensions":"Pattern size","beads":"Total beads","usedColors":"Colors used","boards":"Boards needed","preview":"Pattern preview","engine":"Deterministic engine · v1.0","dirty":"Conversion settings changed. Preview and export still use this pattern; generating again will replace it.","boardView":"Overview or board","overview":"Full pattern","beadUnit":"beads","labels":"Color IDs","grid":"Grid","fit":"Fit width","zoom":"Preview zoom","zoomHint":"Vector preview · 32 pixels per cell at 100%. Choose 100%–400% to read color IDs and scroll in both directions. Fit width is for the overview.","viewportAria":"Interactive bead pattern preview","viewportHint":"Left-drag pans in View mode. In Edit mode use middle button or Space + left-drag to pan; Ctrl/Cmd + wheel zooms around the pointer.","previewAria":"Bead grid with color IDs and row/column coordinates","emptyTitle":"Your first pattern starts with a picture","emptyText":"Upload an image and generate, or try the built-in cat.","csv":"Materials CSV","json":"Project JSON","print":"Prepare boards PDF","exportNote":"PNG / SVG export this view. PDF includes materials and all boards. JSON is a reopenable project. Click the prepared file link to download.","generated":"Pattern ready. Bold borders show board boundaries; dotted empty cells need no beads.","downloaded":"Download requested. Check your browser or DSH download notice.","palette":"Palette & materials","generic":"Generic palette · Not brand codes","paletteNote":"C IDs belong to this pattern only. Match HEX reference colors to actual beads; screen colors are not physical color guarantees.","noPalette":"Generate a pattern to see colors and counts.","memoryNote":"Wait for Synced before leaving; export JSON if saving fails. The library does not store source images; AI image retention depends on the selected engine notice. Undo history lasts this session only.","fileError":"Choose a PNG, JPG or WebP image up to 12 MB.","pixelError":"Image exceeds 20 megapixels. Resize it first.","generateError":"Pattern generation failed. Please retry.","exportSize":"Image is too large. Select one board to export.","exportError":"Export failed. Try SVG instead.","popupError":"Print popup blocked. Allow popups for this page and retry.","project":"Current project","projectName":"Project name","untitled":"Untitled project","importProject":"Import JSON","reloadSaved":"Reload current artwork","saveScope":"Autosaves to the current artwork; edit its name directly. Generating and importing create separate artworks. Source images are not stored. Deleted works go to the recycle bin.","save_loading":"Loading project…","save_saved":"Synced","save_pending":"Changes pending","save_saving":"Saving…","save_error":"Save error","save_conflict":"Changed in another window","restored":"Artwork opened. Edit and export directly; select an image to regenerate.","sourceNotStored":"Pattern restored; the library does not store source images. Upload a reference again.","previousRetained":"New image loaded. Check the planned grid size; the current artwork stays unchanged until generation succeeds.","imported":"Imported as a new artwork without overwriting the original.","projectTooLarge":"Project JSON exceeds 1 MB.","retry":"Retry","conflictHint":"Autosave paused to avoid overwriting another window. Export your current JSON, then restore the latest saved project.","reloadConfirm":"Reloading discards unsaved local changes. Export JSON first.","confirmReload":"Restore now","cancel":"Cancel","zoomOut":"Zoom out","zoomIn":"Zoom in","resetView":"Top left","currentBoardCount":"In this view","totalCount":"Whole pattern","showAll":"Show all colors","highlightHint":"Click a color to highlight it; click again to restore. Highlighting changes only the view, never the pattern, counts or exported colors.","download_preparing":"Preparing file…","download_ready":"File ready. Click the download link below.","download_requested":"Browser download requested. Check its download notice; this does not confirm a completed save.","download_saving":"Writing selected file…","download_saved":"File saved.","download_cancelled":"Save cancelled. The download remains available.","download_error":"Export or save failed. See the error above.","downloadLink":"Download file","saveAs":"Save as…","downloadHint":"Prepare a format, then click its download link. A Save as button appears when supported. Cancellation never silently starts another download.","recoveryHint":"An unsaved draft is available. Restoring creates a separate copy. Closing the app loses the in-memory draft.","recoverDraft":"Restore draft as new artwork","editTitle":"Pattern editor","mode_view":"View","mode_edit":"Edit","undo":"Undo","redo":"Redo","tool_brush":"Brush","tool_eraser":"Eraser","tool_pick":"Pick color","brushColor":"Brush color","editHint":"Left-drag previews immediately; release commits one stroke. Pan with middle button or Space + left-drag. Focus the canvas for Ctrl/Cmd+Z and Shift+Z; keeps 50 session steps.","viewHint":"View mode pans without changing cells.","cellPosition":"Global row, column","emptyCell":"Empty cell","hoverHint":"Hover a cell for its coordinates, board and color.","mergeTitle":"Merge / replace color","mergeFrom":"Source color","mergeTo":"Replace with","chooseColor":"Choose color","mergePreview":"Preview merge","mergeAffected":"Affected beads","previewOnly":"Preview only, not saved; confirm to apply with undo","confirmMerge":"Confirm merge","replaceWarning":"A new artwork will open. The saved current artwork is retained, but this page’s undo history will clear. Export JSON first if needed.","confirmReplace":"Create new artwork","pickedEmpty":"This cell is empty. Choose a palette color or use the eraser.","editFailed":"Edit failed. Please retry.","viewportEditHint":"Left-drag previews immediately; release commits one stroke. Pan with middle button or Space + left-drag. Focus the canvas for Ctrl/Cmd+Z and Shift+Z; keeps 50 session steps.","library":"Artwork library","newProject":"New blank artwork","copyProject":"Save a copy","focusCanvas":"Focus canvas","exitFocus":"Exit focus","hideParams":"Collapse settings","showParams":"Expand settings","hidePalette":"Collapse materials","showPalette":"Expand materials","searchProjects":"Search artwork names","trash":"Recycle bin","refresh":"Refresh","restoreProject":"Restore","purgeProject":"Delete permanently","trashProject":"Move to recycle bin","openProject":"Open","currentProject":"Current artwork","emptyLibrary":"No matching artwork.","previousPage":"Previous","nextPage":"Next","confirm":"Confirm","purgeWarning":"Permanent deletion cannot be undone. Confirm:","trashWarning":"Move to the recycle bin; it can be restored later:","thumbnail":"Artwork thumbnail","keepImageSize":"Keep width and crop when replacing the image","resetImageSize":"Suggest size from current image","sourcePixels":"Source pixels","plannedSize":"Next pattern size (not generated)","gridUnit":"cells","currentDimensions":"Current generated pattern size","aiTitle":"AI Source Assistant · Beta","aiWarning":"AI may change appearance, markings and details. This is not a faithful background cutout.","aiPrivacy":"Both the reference image and generated results will be stored in the selected DSH conversation and attachment storage. The reference is sent as a user-request attachment to the Codex image service using subscription quota. The actual price is unknown. The artwork library still stores patterns only; the upload source is not replaced until you confirm adoption.","aiConsent":"I consent to storing this reference and generated results in the selected conversation and attachment storage and sending the reference to the Codex image service, with subscription quota usage and possible image changes.","aiSession":"DSH conversation for execution","aiChooseSession":"Explicitly choose a conversation","aiSessionNote":"Availability only means the tool entry exists. Session model permissions, login and quota are checked during execution. Requests may be refused; no automatic retries or model/conversation switching. Choose an idle conversation and avoid sending chat messages while generating.","aiUnavailable":"The AI engine is not connected or is unavailable","aiEngine":"Engine / model","aiQuota":"Quota","aiUnknown":"Unknown","aiStyle":"Style","aiFaithful":"Preserve appearance","aiCute":"Cute and simplified","aiOutline":"Clear outlines","aiBackground":"Background","aiKeep":"Try to preserve","aiWhite":"White","aiNotes":"Additional instructions (500 characters maximum)","aiGenerate":"Generate one AI candidate","aiCancel":"Cancel waiting","aiCancelled":"Waiting cancelled; the remote request may already be charged. No automatic retry.","aiWorking":"Waiting for an AI candidate…","aiOriginal":"Original","aiCandidate":"AI candidate","aiAdopt":"Confirm candidate as upload source","aiAdoptHint":"Adopting only replaces the upload source; it does not save an artwork or generate a pattern. Click Generate afterward to create a new artwork.","aiAdopted":"Candidate adopted. You can now generate a pattern.","aiLoading":"Checking AI availability…","aiFailed":"AI request failed (not retried automatically)","aiTestEntry":"AI Source Assistant · Experimental (off until requested)","aiSourceName":"AI candidate source","aiSourceReady":"AI candidate adopted as the upload source. The saved artwork is unchanged. Check the planned size, then generate a separate artwork.","aiRefreshStatus":"Refresh availability","aiNeedSource":"Upload a reference under Select Image below. Restoring a saved pattern does not provide a source photo for AI.","aiConfiguredModel":"Uses Codex plugin image settings","aiProvider":"Image engine","aiCodex":"Codex subscription","aiCustom":"Custom API","aiBaseUrl":"HTTPS base URL (include /v1 if required)","aiCustomModel":"Image model","aiApiKey":"API key (blank preserves an existing key only at the same URL)","aiKeyPresent":"Key stored (never displayed)","aiKeyMissing":"No key stored","aiCustomHelp":"HTTPS public OpenAI-compatible images/edits only; /images/edits is appended to the base URL. Not all providers are compatible.","aiKeyStorage":"Keys are stored by DSH host credentials. The default local backend uses plaintext files protected by file permissions, not an encrypted vault. Use a dedicated key with a spending limit.","aiSaveConfig":"Save API configuration","aiClearConfig":"Delete API configuration and key","aiConfirmClear":"Confirm deletion of configuration and key (artworks are unaffected)","aiDismissClear":"Keep configuration","aiCheckConfig":"Check configuration format (offline)","aiCheckHelp":"Validates saved configuration only. Does not test connectivity, login or quota, or send an image.","aiCustomPrivacy":"The current image will be sent to the base URL shown below and use that provider’s quota; the actual price is unknown. No Codex or chat session is used. This workbench keeps candidates temporarily in memory; projects do not store source images. Provider-side image retention follows its own policies.","aiCustomConsent":"I consent to sending this image to the displayed base URL and using that provider’s quota, and understand possible image changes.","aiEndpoint":"Image endpoint","aiSaved":"Configuration saved. Please confirm consent again.","aiAddressChanged":"Changing the base URL requires entering a new API key.","aiReadModels":"Connect and read models (online, no image generation)","aiModelsHelp":"Only clicking sends authentication to the entered base URL for GET /models. No image is uploaded and editing capability is not verified.","aiModelsFilter":"Show all models","aiModelsSelect":"Select model ID (draft only)","aiModelsPlaceholder":"Choose explicitly; nothing is saved automatically","aiModelsUnverified":"Image candidates are filtered by name only; editing is unverified. Show all models or keep entering an ID manually.","aiModelsEmpty":"No matching models. Show all or enter an ID manually.","aiModelsTruncated":"The model list was truncated; exact IDs can still be entered manually.","aiModelsLoading":"Reading model list…","aiModelsKey":"On success, a newly entered key stays only in frontend memory for saving configuration. It is not displayed or written to projects or chats, and is cleared on failure."},"zh":{"title":"拼豆工作台","subtitle":"把喜欢的图片，变成能照着拼的图纸。","badge":"本地转换 · AI 可选","source":"选择图片","drop":"拖入图片，或点击上传","upload":"上传图片","replace":"更换图片","formats":"PNG / JPG / WebP · 最大 12 MB","demo":"试试小猫示例","demoName":"小猫示例 · 16 × 16","privacy":"常规图纸转换在本机完成，不调用模型。只有明确同意 AI 请求后才发送参考图：Codex 模式保存对话附件，自定义 API 界面模式不写聊天记录。","settings":"图纸设置","crop":"画面范围","original":"保持原图比例","square":"居中裁成正方形","width":"宽度 / 格","height":"高度 / 自动","colors":"最多颜色数","board":"拼板尺寸 / 格","background":"透明区域","transparent":"保留为空格","white":"填充白色豆子","generate":"生成图纸","working":"正在处理…","backgroundNote":"只处理已有透明区域，不会自动抠图。最多 128 × 128 格。","heightCapped":"高度已限制到 128 格；请减小宽度以保留原图比例。","dimensions":"图纸格数","beads":"豆子总数","usedColors":"实际颜色数","boards":"需要拼板","preview":"图纸预览","engine":"固定算法 · v1.0","dirty":"转换参数已改变；预览和导出仍是当前图纸，重新生成将替换当前图纸。","boardView":"选择总览或分板","overview":"完整图纸","beadUnit":"颗","labels":"色号","grid":"网格","fit":"适应宽度","zoom":"预览缩放","zoomHint":"矢量高清预览 · 默认每格 32 像素。选择 100%–400% 查看清晰色号，横向/纵向滚动浏览；适应宽度仅用于总览。","viewportAria":"拼豆图纸交互预览","viewportHint":"查看模式左键拖动；编辑模式中键或空格＋左键平移；Ctrl / ⌘ + 滚轮围绕指针缩放。","previewAria":"拼豆网格图纸，包含颜色编号和行列坐标","emptyTitle":"第一张图纸，从一张图片开始","emptyText":"上传图片后点击生成，或先试试内置的小猫。","csv":"材料 CSV","json":"工程 JSON","print":"生成分板 PDF","exportNote":"PNG / SVG 导出当前视图，PDF 包含材料清单及全部分板，JSON 保存可重新导入的工程。生成后点击文件链接下载。","generated":"图纸已生成。深色边线表示拼板边界，点状空格不需要豆子。","downloaded":"已发起下载，请查看浏览器或 DSH 的下载提示。","palette":"配色与材料清单","generic":"通用配色 · 非品牌色号","paletteNote":"C 编号只在这张图纸中有效；请按 HEX 参考色对照实物选豆，屏幕颜色不等于实物颜色。","noPalette":"生成后显示颜色和每色颗数。","memoryNote":"退出前等待已同步；保存失败先导出 JSON。作品库不存原图；AI 图片留存以所选引擎说明为准。撤销历史仅限当前会话。","fileError":"请选择不超过 12 MB 的 PNG、JPG 或 WebP 图片。","pixelError":"图片超过 2000 万像素，请先缩小图片。","generateError":"图纸生成失败，请重试。","exportSize":"图片过大，请选择单块拼板导出。","exportError":"导出失败，请改用 SVG。","popupError":"打印窗口被拦截，请允许本页面弹出窗口后重试。","project":"当前工程","projectName":"工程名称","untitled":"未命名工程","importProject":"导入 JSON","reloadSaved":"重载当前作品","saveScope":"自动保存到当前作品，名称可直接修改。新生成和导入均创建独立作品；原图不保存。作品库中的删除先移入回收站。","save_loading":"正在读取工程…","save_saved":"已同步","save_pending":"有更改，待保存","save_saving":"正在保存…","save_error":"保存异常","save_conflict":"其他窗口已修改工程","restored":"已打开作品。可直接编辑导出；重新转换需选择原图。","sourceNotStored":"图纸已恢复；作品库不保存原图，请重新上传参考图片。","previousRetained":"新图片已载入，请查看预计格数。原作品与当前图纸保持不变，生成成功后才打开新作品。","imported":"已导入为独立新作品，原作品未被覆盖。","projectTooLarge":"工程 JSON 超过 1 MB，请选择有效的图纸文件。","retry":"重试","conflictHint":"为避免覆盖其他窗口的更新，已暂停自动保存。请先导出当前 JSON，再恢复最近保存。","reloadConfirm":"重载当前作品会丢弃未保存的本页修改，请先导出JSON备份。","confirmReload":"确认恢复","cancel":"取消","zoomOut":"缩小预览","zoomIn":"放大预览","resetView":"回到左上","currentBoardCount":"当前视图颗数","totalCount":"全图颗数","showAll":"显示全部颜色","highlightHint":"点击颜色卡只高亮该颜色，再点一次恢复。此操作仅辅助查看，不改变图纸、材料数量或导出配色。","download_preparing":"正在生成文件…","download_ready":"文件已准备好，请点击下面的下载链接。","download_requested":"已发起浏览器下载；请查看下载提示。此状态不代表文件已保存成功。","download_saving":"正在写入所选文件…","download_saved":"文件保存完成。","download_cancelled":"已取消保存，文件仍可下载。","download_error":"文件生成或保存失败，请查看错误提示。","downloadLink":"点击下载文件","saveAs":"另存为…","downloadHint":"先选择格式生成文件，再点击下载链接。支持系统另存为的浏览器会额外显示按钮；取消不会自动改用其他下载方式。","recoveryHint":"发现上次未保存的草稿。恢复会创建独立副本，不覆盖其他作品；关闭应用会丢失内存草稿。","recoverDraft":"恢复草稿为新作品","editTitle":"图纸编辑","mode_view":"查看","mode_edit":"编辑","undo":"撤销","redo":"重做","tool_brush":"画笔","tool_eraser":"橡皮","tool_pick":"吸色","brushColor":"画笔颜色","editHint":"左键绘制即时预览，松开提交一笔；中键或空格＋左键平移。画布聚焦时 Ctrl/⌘+Z 撤销，Shift+Z 重做；当前会话最近50步。","viewHint":"查看模式只平移，不会修改格子。","cellPosition":"全图行、列","emptyCell":"无豆子","hoverHint":"移到格子上查看坐标、拼板和颜色。","mergeTitle":"颜色合并／全图替换","mergeFrom":"原颜色","mergeTo":"替换为","chooseColor":"选择颜色","mergePreview":"预览合并","mergeAffected":"影响颗数","previewOnly":"仅预览，尚未保存；确认后可撤销","confirmMerge":"确认合并","replaceWarning":"将打开一份新作品，当前已保存作品会保留，但本页撤销历史将清空。可先导出JSON备份。","confirmReplace":"创建新作品","pickedEmpty":"此格无豆子，请选择已有颜色或使用橡皮。","editFailed":"编辑失败，请重试。","viewportEditHint":"左键绘制即时预览，松开提交一笔；中键或空格＋左键平移。画布聚焦时 Ctrl/⌘+Z 撤销，Shift+Z 重做；当前会话最近50步。","library":"作品库","newProject":"新建空白作品","copyProject":"另存为副本","focusCanvas":"专注画布","exitFocus":"退出专注","hideParams":"折叠参数区","showParams":"展开参数区","hidePalette":"折叠材料区","showPalette":"展开材料区","searchProjects":"按名称搜索作品","trash":"回收站","refresh":"刷新","restoreProject":"恢复作品","purgeProject":"永久删除","trashProject":"移入回收站","openProject":"打开","currentProject":"当前作品","emptyLibrary":"没有匹配的作品。","previousPage":"上一页","nextPage":"下一页","confirm":"确认","purgeWarning":"永久删除无法恢复，请确认：","trashWarning":"将作品移入回收站，之后可以恢复：","thumbnail":"作品缩略图","keepImageSize":"换图时沿用上次宽度与裁剪","resetImageSize":"按当前图片重算建议尺寸","sourcePixels":"原图像素","plannedSize":"新图预计尺寸（未生成）","gridUnit":"格","currentDimensions":"当前已生成图纸尺寸","aiTitle":"AI 原稿助手 · Beta","aiWarning":"AI 可能改变长相、花纹和细节，输出不是忠实抠图。","aiPrivacy":"参考图和生成结果都会保存在所选 DSH 对话及附件存储中；参考图作为用户请求附图交给 Codex 图像服务，消耗订阅额度；真实价格未知。作品库仍只存图纸；确认采用前不会替换当前上传源。","aiConsent":"我同意将参考图和生成结果保存在所选对话及附件存储中，并将参考图交给 Codex 图像服务；了解订阅额度消耗和图像变化风险。","aiSession":"用于执行的 DSH 对话","aiChooseSession":"请明确选择一个对话","aiSessionNote":"可用仅代表工具入口存在；会话模型权限、登录和额度以实际执行结果为准。请求可能被拒绝，不自动重试或切换模型、对话。 建议选择空闲对话，生成期间不要同时发送聊天消息。","aiUnavailable":"AI 引擎尚未接入或当前不可用","aiEngine":"引擎 / 模型","aiQuota":"额度","aiUnknown":"未知","aiStyle":"风格","aiFaithful":"尽量保留原貌","aiCute":"可爱简化","aiOutline":"轮廓清晰","aiBackground":"背景","aiKeep":"尽量保留","aiWhite":"白色","aiNotes":"额外要求（最多 500 字）","aiGenerate":"生成一次 AI 候选","aiCancel":"取消等待","aiCancelled":"已取消等待；远端请求可能已计费。不会自动重试。","aiWorking":"正在等待 AI 候选…","aiOriginal":"原图","aiCandidate":"AI 候选","aiAdopt":"确认采用候选作为上传源","aiAdoptHint":"采用只替换上传源；不会保存作品或生成图纸。采用后请点击“生成”创建新作品。","aiAdopted":"候选已采用，请继续生成图纸。","aiLoading":"正在检查 AI 可用性…","aiFailed":"AI 请求失败（未自动重试）","aiTestEntry":"AI 原稿助手 · 测试功能（默认不调用）","aiSourceName":"AI 候选原稿","aiSourceReady":"已采用 AI 候选作为上传源；原作品未改动。请检查预计尺寸，再生成独立新作品。","aiRefreshStatus":"刷新可用状态","aiNeedSource":"请先在下方「选择图片」上传原图。仅恢复已保存图纸不会提供 AI 所需的参考图片。","aiConfiguredModel":"沿用 Codex 插件图像设置","aiProvider":"图像引擎","aiCodex":"Codex 订阅","aiCustom":"自定义 API","aiBaseUrl":"HTTPS 基础地址（含供应商要求的 /v1）","aiCustomModel":"图像模型","aiApiKey":"API Key（留空仅保留同地址已有密钥）","aiKeyPresent":"已有密钥（不回显）","aiKeyMissing":"尚无密钥","aiCustomHelp":"仅支持 HTTPS 公网 OpenAI 兼容 images/edits；自动在基础地址后追加 /images/edits。不保证所有供应商兼容。","aiKeyStorage":"密钥交给 DSH 主机凭据存储；默认本机后端为明文文件，受文件权限保护，并非加密保险箱。建议使用专用限额密钥。","aiSaveConfig":"保存 API 配置","aiClearConfig":"删除 API 配置和密钥","aiConfirmClear":"再次确认删除配置和密钥（不影响原作品）","aiDismissClear":"取消删除","aiCheckConfig":"检查配置格式（不联网）","aiCheckHelp":"仅校验已保存配置格式，不测试连接、登录或额度，不发送图像。","aiCustomPrivacy":"将向下方显示的基础地址发送当前图像，并消耗该供应商额度；真实价格未知。不使用 Codex 或聊天会话；工作台仅将候选暂存在内存，工程不保存原图。供应商如何留存图片以其政策为准。","aiCustomConsent":"我同意向显示的基础地址发送图像并消耗该供应商额度，了解图像可能变化。","aiEndpoint":"实际图像接口","aiSaved":"配置已保存，请重新确认同意。","aiAddressChanged":"基础地址已改变，必须重新输入密钥。","aiReadModels":"连接并读取模型（联网，不生成图片）","aiModelsHelp":"仅点击后向所填基础地址发送认证信息并 GET /models；不上传图片，不验证图像编辑能力。","aiModelsFilter":"显示全部模型","aiModelsSelect":"选择模型 ID（仅修改草稿）","aiModelsPlaceholder":"请手动选择，不会自动保存","aiModelsUnverified":"图像候选筛选仅基于名称，编辑能力未验证；可切换全部或继续手填模型。","aiModelsEmpty":"没有匹配的模型；可切换全部或手填。","aiModelsTruncated":"模型列表已截断，仍可手填精确 ID。","aiModelsLoading":"正在读取模型列表…","aiModelsKey":"读取成功后，新输入密钥仅暂留前端内存供保存配置使用，不回显、不写入工程或聊天；失败会清空。"}});}});
