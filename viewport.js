// No document/window input listeners: gestures belong only to this viewport.
export function clampViewportZoom(value) {
  return Math.max(50,Math.min(400,Math.round(Number.isFinite(value)?value:100)));
}

// Keep the same SVG point under a viewport-local anchor, including SVG padding.
export function viewportAnchorScroll(scroll,anchor,oldOrigin,newOrigin,oldSize,newSize,maxScroll) {
  const value=oldSize>0?(scroll+anchor-oldOrigin)*newSize/oldSize+newOrigin-anchor:0;
  return Math.max(0,Math.min(Math.max(0,maxScroll),value));
}

// SVG uses a 32-unit margin and 32-unit cells at every rendered scale.
export function viewportCellAt(pattern,boardId,rect,clientX,clientY) {
  if(!pattern||!rect||!(rect.width>0&&rect.height>0))return null;
  const b=pattern.boards.find(b=>b.id===boardId)||{x:0,y:0,width:pattern.width,height:pattern.height};
  const x=Math.floor(((clientX-rect.left)*(b.width*32+64)/rect.width-32)/32);
  const y=Math.floor(((clientY-rect.top)*(b.height*32+64)/rect.height-32)/32);
  return Number.isFinite(x)&&Number.isFinite(y)&&x>=0&&y>=0&&x<b.width&&y<b.height?(b.y+y)*pattern.width+b.x+x:null;
}

export function viewportLineIndices(from,to,width) {
  let x=from%width,y=Math.floor(from/width);const tx=to%width,ty=Math.floor(to/width),dx=Math.abs(tx-x),dy=-Math.abs(ty-y),sx=x<tx?1:-1,sy=y<ty?1:-1;
  let error=dx+dy;const result=[];
  for(;;){result.push(y*width+x);if(x===tx&&y===ty)break;const twice=2*error;if(twice>=dy){error+=dy;x+=sx;}if(twice<=dx){error+=dx;y+=sy;}}
  return result;
}

