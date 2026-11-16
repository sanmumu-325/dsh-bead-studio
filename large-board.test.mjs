import test from 'node:test';
import assert from 'node:assert/strict';
import {generate,toSvg,toCsv} from './core.js';
import {BeadStudioService,apply} from './host-v4.js';
const rgba=Array.from({length:128*128*4},(_,i)=>i%4===3?255:(i%4===0?200:90));
for(const boardSize of [75,100,120])test(`large ${boardSize} board generation, coverage and export`,()=>{
 const args={width:128,height:128,rgba,boardSize};const p=generate(args);
 assert.equal(p.boards.length,4);assert.equal(p.boards[0].width,boardSize);assert.equal(p.boards[3].width,128-boardSize);
 const seen=new Uint8Array(128*128);
 for(const b of p.boards){for(let y=b.y;y<b.y+b.height;y++)for(let x=b.x;x<b.x+b.width;x++)seen[y*128+x]++;assert.match(toSvg(p,{boardId:b.id}),/viewBox=/);}
 assert.ok(seen.every(n=>n===1));assert.equal(p.boards.reduce((a,b)=>a+b.count,0),16384);assert.match(toCsv(p),/16384/);
 assert.deepEqual(new BeadStudioService().generate(args),p);assert.match(toSvg(p),/data-board-lines/);
 const one=generate({width:boardSize,height:boardSize,rgba:rgba.slice(0,boardSize*boardSize*4),boardSize});assert.equal(one.boards.length,1);
});
test('host tool publishes and enforces updated maximum',async()=>{
 let tool;apply({effect:f=>f(),tools:{register:x=>{tool=x;return()=>{};}},webServer:{register:()=>()=>{},getOrigin:()=>''}});
 assert.equal(tool.parameters.properties.boardSize.maximum,120);
 for(const boardSize of [75,100,120])assert.equal((await tool.execute({action:'generate',width:1,height:1,rgba:[0,0,0,255],boardSize},{signal:new AbortController().signal})).boardSize,boardSize);
 await assert.rejects(()=>tool.execute({action:'generate',width:1,height:1,rgba:[0,0,0,255],boardSize:121},{signal:new AbortController().signal}));
});
