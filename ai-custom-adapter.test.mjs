import test from 'node:test';
import assert from 'node:assert/strict';
import {createCustomApiAdapter,normalizeApiBaseUrl,normalizeApiConfig,inspectRaster} from './ai-custom-adapter.js';
import {deflateSync} from 'node:zlib';
function chunk(type,data){const raw=Buffer.concat([Buffer.from(type),data]);let crc=0xffffffff;for(const byte of raw){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}const size=Buffer.alloc(4),checksum=Buffer.alloc(4);size.writeUInt32BE(data.length);checksum.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([size,raw,checksum]);}
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(1,0);ihdr.writeUInt32BE(1,4);ihdr[8]=8;ihdr[9]=6;
const png=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(Buffer.from([0,255,0,0,255]))),chunk('IEND',Buffer.alloc(0))]);
const config={baseUrl:'https://api.example.com/v1/',model:'image-model',apiKey:'test-only-key',revision:'revision-a'};
const input={image:{bytes:png,mediaType:'image/png',width:1,height:1},prompt:'Simplify the supplied subject.',model:config.model,configRevision:config.revision};
function setup(payload={data:[{b64_json:png.toString('base64')} ]}){
  const calls=[];let current={...config};
  const adapter=createCustomApiAdapter({getConfig:async()=>current,transport:async(url,options)=>{calls.push({url,options});return{status:200,body:Buffer.from(JSON.stringify(payload))};}});
  return{adapter,calls,setConfig(value){current=value;}};
}
test('base URL normalization preserves caller path and never adds v1',()=>{
  assert.equal(normalizeApiBaseUrl('https://API.EXAMPLE.COM:443/'),'https://api.example.com');
  assert.equal(normalizeApiBaseUrl('https://api.example.com/custom/v1///'),'https://api.example.com/custom/v1');
  assert.deepEqual(normalizeApiConfig(config),{baseUrl:'https://api.example.com/v1',model:config.model,apiKey:config.apiKey});
});
test('configuration rejects unsafe endpoints and header injection',()=>{
  for(const baseUrl of ['http://api.example.com','https://localhost','https://192.168.0.1/v1','https://user:password@api.example.com','https://api.example.com?key=secret','https://api.example.com/#fragment'])assert.throws(()=>normalizeApiConfig({...config,baseUrl}));
  for(const apiKey of ['','key\r\nX-Key: bad','带空格key','key with spaces'])assert.throws(()=>normalizeApiConfig({...config,apiKey}));
  assert.throws(()=>normalizeApiConfig({...config,model:'model\nheader'}));
});
test('status is local validation only and has no secret or session fields',async()=>{
  const f=setup(),state=await f.adapter.status();assert.deepEqual(state,{available:true,engine:'Custom image API',model:'image-model',baseUrl:'https://api.example.com/v1',revision:'revision-a'});assert.equal(f.calls.length,0);assert(!JSON.stringify(state).includes(config.apiKey));
  f.setConfig(null);assert.equal((await f.adapter.status()).available,false);f.setConfig({...config,apiKey:''});assert.equal((await f.adapter.status()).available,false);
});
test('one multipart request, configured origin only, exact supported fields, no model/session fallback',async()=>{
  const f=setup(),result=await f.adapter.edit(input);assert.equal(result.imageDataUrl,`data:image/png;base64,${png.toString('base64')}`);assert.equal(f.calls.length,1);
  const {url,options}=f.calls[0];assert.equal(url,'https://api.example.com/v1/images/edits');assert.equal(options.headers.Authorization,'Bearer test-only-key');assert.equal(options.method,'POST');assert.equal(options.headers['Content-Length'],String(options.body.length));
  const body=options.body.toString('latin1');for(const name of ['image','model','prompt','n'])assert(body.includes(`name="${name}"`));assert(body.includes('filename="source.png"'));for(const name of ['response_format','size','quality'])assert(!body.includes(`name="${name}"`));assert(!body.includes(config.apiKey));
});
test('opaque confirmation revision and requested model must match snapshot before upload',async()=>{
  for(const patch of [{configRevision:undefined},{configRevision:'old'},{model:'other'}]){const f=setup();await assert.rejects(f.adapter.edit({...input,...patch}),{code:'CONFIG_CHANGED'});assert.equal(f.calls.length,0);}
  const f=setup();f.setConfig({...config,baseUrl:'https://another.example.com',revision:'revision-b'});await assert.rejects(f.adapter.edit(input),{code:'CONFIG_CHANGED'});assert.equal(f.calls.length,0);
});
test('configuration is snapshotted; later object mutation cannot pair old URL with new key',async()=>{
  const mutable={...config},calls=[];let unlock;const pending=new Promise(r=>unlock=r);
  const adapter=createCustomApiAdapter({getConfig:()=>mutable,transport:async(url,options)=>{calls.push({url,options});await pending;return{body:Buffer.from(JSON.stringify({data:[{b64_json:png.toString('base64')}]}))};}});
  const operation=adapter.edit(input);await Promise.resolve();await Promise.resolve();mutable.apiKey='new-key';mutable.baseUrl='https://different.example.com';unlock();await operation;assert.equal(calls[0].url,'https://api.example.com/v1/images/edits');assert.equal(calls[0].options.headers.Authorization,'Bearer test-only-key');
});
test('returned signed URL gets fresh unauthenticated GET and no output URL echo',async()=>{
  const calls=[],signed='https://cdn.example.com/output.png?signature=secret-value';
  const adapter=createCustomApiAdapter({getConfig:()=>config,transport:async(url,options)=>{calls.push({url,options});return{body:calls.length===1?Buffer.from(JSON.stringify({data:[{url:signed}]})):png};}});
  const result=await adapter.edit(input);assert.equal(calls.length,2);assert.equal(calls[1].url,signed);assert.equal(calls[1].options.method,'GET');assert(!('Authorization'in calls[1].options.headers));assert(!JSON.stringify(result).includes('secret-value'));
});
test('private returned URL is refused before downloader and malformed b64 never falls back to URL',async()=>{
  for(const payload of [{data:[{url:'https://127.0.0.1/private?key=secret'}]},{data:[{b64_json:'invalid!',url:'https://cdn.example.com/image.png'}]}]){const f=setup(payload);await assert.rejects(f.adapter.edit(input),e=>!e.message.includes('secret'));assert.equal(f.calls.length,1);}
});
test('upstream format failures are sanitized, bounded and single-call only',async()=>{
  for(const payload of [{error:{message:'key-secret'}},{data:[]},{data:[{},{}]},{data:[{b64_json:'AAAA'}]},{data:[{b64_json:'<svg>secret</svg>'}]}]){const f=setup(payload);await assert.rejects(f.adapter.edit(input),e=>!e.message.includes('secret'));assert.equal(f.calls.length,1);}
});
test('reject non-PNG, mismatched dimensions and pre-cancellation before upload',async()=>{
  for(const image of [{...input.image,width:2},{...input.image,mediaType:'image/jpeg'},{...input.image,bytes:Buffer.from('<html>')}]){const f=setup();await assert.rejects(f.adapter.edit({...input,image}));assert.equal(f.calls.length,0);}
  const f=setup(),ac=new AbortController();ac.abort();await assert.rejects(f.adapter.edit({...input,signal:ac.signal}),{code:'CANCELLED'});assert.equal(f.calls.length,0);
});
test('arbitrary exceptions do not leak upstream message or fabricated publicMessage',async()=>{
  const adapter=createCustomApiAdapter({getConfig:()=>config,transport:async()=>{const e=new Error('secret-token');e.publicMessage='secret-key';throw e;}});
  await assert.rejects(adapter.edit(input),e=>e.code==='IMAGE_API_FAILED'&&!JSON.stringify(e).includes('secret'));
});
test('real Pillow-generated JPEG and WebP fixtures are recognized and returned with sniffed MIME',async()=>{
  const fixtures={jpeg:'/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAADAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDi6KKK+ZP3E//Z',webp:'UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoCAAMAAUAmJaACdLoB+AADsAD+8ut//NgVzXPv9//S4P0uD9Lg/9KQAAA='};
  for(const [type,base64]of Object.entries(fixtures)){assert.deepEqual(inspectRaster(Buffer.from(base64,'base64')),{mediaType:`image/${type}`,width:2,height:3});const f=setup({data:[{b64_json:base64}]});assert.equal((await f.adapter.edit(input)).imageDataUrl,`data:image/${type};base64,${base64}`);}
});
test('raster recognition refuses HTML and truncation; PNG dimensions come from bytes',()=>{
  assert.deepEqual(inspectRaster(png),{mediaType:'image/png',width:1,height:1});for(const bytes of [Buffer.from('<html>not an image</html>'),png.subarray(0,33),Buffer.from('<svg width="1" height="1"/>')])assert.throws(()=>inspectRaster(bytes));
});
