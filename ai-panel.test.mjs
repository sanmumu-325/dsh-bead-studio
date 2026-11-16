import test from 'node:test';
import assert from 'node:assert/strict';
import {createBeadAiController,beadAiImageBytes,decodeBeadAiImage,encodeBeadAiSource,saveBeadAiConfig,beadAiPublicConfig,readBeadAiModels} from './ai-client.js';
import {createAiPanel,aiPanelLocales} from './ai-panel.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const source={width:1,height:1,data:new Uint8ClampedArray(4)},candidate={...source,ai:true};
function setup(overrides={}){
  const calls=[],states=[],busy=[],timers=new Map();let timerId=0,time=0;
  const deps={post:async body=>{calls.push(body);return body.action==='status'?{available:true,sessions:[{id:'s1',label:'Test session'}],engine:'mock',model:'test',quota:'unknown'}:{id:'job-1',state:'running'};},encode:async()=> 'data:image/png;base64,mock',decode:async()=>candidate,onChange:s=>states.push(s),onBusyChange:b=>busy.push(b),now:()=>time,setTimer:(fn,delay)=>{const id=++timerId;timers.set(id,{fn,delay});return id;},clearTimer:id=>timers.delete(id),...overrides};
  const controller=createBeadAiController(deps);
  return {controller,calls,states,busy,timers,async fire(delay){const entry=[...timers].find(([,v])=>v.delay===delay);assert.ok(entry);timers.delete(entry[0]);time+=delay;await entry[1].fn();},start:extra=>controller.start({source,consent:true,sessionId:'s1',width:48,maxColors:16,...extra})};
}

