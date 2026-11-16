import test from 'node:test';
import assert from 'node:assert/strict';
import {createCodexAdapter} from './ai-codex-adapter.js';
const source={attachmentId:`sha256:${'1'.repeat(64)}`,mediaType:'image/png',bytes:3,width:2,height:2};
const output={...source,attachmentId:`sha256:${'2'.repeat(64)}`};
function fixture(){
  const events=[],trace=[];
  let current,roots,initiator;
  const agent={id:'root-one',session:{append(type,data,options){trace.push('append');events.push({type,data,options});}}};
  current=agent;roots=[agent];
  const ctx={
    agents:{roots:()=>roots,get:()=>current,withInitiator:async(a,fn)=>{assert.equal(a,agent);initiator=a;trace.push('initiator');try{return await fn();}finally{initiator=undefined;}}},
    sessions:{flush:async(s)=>{assert.equal(s,agent.session);trace.push('flush');}},
    attachments:{imageLimits:{maxImageBytes:1000},saveImage:async(input)=>{trace.push('save');assert(input.data instanceof Uint8Array);return source;},readImage:async(ref,signal)=>{trace.push('read');assert.equal(ref,output);assert(signal);return{ref:output,data:new Uint8Array([4,5,6])};}},
    tools:{get:(name)=>name==='codex_image_generate'?{}:undefined,execute:async(exec)=>{trace.push('execute');assert.equal(initiator,agent);assert.equal(exec.agent,agent);assert.equal(exec.name,'codex_image_generate');assert.match(exec.callId,/^bead-ai-/);assert.deepEqual(exec.arguments,{prompt:'simplify this picture',referenceImages:[{attachmentId:source.attachmentId}]});assert(!('parent'in exec));return{isError:false,content:[{type:'image',attachment:output}],value:{image:output}};}}
  };
  return{ctx,events,trace,agent,adapter:createCodexAdapter(ctx),input:{sessionId:agent.id,image:{bytes:new Uint8Array([1,2,3]),mediaType:'image/png',width:2,height:2},prompt:'simplify this picture'},remove(){current=undefined;roots=[];}};
}
test('status reports mounted only, explicit root identity and configured model',()=>{
  const f=fixture();assert.deepEqual(f.adapter.status(),{available:true,engine:'Codex image',model:'configured',sessions:[{id:'root-one',label:'root-one'}]});assert.equal(f.events.length,0);assert.equal(f.trace.length,0);
});
test('standard pipeline: persist source, retain initiator, read finalized image, persist transparent completion',async()=>{
  const f=fixture(),result=await f.adapter.edit(f.input);
  assert.equal(result.imageDataUrl,'data:image/png;base64,BAUG');
  assert.deepEqual(f.trace,['save','append','flush','initiator','execute','read','append','flush']);
  assert.equal(f.events.length,2);
  for(const e of f.events){assert.equal(e.type,'user/message');assert.equal(e.data.role,'user');assert.equal(e.data.source.kind,'bead-studio-ai');assert.deepEqual(e.options,{surfaceOp:'append'});assert.match(e.data.id,/^[0-9a-f-]{36}$/);}
  assert.notEqual(f.events[0].data.id,f.events[1].data.id);
  assert.match(f.events[0].data.content[0].text,/不要求聊天助手执行或重复生成/);
  assert.match(f.events[1].data.content[0].text,/不要再次执行或重复生成/);
  assert.equal(f.events[1].data.content[1].attachment,output);
});
test('no missing or non-root session may store an attachment',async()=>{
  for(const sessionId of [undefined,'','other']){const f=fixture();await assert.rejects(f.adapter.edit({...f.input,sessionId}));assert.deepEqual(f.trace,[]);}
});
test('removed selected agent fails before dispatch, source may already exist',async()=>{
  const f=fixture();f.ctx.attachments.saveImage=async()=>{f.remove();return source;};await assert.rejects(f.adapter.edit(f.input),{code:'SESSION_UNAVAILABLE'});assert.deepEqual(f.events,[]);
});
test('missing capability does not pretend authentication or invoke anything',async()=>{
  const f=fixture();f.ctx.tools.get=()=>undefined;assert.equal(f.adapter.status().available,false);await assert.rejects(f.adapter.edit(f.input),{code:'UNAVAILABLE'});assert.deepEqual(f.trace,[]);
});
test('configured model only; validate input before any persistence',async()=>{
  for(const extra of [{model:'gpt-image-2'},{prompt:''},{image:{bytes:new Uint8Array(1001),mediaType:'image/png',width:1,height:1}}]){const f=fixture();await assert.rejects(f.adapter.edit({...f.input,...extra}));assert.deepEqual(f.trace,[]);}
});
test('policy error neither reads hidden canonical value nor retries',async()=>{
  const f=fixture();let count=0;f.ctx.tools.execute=async()=>{count++;return{isError:true,error:{message:'secret-token'},content:[],value:{image:output}};};
  await assert.rejects(f.adapter.edit(f.input),e=>e.code==='IMAGE_FAILED'&&!JSON.stringify(e).includes('secret-token'));
  assert.equal(count,1);assert.equal(f.events.length,2);assert(!f.trace.includes('read'));assert(!JSON.stringify(f.events).includes('secret-token'));
});
test('redacted final image cannot be recovered from canonical value',async()=>{
  const f=fixture();f.ctx.tools.execute=async()=>({isError:false,content:[{type:'text',text:'hidden'}],value:{image:output}});
  await assert.rejects(f.adapter.edit(f.input),{code:'RESULT_UNAVAILABLE'});assert(!f.trace.includes('read'));
});
test('external errors cannot inject their publicMessage into UI or log',async()=>{
  const f=fixture();f.ctx.tools.execute=async()=>{const e=new Error('Bearer secret');e.publicMessage='password-secret';throw e;};
  await assert.rejects(f.adapter.edit(f.input),e=>!JSON.stringify(e).includes('secret'));
  assert(!JSON.stringify(f.events).includes('secret'));
});
test('cancel before source save has no side effects',async()=>{
  const f=fixture(),ac=new AbortController();ac.abort('secret');await assert.rejects(f.adapter.edit({...f.input,signal:ac.signal}),{code:'CANCELLED'});assert.deepEqual(f.trace,[]);
});
test('cancel during dispatch records cancellation, no retry and no fallback read',async()=>{
  const f=fixture(),ac=new AbortController();let count=0;f.ctx.tools.execute=async(exec)=>{count++;assert.equal(exec.signal,ac.signal);ac.abort();return{isError:false,content:[{type:'image',attachment:output}]};};
  await assert.rejects(f.adapter.edit({...f.input,signal:ac.signal}),{code:'CANCELLED'});assert.equal(count,1);assert(!f.trace.includes('read'));assert.match(f.events[1].data.content[0].text,/已取消/);
});
test('source flush failure prevents paid execution and reports receipt failure if logging also fails',async()=>{
  const f=fixture();f.ctx.sessions.flush=async()=>{throw new Error('disk-secret');};await assert.rejects(f.adapter.edit(f.input),{code:'RECEIPT_FAILED'});assert(!f.trace.includes('execute'));
});
test('completion persistence failure reports possibly generated, never duplicates call or record',async()=>{
  const f=fixture();let count=0;f.ctx.sessions.flush=async()=>{if(++count===2)throw new Error('disk-secret');};await assert.rejects(f.adapter.edit(f.input),e=>e.code==='RECEIPT_FAILED'&&e.publicMessage.includes('可能已经生成'));assert.equal(f.events.length,2);assert.equal(f.trace.filter(x=>x==='execute').length,1);
});
test('concurrent work in same session is rejected and lock releases after settlement',async()=>{
  const f=fixture();let release;const hold=new Promise(r=>release=r);const original=f.ctx.tools.execute;
  f.ctx.tools.execute=async(exec)=>{await hold;return original(exec);};const first=f.adapter.edit(f.input);
  await assert.rejects(f.adapter.edit(f.input),{code:'BUSY'});release();await first;await f.adapter.edit(f.input);
});
