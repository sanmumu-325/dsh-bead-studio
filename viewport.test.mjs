import test from 'node:test';
import assert from 'node:assert/strict';
import {clampViewportZoom,viewportAnchorScroll,viewportCellAt,viewportLineIndices,createViewport} from './viewport.js';
import {createPreview} from './preview.js';

const pattern={width:20,height:20,boardSize:10,boards:[{id:'B1',x:0,y:0,width:10,height:10}],palette:[{id:'C1',hex:'#000000',rgb:[0,0,0]},{id:'C2',hex:'#ffffff',rgb:[255,255,255]}],cells:Array.from({length:400},(_,i)=>i%2)};
const t=key=>key;
const h=(type,props,...children)=>({type,props,children:children.flat(Infinity)});
function harness(initial={}) {
  let props={pattern,boardId:'',labels:true,grid:true,fit:false,zoom:100,highlight:'',t,resetKey:0,...initial};
  let refs=[],index=0,mounted=false,layouts=[],effects=[],cleanups=[],svgWidth=704,svgHeight=704,left=0,top=0;
  const listeners=new Map(),captured=new Set(),removed=[];
  const el={clientWidth:320,clientHeight:240,clientLeft:1,clientTop:1,style:{},
    get scrollWidth(){return svgWidth+32;},get scrollHeight(){return svgHeight+32;},
    get scrollLeft(){return left;},set scrollLeft(v){left=Math.max(0,Math.min(v,this.scrollWidth-this.clientWidth));},
    get scrollTop(){return top;},set scrollTop(v){top=Math.max(0,Math.min(v,this.scrollHeight-this.clientHeight));},
    getBoundingClientRect:()=>({left:100,top:50}),
    querySelector:()=>({getBoundingClientRect:()=>({left:117-left,top:67-top,width:svgWidth,height:svgHeight})}),
    focus(){this.focused=true;},setPointerCapture(id){captured.add(id);},hasPointerCapture:id=>captured.has(id),releasePointerCapture:id=>captured.delete(id),
    addEventListener(type,fn,options){assert.ok(!listeners.has(type));listeners.set(type,{fn,options});},
    removeEventListener(type,fn,options){assert.equal(listeners.get(type)?.fn,fn);assert.equal(options,false);listeners.delete(type);removed.push(type);}
  };
  let stateUpdates=0;
  const React={createElement:h,useState(value){const i=index++;if(!refs[i])refs[i]={value};return [refs[i].value,next=>{refs[i].value=typeof next==='function'?next(refs[i].value):next;stateUpdates++;}];},useRef(value){const i=index++;return refs[i]??(refs[i]={current:value});},useLayoutEffect(fn){layouts.push(fn);},useEffect(fn){if(!mounted)effects.push(fn);}};
  const Component=createViewport(React,()=>null);
  props.setZoom=value=>{props.zoom=value;};props.setFit=value=>{props.fit=value;};
  function render(patch={}){
    props={...props,...patch};index=0;layouts=[];effects=[];
    const node=Component(props);node.props.ref.current=el;
    const b=props.pattern.boards.find(b=>b.id===props.boardId)||props.pattern;
    svgWidth=props.fit?el.clientWidth-32:(b.width*32+64)*clampViewportZoom(props.zoom)/100;
    svgHeight=svgWidth*(b.height*32+64)/(b.width*32+64);
    // Browsers clamp scrolling immediately when layout shrinks.
    el.scrollLeft=left;el.scrollTop=top;
    layouts.forEach(fn=>fn());effects.forEach(fn=>cleanups.push(fn()));mounted=true;return node;
  }
  function event(type,values={}){
    const e={target:el,button:0,pointerType:'mouse',pointerId:1,clientX:201,clientY:151,deltaY:0,prevented:false,preventDefault(){this.prevented=true;},...values};
    listeners.get(type)?.fn(e);return e;
  }
  function scroll(x,y){el.scrollLeft=x;el.scrollTop=y;event('scroll');}
  const node=render();
  return {el,node,event,render,scroll,listeners,captured,removed,get props(){return props;},get stateUpdates(){return stateUpdates;},unmount(){cleanups.forEach(fn=>fn());}};
}

