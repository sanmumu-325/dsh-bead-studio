import { toCsv } from './core.js';
/** Dependency-free vector PDF. No popup, print API, network, filesystem or bitmap conversion. */
export function toPdf(pattern) {
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
