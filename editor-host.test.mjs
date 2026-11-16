import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';
import {apply,EditorService} from './editor-host.js';import {generate,demoImage,toCsv,toSvg} from './core.js';import {normalizeProject} from './project.js';import {toPdf} from './pdf.js';
const image=demoImage(),pattern=generate({width:image.width,height:image.height,rgba:Array.from(image.data)}),project=normalizeProject(pattern);
test('editor tool and HTTP share results, reject invalid input, do not persist',async t=>{
 let tool,route,origin;const disposers=[];apply({effect:fn=>disposers.push(fn()),tools:{register:x=>(tool=x,()=>{})},webServer:{getOrigin:()=>origin,register:x=>(route=x,()=>{})}});
 const server=http.createServer((req,res)=>route.handler(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));origin=`http://127.0.0.1:${server.address().port}`;
 t.after(async()=>{disposers.forEach(fn=>fn());server.closeAllConnections();await new Promise(r=>server.close(r));});
 const request=(body,extra={})=>fetch(origin,{method:'POST',headers:{'Content-Type':'application/json','X-DSH-Bead-Studio':'1',Origin:origin,...extra},body:JSON.stringify(body)});
 for(const op of [{action:'paint',indices:[0,1,2],colorId:'C01'},{action:'paint',indices:[19,20],colorId:null},{action:'merge',fromId:'C01',toId:'C02'}]){
  const a=tool.execute({...op,projectJson:JSON.stringify(project)},{signal:new AbortController().signal});const r=await request({...op,project});assert.equal(r.status,200);assert.deepEqual(await r.json(),a);
  assert.equal(a.changed,true);assert.equal(a.project.pattern.cells.length,256);assert.ok(toCsv(a.project.pattern));assert.ok(toSvg(a.project.pattern));assert.ok(toPdf(a.project.pattern).length>0);
 }
 assert.equal((await request({action:'paint',project,indices:[99999],colorId:'C01'})).status,400);
 assert.equal((await request({action:'merge',project,fromId:'C01',toId:'invalid'})).status,400);
 assert.equal((await request({action:'paint',project,indices:[0],colorId:null},{Origin:'https://other.invalid'})).status,403);
 assert.equal((await request({action:'paint',project,indices:[0],colorId:null},{'X-DSH-Bead-Studio':''})).status,403);
 assert.equal(pattern.totalBeads,137);assert.deepEqual(project.pattern,pattern);
});
test('empty strokes and same-color merges report no change',()=>{const service=new EditorService();assert.equal(service.edit({action:'paint',project,indices:[],colorId:null}).changed,false);assert.equal(service.edit({action:'merge',project,fromId:'C01',toId:'C01'}).changed,false);assert.throws(()=>service.edit({action:'unknown',project}));});