function point(v,x,y){
  const p=v.props,b=p.pattern.boards.find(b=>b.id===p.boardId)||p.pattern,r=v.el.querySelector('svg').getBoundingClientRect();
  return {clientX:r.left+(48+32*x)*r.width/(64+32*b.width),clientY:r.top+(48+32*y)*r.height/(64+32*b.height)};
}

function withFrames(fn){
  const request=globalThis.requestAnimationFrame,cancel=globalThis.cancelAnimationFrame,frames=new Map();let id=0;
  globalThis.requestAnimationFrame=callback=>{frames.set(++id,callback);return id;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
  try{fn({frames,flush(){const batch=[...frames.values()];frames.clear();batch.forEach(f=>f());}});}finally{
    if(request===undefined)delete globalThis.requestAnimationFrame;else globalThis.requestAnimationFrame=request;
    if(cancel===undefined)delete globalThis.cancelAnimationFrame;else globalThis.cancelAnimationFrame=cancel;
  }
}

test('live brush preview batches moves once per frame without committing or changing source',()=>withFrames(({frames,flush})=>{
  const calls=[],v=harness({mode:'edit',brushColorId:'C2',onStroke:a=>calls.push(a)}),before=JSON.stringify(pattern);
  v.event('pointerdown',point(v,0,0));v.event('pointermove',point(v,2,0));v.event('pointermove',point(v,4,0));
  assert.equal(frames.size,1);assert.equal(v.render().children[0].props.strokePreview,null);assert.deepEqual(calls,[]);
  const updates=v.stateUpdates;flush();assert.equal(v.stateUpdates,updates+1);
  assert.deepEqual(v.render().children[0].props.strokePreview,{indices:[0,1,2,3,4],colorId:'C2',erase:false});
  v.event('pointermove',point(v,4,0));assert.equal(frames.size,0);
  v.event('pointerup',point(v,4,0));assert.deepEqual(calls,[[0,1,2,3,4]]);assert.equal(v.render().children[0].props.strokePreview,null);
  assert.equal(JSON.stringify(pattern),before);assert.equal(frames.size,0);v.unmount();
}));
test('all cancellation paths remove live preview, pending frame and never commit',()=>withFrames(({frames,flush})=>{
  const cases=[v=>v.event('pointercancel'),v=>v.event('lostpointercapture'),v=>v.event('blur'),v=>v.render({disabled:true}),v=>v.render({mode:'view'}),v=>v.render({tool:'eraser'}),v=>v.render({brushColorId:'C2'})];
  for(const stop of cases){
    const calls=[],v=harness({mode:'edit',brushColorId:'C1',onStroke:a=>calls.push(a)});
    v.event('pointerdown',point(v,0,0));flush();assert.ok(v.render().children[0].props.strokePreview);
    v.event('pointermove',point(v,3,0));assert.equal(frames.size,1);stop(v);
    assert.equal(frames.size,0);assert.equal(v.render().children[0].props.strokePreview,null);
    v.event('pointerup',point(v,3,0));assert.deepEqual(calls,[]);v.unmount();
  }
  const v=harness({mode:'edit',brushColorId:'C1'});v.event('pointerdown',point(v,0,0));const updates=v.stateUpdates;
  v.unmount();assert.equal(frames.size,0);flush();assert.equal(v.stateUpdates,updates);
}));
test('eraser overlay replaces old color with an empty placeholder without changing original SVG nodes',()=>withFrames(({flush})=>{
  const v=harness({mode:'edit',tool:'eraser',brushColorId:'C2'});v.event('pointerdown',point(v,2,1));flush();
  const props=v.render().children[0].props,Preview=createPreview({createElement:h,useMemo:fn=>fn()});
  const svg=Preview(props),normal=Preview({...props,strokePreview:null}),overlay=svg.children.find(n=>n.props['data-stroke-preview']);
  assert.equal(overlay.props['data-stroke-preview'],'erase');assert.equal(overlay.props.pointerEvents,'none');
  assert.equal(overlay.children[0].props['data-draft-index'],22);
  assert.equal(overlay.children[0].children[0].props.fill,'#ffffff');assert.equal(overlay.children[0].children[1].type,'circle');
  assert.deepEqual(svg.children.filter(n=>n!==overlay),normal.children);v.unmount();
}));
test('paint overlay uses selected color and board-local coordinates while retaining scroll and vector sizing',()=>withFrames(({flush})=>{
  const p={...pattern,boards:[{id:'offset',x:10,y:10,width:10,height:10}]};
  const v=harness({pattern:p,boardId:'offset',zoom:200,mode:'edit',brushColorId:'C2'});v.scroll(100,80);
  v.event('pointerdown',point(v,2,1));flush();const props=v.render().children[0].props;
  const Preview=createPreview({createElement:h,useMemo:fn=>fn()}),svg=Preview(props),overlay=svg.children.find(n=>n.props['data-stroke-preview']),rect=overlay.children[0].children[0];
  assert.equal(overlay.props['data-stroke-preview'],'paint');assert.equal(rect.props.fill,'#ffffff');
  assert.equal(rect.props.x,96);assert.equal(rect.props.y,64);assert.equal(overlay.children[0].props['data-draft-index'],232);
  assert.equal(svg.props.width,768);assert.equal(v.el.scrollLeft,100);assert.equal(v.el.scrollTop,80);
  v.event('pointercancel');v.unmount();
}));

test('SVG coordinates map through scale, scroll and board offset without ignoring transparent cells',()=>{
  const p={...pattern,boards:[{id:'offset',x:10,y:10,width:10,height:10}],cells:pattern.cells.map(()=>null)};
  for(const scale of [.5,1,4]){
    const r={left:-40,top:70,width:384*scale,height:384*scale};
    assert.equal(viewportCellAt(p,'offset',r,r.left+48*scale,r.top+48*scale),210);
    assert.equal(viewportCellAt(p,'offset',r,r.left+336*scale,r.top+336*scale),399);
    for(const [x,y]of [[0,48],[31,48],[352,48],[48,352],[-1,48],[48,400]])assert.equal(viewportCellAt(p,'offset',r,r.left+x*scale,r.top+y*scale),null);
  }
  assert.equal(viewportCellAt(p,'',null,0,0),null);
});
test('Bresenham includes both endpoints in all directions and fills fast diagonal motion',()=>{
  assert.deepEqual(viewportLineIndices(0,63,20),[0,21,42,63]);
  assert.deepEqual(viewportLineIndices(63,0,20),[63,42,21,0]);
  assert.deepEqual(viewportLineIndices(0,4,20),[0,1,2,3,4]);
  assert.deepEqual(viewportLineIndices(0,60,20),[0,20,40,60]);
  assert.deepEqual(viewportLineIndices(5,5,20),[5]);
});
test('brush and eraser submit one deduplicated stroke only on pointerup',()=>{
  for(const tool of ['brush','eraser']){
    const calls=[],v=harness({mode:'edit',tool,onStroke:a=>calls.push(a)}),before=JSON.stringify(pattern);
    v.event('pointerdown',point(v,0,0));v.event('pointermove',point(v,3,3));v.event('pointermove',point(v,0,0));
    assert.deepEqual(calls,[]);assert.equal(v.captured.size,1);
    v.event('pointerup',point(v,0,0));assert.deepEqual(calls,[[0,21,42,63]]);assert.equal(v.captured.size,0);
    assert.equal(JSON.stringify(pattern),before);v.unmount();
  }
});
test('board editing at fit scale returns full-pattern indices including empty cells',()=>{
  const calls=[],p={...pattern,boards:[{id:'offset',x:10,y:10,width:10,height:10}],cells:pattern.cells.map(()=>null)};
  const v=harness({pattern:p,boardId:'offset',fit:true,mode:'edit',onStroke:a=>calls.push(a)});
  v.event('pointerdown',point(v,0,0));v.event('pointerup',point(v,2,0));assert.deepEqual(calls,[[210,211,212]]);v.unmount();
});
test('margin starts do not paint; outside gaps are not interpolated across on reentry',()=>{
  const calls=[],v=harness({mode:'edit',onStroke:a=>calls.push(a)});
  v.event('pointerdown',{clientX:118,clientY:68});v.event('pointerup',point(v,0,0));assert.deepEqual(calls,[]);
  v.event('pointerdown',point(v,0,0));v.event('pointermove',{clientX:-10,clientY:-10});v.event('pointermove',point(v,4,0));v.event('pointerup',point(v,4,0));
  assert.deepEqual(calls,[[0,4]]);v.unmount();
});
test('picker samples on down only; hover reports cell indices and clears on leave',()=>{
  for(const tool of ['pick','picker']){
    const picks=[],hover=[],strokes=[],v=harness({mode:'edit',tool,onPick:i=>picks.push(i),onHover:i=>hover.push(i),onStroke:a=>strokes.push(a)});
    v.event('pointermove',point(v,2,3));v.event('pointermove',point(v,2,3));assert.deepEqual(hover,[62]);
    v.event('pointerdown',point(v,2,3));v.event('pointerup',point(v,2,3));assert.deepEqual(picks,[62]);assert.deepEqual(strokes,[]);
    v.event('pointerleave');assert.deepEqual(hover,[62,null]);v.unmount();
  }
});
test('edit mode middle drag and Space plus left drag pan instead of painting',()=>{
  for(const useSpace of [false,true]){
    const calls=[],v=harness({mode:'edit',onStroke:a=>calls.push(a)});v.scroll(100,80);
    if(useSpace)v.event('keydown',{code:'Space'});
    v.event('pointerdown',{button:useSpace?0:1});v.event('pointermove',{clientX:171,clientY:131});v.event('pointerup');
    assert.equal(v.el.scrollLeft,130);assert.equal(v.el.scrollTop,100);assert.deepEqual(calls,[]);v.unmount();
  }
});
test('cancel, lost capture, blur, disable, mode/tool change and unmount discard unfinished strokes',()=>{
  const cases=[v=>v.event('pointercancel'),v=>v.event('lostpointercapture'),v=>v.event('blur'),v=>v.render({disabled:true}),v=>v.render({mode:'view'}),v=>v.render({tool:'eraser'}),v=>v.render({pattern:{...pattern}}),v=>v.unmount()];
  for(const stop of cases){
    const calls=[],v=harness({mode:'edit',onStroke:a=>calls.push(a)});v.event('pointerdown',point(v,0,0));v.event('pointermove',point(v,2,2));
    stop(v);v.event('pointerup',point(v,2,2));assert.deepEqual(calls,[]);assert.equal(v.captured.size,0);
    if(v.listeners.size)v.unmount();
  }
});
test('history shortcuts affect focused viewport only and disabled input stays native',()=>{
  let undo=0,redo=0;const v=harness({mode:'edit',onUndo:()=>undo++,onRedo:()=>redo++});
  assert.equal(v.event('keydown',{code:'KeyZ',ctrlKey:true,target:{}}).prevented,false);
  assert.equal(v.event('keydown',{code:'KeyZ',ctrlKey:true}).prevented,true);
  assert.equal(v.event('keydown',{key:'z',metaKey:true,shiftKey:true}).prevented,true);
  assert.equal(undo,1);assert.equal(redo,1);v.render({disabled:true});
  assert.equal(v.event('keydown',{code:'KeyZ',ctrlKey:true}).prevented,false);
  assert.equal(v.event('pointerdown',point(v,0,0)).prevented,false);
  assert.equal(v.event('wheel',{deltaY:-10,ctrlKey:true}).prevented,false);
  assert.equal(undo,1);assert.equal(v.captured.size,0);v.unmount();
});

test('zoom bounds are integer, finite and inclusive',()=>{
  assert.deepEqual([-200,49,50,50.6,399.9,800,NaN,Infinity].map(clampViewportZoom),[50,50,50,51,400,400,100,100]);
});
test('anchor geometry retains the SVG point, accounts for padding and clamps edges',()=>{
  const next=viewportAnchorScroll(200,120,16,16,1000,2000,3000);
  assert.equal(next,504);assert.equal((200+120-16)/1000,(next+120-16)/2000);
  assert.equal(viewportAnchorScroll(0,10,16,16,1000,100,0),0);
  assert.equal(viewportAnchorScroll(1000,120,16,16,1000,2000,600),600);
  assert.equal(viewportAnchorScroll(20,10,0,0,0,100,100),0);
});
test('viewport interface forwards exact preview props and provides keyboard focus',()=>{
  const v=harness({highlight:'C1'});
  assert.equal(v.node.props.className,'bs-preview');assert.equal(v.node.props.tabIndex,0);
  assert.equal(v.node.props['aria-label'],'viewportAria');assert.equal(v.node.props.title,'viewportHint');
  assert.equal(v.node.children[0].props.highlight,'C1');assert.equal(v.node.children[0].props.pattern,pattern);
  v.unmount();
});
test('ordinary wheel remains native; Ctrl/Meta zoom is viewport-local and nonpassive',()=>{
  const v=harness();assert.deepEqual(v.listeners.get('wheel').options,{passive:false});
  assert.equal(v.event('wheel',{deltaY:-100}).prevented,false);assert.equal(v.props.zoom,100);
  v.scroll(100,80);
  assert.equal(v.event('wheel',{deltaY:-100,ctrlKey:true}).prevented,true);assert.equal(v.props.zoom,110);
  v.render();assert.ok(Math.abs(v.el.scrollLeft-118.4)<1e-9);assert.ok(Math.abs(v.el.scrollTop-96.4)<1e-9);
  v.event('wheel',{deltaY:100,metaKey:true});v.render();assert.equal(v.props.zoom,100);
  assert.ok(Math.abs(v.el.scrollLeft-100)<1e-9);v.unmount();
});
test('rapid wheel events accumulate before React commits',()=>{
  const v=harness();v.event('wheel',{deltaY:-1,ctrlKey:true});v.event('wheel',{deltaY:-1,ctrlKey:true});
  assert.equal(v.props.zoom,121);v.render();v.unmount();
});
test('opposite batched wheel events do not leave a stale pointer anchor',()=>{
  const v=harness();v.event('wheel',{deltaY:-1,ctrlKey:true});v.event('wheel',{deltaY:1,ctrlKey:true});
  assert.equal(v.props.zoom,100);v.scroll(100,80);v.render({zoom:200});
  assert.equal(v.el.scrollLeft,344);assert.equal(v.el.scrollTop,264);v.unmount();
});
test('toolbar zoom anchors to viewport center, including layout shrink clamping',()=>{
  const v=harness({zoom:200});v.scroll(900,900);v.render({zoom:100});
  assert.equal(v.el.scrollLeft,viewportAnchorScroll(900,160,16,16,1408,704,416));
  assert.equal(v.el.scrollTop,viewportAnchorScroll(900,120,16,16,1408,704,496));v.unmount();
});
test('fit wheel uses actual SVG width, not stale toolbar zoom',()=>{
  const v=harness({fit:true,zoom:400});v.event('wheel',{deltaY:-1,ctrlKey:true});
  assert.equal(v.props.fit,false);assert.equal(v.props.zoom,50);v.render();assert.equal(v.node.props.className,'bs-preview');v.unmount();
});
test('fit/manual switches preserve center where scroll bounds permit',()=>{
  const v=harness();v.scroll(100,80);v.render({fit:true});assert.equal(v.el.scrollLeft,0);
  v.render({fit:false});assert.equal(v.el.scrollLeft,viewportAnchorScroll(0,160,16,16,288,704,416));v.unmount();
});
test('only dimensions, board and reset reset scroll; content and display changes preserve it',()=>{
  const v=harness();v.scroll(100,80);v.render({highlight:'C1',labels:false,grid:false});assert.equal(v.el.scrollLeft,100);
  v.render({resetKey:1});assert.equal(v.el.scrollLeft,0);assert.equal(v.el.scrollTop,0);
  v.scroll(100,80);v.render({boardId:'B1'});assert.equal(v.el.scrollLeft,0);
  v.scroll(30,40);v.render({pattern:{...pattern,cells:pattern.cells.map(()=>null)}});assert.equal(v.el.scrollTop,40);assert.equal(v.el.scrollLeft,30);
  v.render({pattern:{...pattern,width:21}});assert.equal(v.el.scrollTop,0);assert.equal(v.el.scrollLeft,0);v.unmount();
});
test('left and middle drag capture, pan, and release on pointerup/cancel/lost capture',()=>{
  for(const [button,end]of [[0,'pointerup'],[1,'pointercancel'],[0,'lostpointercapture']]){
    const v=harness();v.scroll(100,80);assert.equal(v.event('pointerdown',{button}).prevented,true);
    assert.equal(v.el.focused,true);assert.ok(v.captured.has(1));
    v.event('pointermove',{clientX:171,clientY:131});assert.equal(v.el.scrollLeft,130);assert.equal(v.el.scrollTop,100);
    v.event(end);assert.equal(v.captured.size,0);v.event('pointermove',{clientX:1});assert.equal(v.el.scrollLeft,130);v.unmount();
  }
});
test('Space only handles focused container; blur clears drag; touch/right-click remain native',()=>{
  const v=harness();assert.equal(v.event('keydown',{code:'Space',target:{}}).prevented,false);
  assert.equal(v.event('keydown',{code:'Space'}).prevented,true);
  assert.equal(v.event('keyup',{code:'Space'}).prevented,true);
  assert.equal(v.event('pointerdown',{button:2}).prevented,false);
  assert.equal(v.event('pointerdown',{pointerType:'touch'}).prevented,false);
  v.event('pointerdown');v.event('blur');assert.equal(v.captured.size,0);v.unmount();
});
test('unmount removes every listener, disconnects observer and releases pointer capture',()=>{
  const saved=globalThis.ResizeObserver;let disconnected=0,observed=0;
  globalThis.ResizeObserver=class{observe(){observed++;}disconnect(){disconnected++;}};
  try{const v=harness();v.event('pointerdown');const count=v.listeners.size;v.unmount();assert.equal(v.listeners.size,0);assert.equal(v.removed.length,count);assert.equal(v.captured.size,0);assert.equal(observed,1);assert.equal(disconnected,1);}
  finally{if(saved===undefined)delete globalThis.ResizeObserver;else globalThis.ResizeObserver=saved;}
});
test('highlight dims other cells without removing vectors, coordinates or mutating pattern',()=>{
  const React={createElement:h,useMemo:fn=>fn()},Preview=createPreview(React),before=JSON.stringify(pattern);
  const normal=Preview({pattern,boardId:'',labels:true,grid:true,zoom:100,t});
  const highlighted=Preview({pattern,boardId:'',labels:true,grid:true,zoom:100,highlight:'C1',t});
  assert.equal(normal.children.length,highlighted.children.length);assert.equal(highlighted.props.viewBox,normal.props.viewBox);
  const cells=highlighted.children.filter(n=>n.type==='g');assert.equal(cells.length,400);
  assert.ok(cells.filter(n=>n.props['data-color-id']==='C1').every(n=>n.props.opacity===1));
  assert.ok(cells.filter(n=>n.props['data-color-id']==='C2').every(n=>n.props.opacity===.18));
  assert.equal(highlighted.children.filter(n=>n.type==='text').length,40);assert.equal(JSON.stringify(pattern),before);
  const clear=Preview({pattern,boardId:'',labels:true,grid:true,zoom:100,highlight:'',t});assert.deepEqual(clear,normal);
});