test('custom start needs no session and forwards opaque config revision without a key',async()=>{
  const calls=[],v=setup({post:async body=>{calls.push(body);return body.action==='status'?{available:true,revision:'opaque:rev/2',baseUrl:'https://images.example/v1',endpoint:'https://images.example/v1/images/edits'}:{id:'custom-job',state:'running'};}});
  await v.controller.status('custom');assert.equal(await v.start({provider:'custom',sessionId:''}),true);
  const request=calls.find(c=>c.action==='start');assert.equal(request.provider,'custom');assert.equal(request.configRevision,'opaque:rev/2');assert.equal('sessionId' in request,false);assert.equal('apiKey' in request,false);
  assert.equal(calls[0].provider,'custom');v.controller.dispose();
});
test('switching engines cancels late generation and late status cannot overwrite selected engine',async()=>{
  const late=deferred(),oldStatus=deferred(),calls=[];let delayStatus=false;
  const v=setup({post:async body=>{calls.push(body);if(body.action==='start')return late.promise;if(body.action==='status')return body.provider==='custom'?{available:true,revision:'custom-rev'}:delayStatus?oldStatus.promise:{available:true,sessions:[{id:'s1'}]};return {};}});
  await v.controller.status();const start=v.start();await tick();delayStatus=true;const stale=v.controller.status();await v.controller.status('custom');
  oldStatus.resolve({available:true,sessions:[{id:'stale'}]});await stale;assert.equal(v.controller.snapshot().provider,'custom');assert.equal(v.controller.snapshot().status.revision,'custom-rev');
  late.resolve({id:'old-job',state:'succeeded',imageDataUrl:'mock'});await start;await tick();assert.equal(v.controller.snapshot().candidate,null);assert.ok(calls.some(c=>c.action==='cancel'&&c.id==='old-job'));v.controller.dispose();
});
test('config saves preserve opaque revision, require a new key for new address, and always clear key',async()=>{
  const config=beadAiPublicConfig({baseUrl:'https://one.example/v1',model:'m',revision:'opaque/rev',hasKey:true,apiKey:'must-not-survive'});assert.equal('apiKey' in config,false);assert.equal(beadAiPublicConfig().revision,'');
  let cleared=0;const calls=[],post=async body=>{calls.push(body);return {...config,revision:'new:revision',apiKey:'must-not-survive'};};
  const result=await saveBeadAiConfig({baseUrl:config.baseUrl,model:'m2',config,clearKey:()=>cleared++},post);
  assert.equal(calls[0].expectedRevision,'opaque/rev');assert.equal('apiKey' in calls[0],false);assert.equal('apiKey' in result,false);assert.equal(cleared,1);
  await assert.rejects(saveBeadAiConfig({baseUrl:'https://two.example/v1',model:'m',config,clearKey:()=>cleared++},post),/new API key/);assert.equal(calls.length,1);assert.equal(cleared,2);
  await assert.rejects(saveBeadAiConfig({baseUrl:config.baseUrl,model:'m',apiKey:'test-key',config,clearKey:()=>cleared++},async()=>{throw new Error('Host sanitized failure');}),/sanitized/);assert.equal(cleared,3);
});
function renderCustomPanel(patch={}){
  const cfg=beadAiPublicConfig({baseUrl:'https://one.example/v1',model:'image-model',revision:'opaque:config',hasKey:true,endpoint:'https://one.example/v1/images/edits'}),changes=[],operations=[];
  const values=[{status:{...cfg,available:true},phase:'idle',busy:false},'','faithful','keep','',true,'custom',cfg,cfg.baseUrl,cfg.model,'test-key',false,'',false];for(const [i,v]of Object.entries(patch))values[Number(i)]=v;
  let si=0,ri=0;const layouts=[];const ctrl={reset:()=>operations.push('reset'),status:p=>operations.push(p),start:()=>operations.push('start')};
  const React={createElement:(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity)}),useState(initial){const i=si++;return [i<values.length?values[i]:initial,value=>changes.push({i,value})];},useRef(initial){return {current:ri++===0?ctrl:initial};},useEffect(){},useLayoutEffect(fn){layouts.push(fn);}};
  const Panel=createAiPanel(React,{Source:()=>null,t:k=>k}),root=Panel({source,sourceId:1,params:{width:48,maxColors:16},onAdopt(){}}),nodes=[];
  function walk(n){if(!n||typeof n!=='object')return;nodes.push(n);n.children.forEach(walk);}walk(root);return {nodes,changes,operations,layouts};
}
test('reading models needs no saved model, is click-only, and preserves draft key on success',async()=>{
  const original=globalThis.fetch,calls=[];globalThis.fetch=async(url,options)=>{calls.push(JSON.parse(options.body));return {ok:true,json:async()=>({models:[{id:'Vendor/Image:Exact-v2',imageCandidate:true,editingVerified:false}],truncated:false})};};
  try{
    const v=renderCustomPanel({7:beadAiPublicConfig(),8:'https://new.example/v1',9:''});await tick();assert.equal(calls.length,0);
    const read=v.nodes.find(n=>n.type==='button'&&n.children.includes('aiReadModels'));assert.equal(read.props.disabled,false);await read.props.onClick();
    assert.deepEqual(calls,[{action:'custom_models',baseUrl:'https://new.example/v1',apiKey:'test-key',expectedRevision:''}]);
    assert.ok(v.changes.some(c=>c.i===14&&c.value.models?.[0].id==='Vendor/Image:Exact-v2'));assert.equal(v.changes.some(c=>c.i===9),false);assert.equal(v.changes.some(c=>c.i===10),false);assert.deepEqual(v.operations,['reset']);
  }finally{globalThis.fetch=original;}
});
test('models dropdown filters candidates or all and selects exact ID as unsaved draft only',()=>{
  const models={models:[{id:'Vendor/Image:Exact-v2',imageCandidate:true,editingVerified:false},{id:'text-ONLY',imageCandidate:false,editingVerified:false}],busy:false,error:'',truncated:true};
  const v=renderCustomPanel({14:models}),list=v.nodes.find(n=>n.props['data-ai-model-list']);
  assert.deepEqual(list.children.map(n=>n.props.value),['','Vendor/Image:Exact-v2']);assert.equal(list.props.value,'');assert.equal(v.changes.some(c=>c.i===9),false);
  list.props.onChange({target:{value:'Vendor/Image:Exact-v2'}});assert.ok(v.changes.some(c=>c.i===9&&c.value==='Vendor/Image:Exact-v2'));assert.ok(v.changes.some(c=>c.i===5&&c.value===false));assert.deepEqual(v.operations,['reset']);
  const all=renderCustomPanel({14:models,15:true});assert.deepEqual(all.nodes.find(n=>n.props['data-ai-model-list']).children.map(n=>n.props.value),['','Vendor/Image:Exact-v2','text-ONLY']);
});
test('late model results are isolated after address/key/source/provider changes or config refresh',async()=>{
  const original=globalThis.fetch;
  try{for(const change of [
    v=>v.nodes.find(n=>n.type==='input'&&n.props.type==='url').props.onChange({target:{value:'https://other.example/v1'}}),
    v=>v.nodes.find(n=>n.type==='input'&&n.props.type==='password').props.onChange({target:{value:'different-key'}}),
    v=>v.layouts[0](),
    v=>v.nodes.find(n=>n.type==='select'&&n.props.value==='custom').props.onChange({target:{value:'codex'}}),
    v=>v.nodes.find(n=>n.type==='button'&&n.children.includes('aiRefreshStatus')).props.onClick()
  ]){
    const pending=deferred();globalThis.fetch=async(url,options)=>JSON.parse(options.body).action==='custom_models'?pending.promise:{ok:true,json:async()=>({revision:'new'})};
    const v=renderCustomPanel(),request=v.nodes.find(n=>n.type==='button'&&n.children.includes('aiReadModels')).props.onClick();change(v);
    pending.resolve({ok:true,json:async()=>({models:[{id:'stale-model',imageCandidate:true}],truncated:false})});await request;await tick();assert.equal(v.changes.some(c=>c.i===14&&c.value.models?.length),false);
  }}finally{globalThis.fetch=original;}
});
test('models failure clears draft key without clearing manual model and missing lists stay errors',async()=>{
  const original=globalThis.fetch;globalThis.fetch=async()=>({ok:false,status:401,json:async()=>({error:'Authentication refused'})});
  try{const v=renderCustomPanel();await v.nodes.find(n=>n.type==='button'&&n.children.includes('aiReadModels')).props.onClick();assert.ok(v.changes.some(c=>c.i===10&&c.value===''));assert.equal(v.changes.some(c=>c.i===9),false);assert.ok(v.changes.some(c=>c.i===14&&c.value.error==='Authentication refused'));}finally{globalThis.fetch=original;}
  const config=beadAiPublicConfig({baseUrl:'https://one.example/v1',revision:'opaque'});let body;
  await assert.rejects(readBeadAiModels({baseUrl:config.baseUrl,config},async b=>{body=b;return {};}),/No model list/);assert.deepEqual(body,{action:'custom_models',baseUrl:config.baseUrl,expectedRevision:'opaque'});
  await assert.rejects(readBeadAiModels({baseUrl:'https://other.example/v1',config},async()=>assert.fail()),/new API key/);
});

