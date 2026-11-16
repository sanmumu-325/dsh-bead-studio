import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createSafeTransport,isPublicAddress,publicHttpsUrl,classifyHttpError,MAX_ERROR_BYTES} from './ai-http.js';

function harness({addresses=[{address:'93.184.216.34',family:4}],status=200,headers={},chunks=[Buffer.from('ok')],hang=false}={}){
  const calls=[];let dnsCount=0,destroyed=0,response;
  const lookup=async(host,options)=>{dnsCount++;assert.equal(options.all,true);calls.push({dns:host});return addresses;};
  const request=(url,options,callback)=>{
    const req=new EventEmitter();calls.push({url:url.href,options});
    req.destroy=()=>{destroyed++;};
    req.end=body=>{calls.at(-1).body=body;if(hang)return;queueMicrotask(()=>{
      const res=response=new PassThrough();res.statusCode=status;res.headers=headers;callback(res);for(const chunk of chunks)if(!res.destroyed)res.write(chunk);if(!res.destroyed)res.end();
    });};return req;
  };
  return{transfer:createSafeTransport({lookup,request}),calls,get dnsCount(){return dnsCount;},get destroyed(){return destroyed;},get response(){return response;}};
}

test('address admission rejects private/reserved IPv4 and IPv6 including mapped/transition ranges',()=>{
  for(const value of ['0.0.0.0','10.2.3.4','127.0.0.1','100.64.0.1','169.254.169.254','172.16.0.1','192.168.1.1','192.0.0.1','192.0.2.1','198.18.0.1','198.51.100.3','203.0.113.8','224.0.0.1','255.255.255.255','::','::1','::ffff:127.0.0.1','::ffff:8.8.8.8','fc00::1','fe80::1','fe80::1%eth0','64:ff9b::808:808','2001:db8::1','2001::1','2002:0808:0808::1','3fff::1','junk'])assert.equal(isPublicAddress(value),false,value);
  for(const value of ['8.8.8.8','93.184.216.34','2606:4700:4700::1111','2001:4860:4860::8888'])assert.equal(isPublicAddress(value),true,value);
});
test('URL admission rejects alternate local literals, userinfo and fragments',()=>{
  for(const value of ['http://example.com','https://localhost','https://foo.localhost','https://metadata.internal','https://127.1','https://0x7f000001','https://2130706433','https://[::1]','https://user:secret@example.com','https://@example.com','https://example.com/#','https://example.com/?','https:example.com','https://example.com\\x','https://example.com\n'])assert.throws(()=>publicHttpsUrl(value),value);
  assert.equal(publicHttpsUrl('https://example.com/image?signature=x',{allowQuery:true}).hostname,'example.com');
});
test('DNS is checked once, all answers checked, TLS hostname preserved and address pinned',async()=>{
  const h=harness();const result=await h.transfer('https://api.example.com/v1/images/edits',{method:'POST',headers:{Authorization:'Bearer test-only'},body:Buffer.from('body')});
  assert.equal(result.body.toString(),'ok');assert.equal(h.dnsCount,1);
  const {options}=h.calls.find(c=>c.options);assert.equal(options.agent,false);assert.equal(options.rejectUnauthorized,true);assert.equal(options.servername,'api.example.com');assert.equal(options.headers['Accept-Encoding'],'identity');
  for(let n=0;n<2;n++)options.lookup('api.example.com',{},(error,address,family)=>{assert.equal(error,null);assert.equal(address,'93.184.216.34');assert.equal(family,4);});
  options.lookup('api.example.com',{all:true},(error,values)=>assert.deepEqual(values,[{address:'93.184.216.34',family:4}]));assert.equal(h.dnsCount,1);
});
test('mixed public/private DNS and empty DNS are rejected before HTTPS',async()=>{
  for(const addresses of [[],[{address:'93.184.216.34',family:4},{address:'127.0.0.1',family:4}],[{address:'::1',family:6}]]){const h=harness({addresses});await assert.rejects(h.transfer('https://api.example.com'),{code:'UNSAFE_ADDRESS'});assert.equal(h.calls.filter(x=>x.options).length,0);}
});
test('public literal skips DNS but still validates and pins family',async()=>{
  const h=harness();await h.transfer('https://8.8.8.8/image');assert.equal(h.dnsCount,0);assert.equal(h.calls[0].options.servername,'');
});
test('redirect and upstream error are bounded static messages, no body or signed URL leakage',async()=>{
  for(const status of [302,401,429,500]){const h=harness({status,headers:{location:'https://secret.example.com/?key=secret'},chunks:[Buffer.from('api-key-secret')]});await assert.rejects(h.transfer('https://api.example.com'),e=>e.code==='HTTP_ERROR'&&e.publicMessage.includes(String(status))&&!e.message.includes('secret'));assert.equal(h.calls.filter(x=>x.options).length,1);}
});
test('bounded content-length, chunk overflow and compressed response rejected',async()=>{
  for(const opts of [{headers:{'content-length':'100'}},{chunks:[Buffer.from('123'),Buffer.from('456')]},{headers:{'content-encoding':'gzip'}}]){const h=harness(opts);await assert.rejects(h.transfer('https://api.example.com',{maxBytes:4}));assert(h.destroyed>0);}
});
test('pre-abort has zero DNS or requests',async()=>{
  const h=harness(),controller=new AbortController();controller.abort('secret reason');await assert.rejects(h.transfer('https://api.example.com',{signal:controller.signal}),{code:'CANCELLED'});assert.equal(h.calls.length,0);
});
test('cancellation and timeout destroy request without retry',async()=>{
  const h=harness({hang:true}),controller=new AbortController();const pending=h.transfer('https://api.example.com',{signal:controller.signal});await Promise.resolve();await Promise.resolve();controller.abort();await assert.rejects(pending,{code:'CANCELLED'});assert(h.destroyed>=1);
  const timeout=harness({hang:true});await assert.rejects(timeout.transfer('https://api.example.com',{timeoutMs:10}),{code:'TIMEOUT'});assert(timeout.destroyed>=1);
});
test('DNS timeout prevents later request even if resolver eventually returns',async()=>{
  let resolve,count=0;const waiting=new Promise(r=>resolve=r);
  const transfer=createSafeTransport({lookup:()=>waiting,request:()=>{count++;throw Error('should never run');}});
  await assert.rejects(transfer('https://api.example.com',{timeoutMs:10}),{code:'TIMEOUT'});resolve([{address:'8.8.8.8',family:4}]);await Promise.resolve();assert.equal(count,0);
});
test('bounded error JSON selects fixed local categories without reflecting upstream text',async()=>{
  const cases=[
    [400,{code:'model_not_found',message:'secret-token https://private.example/'},'invalid_model'],
    [400,{type:'invalid_request_error',param:'model',code:'invalid_value'},'invalid_model'],
    [401,{message:'secret-token'},'authentication'],
    [403,{message:'model not found'},'authentication'],
    [400,{code:'insufficient_quota'},'quota'],
    [429,{},'quota'],
    [400,{code:'missing_required_parameter',param:'secret-param'},'missing_parameter'],
    [400,{message:'The image field is required'},'missing_parameter'],
    [400,{code:'unsupported_parameter',param:'secret-param'},'unsupported_parameter'],
    [415,{},'unsupported_format'],
    [400,{message:'unsupported image format: secret-format'},'unsupported_format'],
    [404,{code:'model_not_found'},'invalid_model'],
    [404,{},'unsupported_endpoint'],
    [400,{message:'images/edits endpoint not found'},'unsupported_endpoint'],
    [500,{code:'secret-code',type:'secret-type',param:'secret-param',message:'secret-body'},'unknown'],
  ];
  for(const [status,error,category]of cases){const h=harness({status,chunks:[Buffer.from(JSON.stringify({error}))]});await assert.rejects(h.transfer('https://api.example.com'),e=>e.code==='HTTP_ERROR'&&e.category===category&&e.status===status&&!JSON.stringify(e).includes('secret')&&!e.message.includes('https://'));assert.equal(h.calls.filter(x=>x.options).length,1);}
});
test('redirect/compressed/oversized HTTP errors are rejected without body listeners',async()=>{
  for(const options of [{status:302},{status:400,headers:{'content-encoding':'gzip'}},{status:400,headers:{'content-length':String(MAX_ERROR_BYTES+1)}}]){const h=harness({...options,chunks:[Buffer.from('{"error":{"code":"model_not_found"}}')]});await assert.rejects(h.transfer('https://api.example.com'),e=>e.code==='HTTP_ERROR'&&e.category!=='invalid_model');assert.equal(h.response.listenerCount('data'),0);}
});
test('error body cap closes overflowing responses and ignores malformed JSON',async()=>{
  for(const chunks of [[Buffer.alloc(MAX_ERROR_BYTES+1,120)],[Buffer.alloc(MAX_ERROR_BYTES,120),Buffer.from('x')],[Buffer.from('<html>secret-key</html>')]]){const h=harness({status:400,chunks});await assert.rejects(h.transfer('https://api.example.com'),e=>e.category==='unknown'&&!e.message.includes('secret'));assert(h.destroyed>0);}
  assert.equal(classifyHttpError(400,Buffer.alloc(MAX_ERROR_BYTES+1)).category,'unknown');
});
test('DNS/native request errors cannot leak raw message or key',async()=>{
  for(const factory of [{lookup:async()=>{throw Error('secret-api-key');}},{lookup:async()=>[{address:'8.8.8.8',family:4}],request:()=>{throw Error('secret-api-key');}}]){const transfer=createSafeTransport(factory);await assert.rejects(transfer('https://api.example.com'),e=>!e.message.includes('secret'));}
});
