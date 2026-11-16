import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverApiModels,MAX_MODELS_BYTES} from './ai-models.js';
import {ImageApiError} from './ai-http.js';
const credentials={baseUrl:'https://api.example.com/custom/v1/',apiKey:'test-key+/%==ABC'};
function fixture(payload){const calls=[];return{calls,transport:async(url,options)=>{calls.push({url,options});return{body:Buffer.from(JSON.stringify(payload))};}};}

test('one explicit GET only, original path preserved, bounded response, no edit or pagination',async()=>{
  const f=fixture({data:[{id:'gpt-image-2',owned_by:'private-secret',extra:{key:'do not return'}}],has_more:true,next:'https://other.example.com/?secret=x'});
  const result=await discoverApiModels(credentials,f);
  assert.deepEqual(result,{models:[{id:'gpt-image-2',imageCandidate:true,editingVerified:false}],truncated:true});
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].url,'https://api.example.com/custom/v1/models');
  assert.deepEqual(f.calls[0].options.headers,{Authorization:`Bearer ${credentials.apiKey}`,Accept:'application/json'});assert.equal(f.calls[0].options.method,'GET');assert.equal(f.calls[0].options.maxBytes,MAX_MODELS_BYTES);assert.equal(f.calls[0].options.timeoutMs,30000);assert.equal(f.calls[0].options.body,undefined);
});
test('identifiers are deduplicated/filtered, image candidates are heuristic and never verified',async()=>{
  const names=['GPT-IMAGE-2','flux-1','dall-e-3','imagen-4','sdxl','stable-diffusion-xl','text-model'];
  const f=fixture({data:[...names.map(id=>({id})),{id:'text-model'},{id:' text-model '},{id:' invented-image-name '},{id:''},{id:'   '},{id:'bad\nname'},{id:'\ntrimmed'},{id:'bidi\u202ename'},{id:'x'.repeat(201)},{id:1},null,{},'not-an-object']});
  const result=await discoverApiModels(credentials,f);assert.equal(result.models.length,7);assert.equal(result.truncated,false);
  for(const item of result.models){assert.equal(item.imageCandidate,item.id!=='text-model');assert.equal(item.editingVerified,false);assert.deepEqual(Object.keys(item),['id','imageCandidate','editingVerified']);}
});
test('raw, URL-encoded, fully-percent-encoded, double encoded and base64 secrets never become names',async()=>{
  const key=credentials.apiKey,base64=Buffer.from(key).toString('base64'),allPercent=[...Buffer.from(key)].map(x=>'%'+x.toString(16).padStart(2,'0')).join('');
  const leaks=[key,encodeURIComponent(key),encodeURIComponent(encodeURIComponent(key)),allPercent,`invalid%xx${allPercent}`,base64,base64.replace(/=+$/,''),Buffer.from(key).toString('base64url'),encodeURIComponent(base64),Buffer.from(`prefix:${key}:suffix`).toString('base64')];
  const f=fixture({data:[...leaks.map(id=>({id:`image-${id}`})),...leaks.map(id=>({id})),{id:'safe-image-model'}]});
  const result=await discoverApiModels(credentials,f);
  assert.deepEqual(result.models,[{id:'safe-image-model',imageCandidate:true,editingVerified:false}]);
  assert(!JSON.stringify(result).includes(key));
});
test('cap is 500 distinct safe model names and reports unreturned names without following links',async()=>{
  const f=fixture({data:Array.from({length:520},(_,i)=>({id:`image-${i}`}))});const result=await discoverApiModels(credentials,f);assert.equal(result.models.length,500);assert.equal(result.truncated,true);assert.equal(f.calls.length,1);
  const duplicate=fixture({data:Array.from({length:520},()=>({id:'image-0'}))});assert.deepEqual(await discoverApiModels(credentials,duplicate),{models:[{id:'image-0',imageCandidate:true,editingVerified:false}],truncated:false});
});
test('valid empty list stays an honest empty result',async()=>{
  assert.deepEqual(await discoverApiModels(credentials,fixture({data:[]})),{models:[],truncated:false});
});
test('invalid destination, key, and cancellation are rejected before transport',async()=>{
  for(const patch of [{baseUrl:'http://api.example.com'},{baseUrl:'https://localhost'},{baseUrl:'https://api.example.com/?key=x'},{apiKey:''},{apiKey:'x\nheader'},{apiKey:'x'.repeat(4097)},{apiKey:'key with spaces'}]){const f=fixture({data:[]});await assert.rejects(discoverApiModels({...credentials,...patch},f));assert.equal(f.calls.length,0);}
  const controller=new AbortController();controller.abort('secret');const f=fixture({data:[]});await assert.rejects(discoverApiModels({...credentials,signal:controller.signal},f),{code:'CANCELLED'});assert.equal(f.calls.length,0);
});
test('invalid or oversized JSON does not reflect body or metadata',async()=>{
  for(const body of [Buffer.from('<html>secret-value</html>'),Buffer.from('{"error":{"message":"secret-value"}}'),Buffer.alloc(MAX_MODELS_BYTES+1)]){let count=0;await assert.rejects(discoverApiModels(credentials,{transport:async()=>{count++;return{body};}}),e=>e.code==='INVALID_MODELS_RESPONSE'&&!e.message.includes('secret'));assert.equal(count,1);}
});
test('known safe transport errors are preserved; arbitrary thrown publicMessage is not trusted',async()=>{
  const safe=new ImageApiError('HTTP_ERROR','固定安全错误');safe.category='authentication';
  await assert.rejects(discoverApiModels(credentials,{transport:async()=>{throw safe;}}),e=>e===safe);
  await assert.rejects(discoverApiModels(credentials,{transport:async()=>{const e=new Error('secret-body');e.publicMessage='secret-key';throw e;}}),e=>e.code==='MODELS_REQUEST_FAILED'&&!JSON.stringify(e).includes('secret'));
});
test('cancellation after response never publishes a model list',async()=>{
  const controller=new AbortController();await assert.rejects(discoverApiModels({...credentials,signal:controller.signal},{transport:async()=>{controller.abort();return{body:Buffer.from('{"data":[{"id":"image"}]}')};}}),{code:'CANCELLED'});
});