test('unsaved key drafts block custom generation even after consent is checked again',()=>{
  for(const apiKey of ['replacement-key',' ']){
    const v=renderCustomPanel({10:apiKey}),button=v.nodes.find(n=>n.type==='button'&&n.children.includes('aiGenerate'));
    assert.equal(button.props.disabled,true);button.props.onClick();assert.equal(v.operations.includes('start'),false);
  }
  const ready=renderCustomPanel({10:''}),button=ready.nodes.find(n=>n.type==='button'&&n.children.includes('aiGenerate'));
  assert.equal(button.props.disabled,false);button.props.onClick();assert.ok(ready.operations.includes('start'));
});
test('custom refresh reloads public config before status and clears key, candidate and consent',async()=>{
  const original=globalThis.fetch,calls=[],updated={baseUrl:'https://two.example/v1',model:'new-model',endpoint:'https://two.example/v1/images/edits',hasKey:true,revision:'opaque:new'};
  globalThis.fetch=async(url,options)=>{calls.push(JSON.parse(options.body));return {ok:true,json:async()=>updated};};
  try{
    const v=renderCustomPanel();v.nodes.find(n=>n.type==='button'&&n.children.includes('aiRefreshStatus')).props.onClick();await tick();
    assert.deepEqual(calls,[{action:'custom_config'}]);assert.deepEqual(v.operations,['reset','custom']);
    assert.ok(v.changes.some(c=>c.i===7&&c.value.revision==='opaque:new'));assert.ok(v.changes.some(c=>c.i===8&&c.value===updated.baseUrl));assert.ok(v.changes.some(c=>c.i===9&&c.value===updated.model));
    assert.ok(v.changes.some(c=>c.i===5&&c.value===false));assert.ok(v.changes.some(c=>c.i===10&&c.value===''));
    calls.length=0;const codex=renderCustomPanel({6:'codex'});codex.nodes.find(n=>n.type==='button'&&n.children.includes('aiRefreshStatus')).props.onClick();await tick();assert.equal(calls.length,0);assert.deepEqual(codex.operations,[undefined]);
  }finally{globalThis.fetch=original;}
});
test('custom UI hides conversation consent, protects key input and clears keys on save success and failure',async()=>{
  const original=globalThis.fetch;
  try{for(const ok of [true,false]){
    const calls=[];globalThis.fetch=async(url,options)=>{calls.push(JSON.parse(options.body));return {ok,status:ok?200:409,json:async()=>ok?{baseUrl:'https://one.example/v1',model:'image-model',hasKey:true,revision:'new'}:{error:'Configuration changed'} };};
    const v=renderCustomPanel(),password=v.nodes.find(n=>n.type==='input'&&n.props.type==='password');assert.equal(password.props.autoComplete,'new-password');
    assert.equal(v.nodes.some(n=>n.children.includes('aiSession')),false);assert.equal(v.nodes.some(n=>n.children.includes('aiConsent')),false);assert.ok(v.nodes.some(n=>n.children.includes('aiCustomConsent')));
    v.nodes.find(n=>n.type==='button'&&n.children.includes('aiSaveConfig')).props.onClick();await tick();
    assert.equal(calls[0].expectedRevision,'opaque:config');assert.ok(v.changes.filter(c=>c.i===10).every(c=>c.value===''));assert.ok(v.changes.some(c=>c.i===5&&c.value===false));if(ok)assert.ok(v.operations.includes('custom'));
  }}finally{globalThis.fetch=original;}
});
test('delete configuration requires a second confirmation and format check sends no image',async()=>{
  const original=globalThis.fetch,calls=[];globalThis.fetch=async(url,options)=>{calls.push(JSON.parse(options.body));return {ok:true,json:async()=>({revision:'',valid:true,message:'Format only'})};};
  try{
    const first=renderCustomPanel();first.nodes.find(n=>n.type==='button'&&n.children.includes('aiClearConfig')).props.onClick();await tick();assert.equal(calls.length,0);assert.ok(first.changes.some(c=>c.i===13&&c.value===true));
    const confirmed=renderCustomPanel({13:true});confirmed.nodes.find(n=>n.type==='button'&&n.children.includes('aiConfirmClear')).props.onClick();await tick();assert.deepEqual(calls[0],{action:'custom_clear',expectedRevision:'opaque:config'});
    const check=renderCustomPanel();check.nodes.find(n=>n.type==='button'&&n.children.includes('aiCheckConfig')).props.onClick();await tick();assert.deepEqual(calls[1],{action:'custom_check'});
  }finally{globalThis.fetch=original;}
});