export function createViewport(React,Preview) {
  const h=React.createElement;
  return function Viewport({pattern,boardId,labels,grid,fit,zoom,highlight='',t,setZoom,setFit,resetKey,mode='view',tool='brush',brushColorId='',disabled=false,onStroke,onPick,onHover,onUndo,onRedo}) {
    const ref=React.useRef(null),latest=React.useRef(null),previous=React.useRef(null),pending=React.useRef(null),cancelDrag=React.useRef(()=>{});
    const [strokePreview,setStrokePreview]=React.useState(null);
    latest.current={pattern,boardId,fit,zoom,setZoom,setFit,resetKey,mode,tool,brushColorId,disabled,onStroke,onPick,onHover,onUndo,onRedo};
    function measure(el) {
      const svg=el.querySelector('svg');if(!svg)return null;
      const r=svg.getBoundingClientRect(),box=el.getBoundingClientRect();
      return {width:r.width,height:r.height,x:r.left-box.left-el.clientLeft+el.scrollLeft,y:r.top-box.top-el.clientTop+el.scrollTop};
    }
    function reconcile() {
      const el=ref.current;if(!el)return;
      const p=latest.current,old=previous.current;
      if(old&&(old.mode!==p.mode||old.tool!==p.tool||old.brushColorId!==p.brushColorId||old.disabled!==p.disabled||old.pattern!==p.pattern))cancelDrag.current();
      const current=measure(el);if(!current){cancelDrag.current();previous.current=null;return;}
      if(!old||old.patternWidth!==p.pattern?.width||old.patternHeight!==p.pattern?.height||old.boardId!==p.boardId||old.resetKey!==p.resetKey){
        cancelDrag.current();pending.current=null;el.scrollLeft=0;el.scrollTop=0;
      }else if(old.width!==current.width||old.height!==current.height||old.fit!==p.fit||old.zoom!==p.zoom){
        cancelDrag.current();
        const anchor=pending.current||{x:el.clientWidth/2,y:el.clientHeight/2,left:old.left,top:old.top,geometry:old};
        const g=anchor.geometry;
        el.scrollLeft=viewportAnchorScroll(anchor.left,anchor.x,g.x,current.x,g.width,current.width,el.scrollWidth-el.clientWidth);
        el.scrollTop=viewportAnchorScroll(anchor.top,anchor.y,g.y,current.y,g.height,current.height,el.scrollHeight-el.clientHeight);
        pending.current=null;
      }
      previous.current={...current,left:el.scrollLeft,top:el.scrollTop,pattern:p.pattern,patternWidth:p.pattern?.width,patternHeight:p.pattern?.height,boardId:p.boardId,resetKey:p.resetKey,fit:p.fit,zoom:p.zoom,mode:p.mode,tool:p.tool,brushColorId:p.brushColorId,disabled:p.disabled};
    }
    React.useLayoutEffect(reconcile);
    React.useEffect(()=>{
      const el=ref.current;if(!el)return;
      let drag=null,space=false,hover=null,frame=null,alive=true;
      const requestFrame=typeof requestAnimationFrame==='function'?requestAnimationFrame:fn=>setTimeout(fn,16);
      const cancelFrame=typeof cancelAnimationFrame==='function'?cancelAnimationFrame:clearTimeout;
      const preview=()=>{
        if(frame!==null)return;
        frame=requestFrame(()=>{
          frame=null;if(!alive||drag?.kind!=='stroke')return;
          const p=latest.current;
          setStrokePreview({indices:[...drag.indices],colorId:p.brushColorId,erase:p.tool==='eraser'});
        });
      };
      const cursor=()=>{const p=latest.current;el.style.cursor=p.disabled?'default':drag?.kind==='pan'?'grabbing':p.mode==='view'||space?'grab':'crosshair';};
      const setHover=index=>{if(hover!==index){hover=index;latest.current.onHover?.(index);}};
      const cell=e=>{const p=latest.current;return viewportCellAt(p.pattern,p.boardId,el.querySelector('svg')?.getBoundingClientRect(),e.clientX,e.clientY);};
      const append=index=>{
        if(!drag||drag.kind!=='stroke')return;
        if(index===null){drag.last=null;return;}
        const size=drag.indices.size;
        for(const i of drag.last===null?[index]:viewportLineIndices(drag.last,index,latest.current.pattern.width))drag.indices.add(i);
        drag.last=index;if(size!==drag.indices.size)preview();
      };
      const scroll=()=>{
        const old=previous.current,g=measure(el);
        if(old&&g&&old.width===g.width&&old.height===g.height){old.left=el.scrollLeft;old.top=el.scrollTop;}
      };
      const finish=()=>{
        if(frame!==null){cancelFrame(frame);frame=null;}
        if(alive)setStrokePreview(null);
        const id=drag?.id;drag=null;
        if(id!==undefined&&el.hasPointerCapture?.(id))el.releasePointerCapture(id);
        cursor();
      };
      const cancel=()=>{space=false;finish();setHover(null);};
      cancelDrag.current=cancel;
      const down=e=>{
        const p=latest.current;
        if(p.disabled||!p.pattern||e.pointerType==='touch'||drag||!(e.button===0||e.button===1))return;
        e.preventDefault();el.focus({preventScroll:true});
        if(p.mode==='view'||e.button===1||space){
          drag={kind:'pan',id:e.pointerId,x:e.clientX,y:e.clientY,left:el.scrollLeft,top:el.scrollTop};
        }else{
          const index=cell(e);setHover(index);if(index===null)return;
          if(p.tool==='pick'||p.tool==='picker'){p.onPick?.(index);return;}
          drag={kind:'stroke',id:e.pointerId,indices:new Set(),last:null};append(index);
        }
        el.setPointerCapture(e.pointerId);cursor();
      };
      const move=e=>{
        if(latest.current.disabled)return;
        if(drag&&drag.id!==e.pointerId)return;
        const index=cell(e);setHover(index);
        if(!drag)return;e.preventDefault();
        if(drag.kind==='stroke'){append(index);return;}
        el.scrollLeft=drag.left+drag.x-e.clientX;el.scrollTop=drag.top+drag.y-e.clientY;scroll();
      };
      const up=e=>{
        if(drag?.id!==e.pointerId)return;
        if(drag.kind==='stroke')append(cell(e));
        const indices=drag.kind==='stroke'?[...drag.indices]:null;finish();
        if(indices?.length&&!latest.current.disabled)latest.current.onStroke?.(indices);
      };
      const abort=e=>{if(drag?.id===e.pointerId)cancel();};
      const leave=()=>{setHover(null);if(drag?.kind==='stroke')drag.last=null;};
      const keydown=e=>{
        const p=latest.current;if(e.target!==el||p.disabled)return;
        if((e.ctrlKey||e.metaKey)&&!e.altKey&&(e.code==='KeyZ'||e.key?.toLowerCase()==='z')){
          e.preventDefault();cancel();(e.shiftKey?p.onRedo:p.onUndo)?.();return;
        }
        if(e.code!=='Space')return;e.preventDefault();space=true;cursor();
      };
      const keyup=e=>{if(e.code!=='Space'||!space)return;e.preventDefault();space=false;cursor();};
      const blur=cancel;
      const wheel=e=>{
        if(latest.current.disabled||!(e.ctrlKey||e.metaKey)||!e.deltaY)return;
        const p=latest.current,g=measure(el);if(!g||!p.pattern)return;
        e.preventDefault();finish();
        const b=p.pattern.boards.find(b=>b.id===p.boardId)||p.pattern;
        const actualZoom=g.width/(b.width*32+64)*100;
        const base=pending.current?.targetZoom??(p.fit?actualZoom:clampViewportZoom(p.zoom));
        const next=clampViewportZoom(base*(e.deltaY<0?1.1:1/1.1));
        if(!p.fit&&next===clampViewportZoom(p.zoom)){
          if(pending.current){pending.current=null;p.setZoom(next);}
          return;
        }
        const box=el.getBoundingClientRect();
        pending.current={x:e.clientX-box.left-el.clientLeft,y:e.clientY-box.top-el.clientTop,left:el.scrollLeft,top:el.scrollTop,geometry:g,targetZoom:next};
        p.setFit(false);p.setZoom(next);
      };
      const aux=e=>{if(!latest.current.disabled&&e.button===1)e.preventDefault();};
      const listeners={scroll,pointerdown:down,pointermove:move,pointerup:up,pointercancel:abort,lostpointercapture:abort,pointerleave:leave,keydown,keyup,blur,wheel,auxclick:aux};
      for(const [type,fn]of Object.entries(listeners))el.addEventListener(type,fn,type==='wheel'?{passive:false}:false);
      const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(reconcile);observer?.observe(el);
      return()=>{
        for(const [type,fn]of Object.entries(listeners))el.removeEventListener(type,fn,false);
        observer?.disconnect();alive=false;cancel();cancelDrag.current=()=>{};pending.current=null;previous.current=null;
      };
    },[]);
    return h('div',{ref,className:'bs-preview',tabIndex:0,role:'region','aria-disabled':disabled||undefined,'aria-label':t('viewportAria'),title:t(mode==='view'?'viewportHint':'viewportEditHint'),style:{overflow:'auto',userSelect:'none',cursor:disabled?'default':mode==='view'?'grab':'crosshair',overscrollBehavior:'contain',overflowAnchor:'none'}},
      pattern?h(Preview,{pattern,boardId,labels,grid,fit,zoom:clampViewportZoom(zoom),highlight,t,strokePreview}):null);
  };
}
