import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {apply,BeadStudioService} from './host-v4.js';
import {demoImage} from './core.js';

test('UI endpoint and agent tool call same bounded service',async t=>{
 let route,tool,origin;const effects=[];
 apply({effect:fn=>effects.push(fn()),tools:{register:x=>{tool=x;return()=>{};}},webServer:{getOrigin:()=>origin,register:x=>{route=x;return()=>{};}}});
 const server=http.createServer((req,res)=>route.handler(req,res));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
 t.after(()=>{for(const dispose of effects.reverse())dispose();server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
 const image=demoImage(),body={width:image.width,height:image.height,rgba:Array.from(image.data),maxColors:12,boardSize:29,background:'transparent'};
 async function req(data,opts={}){return fetch(origin,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-DSH-Bead-Studio':'1',...opts.headers},body:typeof data==='string'?data:JSON.stringify(data)});}
 await t.test('same result via HTTP, tool and service',async()=>{const r=await req(body);assert.equal(r.status,200);const p=(await r.json()).pattern;assert.deepEqual(p,new BeadStudioService().generate(body));assert.deepEqual(p,await tool.execute({action:'generate',...body},{signal:new AbortController().signal}));assert.deepEqual(p,await tool.execute({action:'demo'},{signal:new AbortController().signal}));});
 await t.test('desktop bridge without Origin still requires custom header',async()=>{const r=await fetch(origin,{method:'POST',headers:{'Content-Type':'application/json','X-DSH-Bead-Studio':'1'},body:JSON.stringify(body)});assert.equal(r.status,200);const denied=await fetch(origin,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(denied.status,403);});
 await t.test('CORS preflight cannot authorize cross-origin use',async()=>{const r=await fetch(origin,{method:'OPTIONS',headers:{Origin:'https://example.com','Access-Control-Request-Headers':'x-dsh-bead-studio'}});assert.equal(r.status,403);assert.equal(r.headers.get('access-control-allow-origin'),null);});
 await t.test('reject foreign origin',async()=>assert.equal((await req(body,{headers:{Origin:'https://example.com'}})).status,403));
 await t.test('reject missing origin',async()=>assert.equal((await req(body,{headers:{Origin:''}})).status,403));
 await t.test('reject invalid pixels',async()=>assert.equal((await req({...body,rgba:[0]})).status,400));
 await t.test('reject invalid JSON',async()=>assert.equal((await req('{')).status,400));
 await t.test('reject oversized body',async()=>assert.equal((await req(' '.repeat(300001))).status,413));
 await t.test('reject unsupported content type',async()=>assert.equal((await req(body,{headers:{'Content-Type':'text/plain'}})).status,415));
 await t.test('reject wrong method',async()=>assert.equal((await fetch(origin,{headers:{Origin:origin,'X-DSH-Bead-Studio':'1'}})).status,405));
});