test('status unavailable, missing source and absent consent cannot start',async()=>{
  const v=setup();assert.equal(await v.start(),false);await v.controller.status();
  assert.equal(await v.start({sessionId:''}),false);assert.equal(await v.start({sessionId:'unknown'}),false);
  assert.equal(await v.start({consent:false}),false);assert.equal(await v.start({source:null}),false);assert.equal(await v.start({notes:'x'.repeat(501)}),false);
  assert.equal(v.calls.filter(x=>x.action==='start').length,0);v.controller.dispose();
  const u=setup({post:async()=>({available:false,reason:'Not connected'})});await u.controller.status();assert.equal(await u.start(),false);assert.equal(u.controller.snapshot().status.reason,'Not connected');u.controller.dispose();
});
test('single start, two-second polling, candidate only adopted explicitly',async()=>{
  let polls=0;const calls=[];
  const v=setup({post:async body=>{calls.push(body);if(body.action==='status')return {available:true,sessions:[{id:'s1',label:'Test session'}]};if(body.action==='poll'&&++polls===2)return {id:'j',state:'succeeded',imageDataUrl:'mock'};return {id:'j',state:'running'};}});
  await v.controller.status();await v.start();assert.equal(await v.start(),false);
  assert.equal(v.controller.snapshot().candidate,null);await v.fire(2000);await v.fire(2000);
  assert.equal(v.controller.snapshot().candidate,candidate);assert.equal(v.controller.snapshot().busy,false);assert.equal(v.timers.size,0);
  let adopted=null;assert.equal(adopted,null);assert.equal(v.controller.adopt(image=>adopted=image),true);assert.equal(adopted,candidate);assert.equal(v.controller.adopt(()=>assert.fail()),false);
  assert.equal(calls.filter(x=>x.action==='start').length,1);assert.equal(calls.find(x=>x.action==='start').sessionId,'s1');assert.deepEqual(v.busy,[true,false]);v.controller.dispose();
});
test('cancel before start id arrives sends one deferred cancel and blocks duplicate start',async()=>{
  const pending=deferred(),calls=[];
  const v=setup({post:async body=>{calls.push(body);if(body.action==='status')return {available:true,sessions:[{id:'s1',label:'Test session'}]};if(body.action==='start')return pending.promise;return {};}});
  await v.controller.status();const first=v.start();await tick();v.controller.cancel();v.controller.cancel();
  assert.equal(v.controller.snapshot().phase,'cancelled');assert.equal(await v.start(),false);assert.equal(v.timers.size,0);
  pending.resolve({id:'late-id',state:'succeeded',imageDataUrl:'mock'});await first;await tick();
  assert.equal(v.controller.snapshot().candidate,null);assert.equal(v.controller.snapshot().busy,false);
  assert.deepEqual(calls.filter(x=>x.action==='cancel'),[{action:'cancel',id:'late-id'}]);assert.equal(calls.filter(x=>x.action==='start').length,1);v.controller.dispose();
});
test('source reset and dispose ignore late poll results and clear all timers',async()=>{
  for(const action of ['reset','dispose']){
    const poll=deferred(),calls=[];const v=setup({post:async body=>{calls.push(body);if(body.action==='status')return {available:true,sessions:[{id:'s1',label:'Test session'}]};if(body.action==='poll')return poll.promise;return {id:'j',state:'running'};}});
    await v.controller.status();await v.start();const query=v.fire(2000);await tick();v.controller[action]();const count=v.states.length;
    poll.resolve({id:'j',state:'succeeded',imageDataUrl:'mock'});await query;await tick();
    assert.equal(v.controller.snapshot().candidate,null);assert.equal(v.states.length,count);assert.equal(v.timers.size,0);assert.equal(calls.filter(x=>x.action==='cancel').length,1);v.controller.dispose();
  }
});
test('cancelling encoding or decoding cannot publish stale candidate',async()=>{
  const encode=deferred(),a=setup({encode:()=>encode.promise});await a.controller.status();const start=a.start();a.controller.reset();encode.resolve('mock');await start;assert.equal(a.calls.filter(x=>x.action==='start').length,0);a.controller.dispose();
  const decode=deferred(),b=setup({post:async body=>body.action==='status'?{available:true,sessions:[{id:'s1',label:'Test session'}]}:{id:'j',state:'succeeded',imageDataUrl:'mock'},decode:()=>decode.promise});
  await b.controller.status();const request=b.start();await tick();b.controller.cancel();decode.resolve(candidate);await request;assert.equal(b.controller.snapshot().candidate,null);b.controller.dispose();
});
test('poll failure and six-minute timeout fail once without restarting generation',async()=>{
  const calls=[],v=setup({post:async body=>{calls.push(body);if(body.action==='status')return {available:true,sessions:[{id:'s1',label:'Test session'}]};if(body.action==='poll')throw new Error('network failure');return {id:'j',state:'running'};}});
  await v.controller.status();await v.start();await v.fire(2000);await tick();assert.equal(v.controller.snapshot().phase,'failed');assert.match(v.controller.snapshot().error,/network/);assert.equal(v.timers.size,0);assert.equal(calls.filter(x=>x.action==='start').length,1);v.controller.dispose();
  const timeout=setup();await timeout.controller.status();await timeout.start();await timeout.fire(360000);await tick();assert.equal(timeout.controller.snapshot().phase,'failed');assert.match(timeout.controller.snapshot().error,/timed out/);assert.equal(timeout.timers.size,0);timeout.controller.dispose();
});
test('only PNG JPEG and WebP data with matching signatures are accepted; URLs never fetched',()=>{
  const data=(type,bytes)=>`data:image/${type};base64,${Buffer.from(bytes).toString('base64')}`;
  assert.equal(beadAiImageBytes(data('png',[137,80,78,71,13,10,26,10])).type,'image/png');
  assert.equal(beadAiImageBytes(data('jpeg',[255,216,255,0])).type,'image/jpeg');
  assert.equal(beadAiImageBytes(data('webp',[82,73,70,70,0,0,0,0,87,69,66,80])).type,'image/webp');
  for(const value of ['https://example.com/image.png','data:image/svg+xml;base64,AAAA',data('png',[255,216,255]),'data:image/png;base64,%%%%'])assert.throws(()=>beadAiImageBytes(value));
});
test('decoded image exceeding 20 million pixels is rejected and bitmap closed',async()=>{
  const original=globalThis.createImageBitmap;let closed=false;
  globalThis.createImageBitmap=async()=>({width:5000,height:5000,close(){closed=true;}});
  try{await assert.rejects(decodeBeadAiImage('data:image/png;base64,iVBORw0KGgo='),/20 million/);assert.equal(closed,true);}finally{if(original===undefined)delete globalThis.createImageBitmap;else globalThis.createImageBitmap=original;}
});
test('plain demo source converts to canvas ImageData and scales longest side to 1024',async()=>{
  const saved=globalThis.document,canvases=[],written=[];
  class CanvasImageData{constructor(width,height){this.width=width;this.height=height;this.data=new Uint8ClampedArray(width*height*4);}}
  globalThis.document={createElement(){const c={width:0,height:0,getContext:()=>({createImageData:(w,h)=>new CanvasImageData(w,h),putImageData(image){assert.ok(image instanceof CanvasImageData);written.push(image);},drawImage(){}}),toDataURL(type){assert.equal(type,'image/png');return 'encoded';}};canvases.push(c);return c;}};
  try{
    const plain={width:2048,height:1024,data:new Uint8ClampedArray(2048*1024*4)};plain.data.set([23,45,67,255]);
    assert.equal(await encodeBeadAiSource(plain),'encoded');assert.equal(canvases[1].width,1024);assert.equal(canvases[1].height,512);
    assert.notEqual(written[0],plain);assert.deepEqual([...written[0].data.slice(0,4)],[23,45,67,255]);assert.equal(plain.data[0],23);
    const native=new CanvasImageData(2,1);native.data.set([1,2,3,255]);assert.equal(await encodeBeadAiSource(native),'encoded');assert.deepEqual([...written[1].data],[...native.data]);
    await assert.rejects(encodeBeadAiSource({width:1,height:1,data:[]}),/Invalid source/);
  }finally{if(saved===undefined)delete globalThis.document;else globalThis.document=saved;}
});
test('panel session switch resets candidate and consent; adoption only follows explicit confirmed click',()=>{
  let resets=0,adopted=0;const changes=[],fakeController={reset(){resets++;},adopt(callback){callback(candidate);}};
  function render(consent){let stateIndex=0,refIndex=0;const values=[{status:{available:true,sessions:[{id:'s1',label:'Test session'}]},phase:'succeeded',candidate,busy:false},'s1','faithful','keep','',consent];
    const React={createElement:(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity)}),useState(initial){const i=stateIndex++;return [i<values.length?values[i]:initial,value=>changes.push({i,value})];},useRef:()=>({current:refIndex++===0?fakeController:null}),useEffect:()=>{},useLayoutEffect:()=>{}};
    const Panel=createAiPanel(React,{Source:()=>null,t:key=>key}),node=Panel({source,sourceId:1,params:{},onAdopt:()=>adopted++}),nodes=[];
    function visit(n){if(!n||typeof n!=='object')return;nodes.push(n);n.children.forEach(visit);}visit(node);return nodes;
  }
  let nodes=render(false),adopt=nodes.find(n=>n.type==='button'&&n.children.includes('aiAdopt'));
  assert.equal(adopt.props.disabled,true);adopt.props.onClick();assert.equal(adopted,0);
  nodes=render(true);assert.equal(adopted,0);nodes.find(n=>n.type==='button'&&n.children.includes('aiAdopt')).props.onClick();assert.equal(adopted,1);
  nodes.find(n=>n.type==='select'&&n.props.value==='s1').props.onChange({target:{value:'s2'}});assert.equal(resets,1);assert.deepEqual(changes.slice(-2),[{i:1,value:'s2'},{i:5,value:false}]);
});

test('initial panel requires unchecked consent, disables start and exposes warnings in both locales',()=>{
  const React={createElement:(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity)}),useState:value=>[value,()=>{}],useRef:value=>({current:value}),useEffect:()=>{},useLayoutEffect:()=>{}};
  const Panel=createAiPanel(React,{Source:()=>null,t:key=>aiPanelLocales.en[key]});const node=Panel({source,sourceId:1,params:{width:48,maxColors:16},onAdopt:()=>assert.fail()});
  const nodes=[];function visit(n){if(!n||typeof n!=='object')return;nodes.push(n);n.children.forEach(visit);}visit(node);
  assert.equal(nodes.find(n=>n.type==='input'&&n.props.type==='checkbox').props.checked,false);
  assert.equal(nodes.find(n=>n.type==='button'&&n.children[0]===aiPanelLocales.en.aiGenerate).props.disabled,true);
  assert.equal(nodes.find(n=>n.type==='textarea').props.maxLength,500);
  assert.equal(nodes.find(n=>n.type==='select').props.value,'codex');assert.ok(nodes.some(n=>n.type==='select'&&n.props.value===''));
  assert.deepEqual(Object.keys(aiPanelLocales.zh).sort(),Object.keys(aiPanelLocales.en).sort());
  for(const key of ['aiPrivacy','aiConsent']){assert.match(aiPanelLocales.zh[key],/参考图和生成结果/);assert.match(aiPanelLocales.en[key],/reference.*generated results/);}
});
