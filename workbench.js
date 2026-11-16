function createWorkbench(React,{core,projects,Viewport,Source,AiPanel,Icon,css,t,ctx}) {
  const h=React.createElement,{useState,useRef,useEffect,useMemo,useSyncExternalStore}=React;
  let recoveryDraft=null,closing=Promise.resolve();
  const api=async body=>{const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),15000);try{const response=await fetch('/api/local-bead-studio/library',{method:'POST',headers:{'Content-Type':'application/json','X-DSH-Bead-Studio':'1'},body:JSON.stringify(body),signal:ac.signal});const row=await response.json();if(!response.ok){const e=new Error(row.error||'Project request failed.');e.code=row.code;throw e;}return row;}finally{clearTimeout(timer);}};
  function Thumbnail({thumbnail}){const ref=useRef(null);useEffect(()=>{if(!ref.current||!thumbnail)return;const c=ref.current;c.width=thumbnail.width;c.height=thumbnail.height;const g=c.getContext('2d');g.fillStyle='#eeeeee';g.fillRect(0,0,c.width,c.height);thumbnail.pixels.forEach((color,i)=>{if(color){g.fillStyle=color;g.fillRect(i%c.width,Math.floor(i/c.width),1,1);}});},[thumbnail]);return h('canvas',{ref,className:'bs-thumb','aria-label':t('thumbnail')});}
  return function Workbench(){
    useSyncExternalStore(fn=>ctx.locale.subscribe(fn),()=>ctx.locale.getSnapshot());
    const [mode,setMode]=useState('view'),[tool,setTool]=useState('brush'),[brush,setBrush]=useState(''),[hover,setHover]=useState(null),[fromId,setFromId]=useState(''),[toId,setToId]=useState(''),[mergePreview,setMergePreview]=useState(false),[pendingAction,setPendingAction]=useState(null);
    const [activeId,setActiveId]=useState(null),[libraryOpen,setLibraryOpen]=useState(false),[items,setItems]=useState([]),[libraryTotal,setLibraryTotal]=useState(0),[search,setSearch]=useState(''),[trash,setTrash]=useState(false),[offset,setOffset]=useState(0),[libraryConfirm,setLibraryConfirm]=useState(null),[focusCanvas,setFocusCanvas]=useState(false),[showParams,setShowParams]=useState(true),[showPalette,setShowPalette]=useState(true);
    const listEpoch=useRef(0);
    const history=useRef(editor.createHistory(50)),editPending=useRef(false);
    const [keepImageSize,setKeepImageSize]=useState(false),[sourceName,setSourceName]=useState('');
    const [source,setSource]=useState(null),[sourceId,setSourceId]=useState(0),[name,setName]=useState('');
    const [params,setParams]=useState({width:48,maxColors:16,boardSize:29,background:'transparent',crop:'original'});
    const [pattern,setPattern]=useState(null),[resultKey,setResultKey]=useState('');
    const [boardId,setBoardId]=useState(''),[labels,setLabels]=useState(true),[grid,setGrid]=useState(true),[fit,setFit]=useState(false),[zoom,setZoom]=useState(100),[highlight,setHighlight]=useState(''),[resetKey,setResetKey]=useState(0);
    const [busy,setBusy]=useState(false),[ready,setReady]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
    const [saveState,setSaveState]=useState({state:'loading'}),[exporting,setExporting]=useState(false),[prepared,setPrepared]=useState(null),[downloadState,setDownloadState]=useState(''),[reloadConfirm,setReloadConfirm]=useState(false),[recovery,setRecovery]=useState(null);
    const alive=useRef(true),queue=useRef(null),fileRef=useRef(null),jsonRef=useRef(null),controller=useRef(null),loadTicket=useRef(0),exportTicket=useRef(0),preparedRef=useRef(null),restoreTicket=useRef(0),currentProject=useRef(null),shownId=useRef(null);
    const key=JSON.stringify([sourceId,params]),dirty=!!pattern&&!!source&&resultKey!==key;
    const locked=busy||exporting||!ready;
    const view=useMemo(()=>({boardId,labels,grid,fit,zoom,highlight}),[boardId,labels,grid,fit,zoom,highlight]);
    const project=useMemo(()=>pattern?{format:'dsh-bead-project',version:1,name:name||t('untitled'),pattern,view,updatedAt:null}:null,[pattern,name,view]);
    currentProject.current=project;shownId.current=activeId;
    function adopt(p){
      history.current.clear();setMode('view');setHover(null);setMergePreview(false);setBrush(p.pattern.palette[0]?.id||'');
      controller.current?.abort();loadTicket.current++;exportTicket.current++;
      setSource(null);setSourceId(x=>x+1);setName(p.name);setPattern(p.pattern);
      setParams({width:p.pattern.width,maxColors:p.pattern.maxColors,boardSize:p.pattern.boardSize,background:p.pattern.background,crop:'original'});
      setBoardId(p.view.boardId);setLabels(p.view.labels);setGrid(p.view.grid);setFit(p.view.fit);setZoom(p.view.zoom);setHighlight(p.view.highlight);setResetKey(x=>x+1);setResultKey('');setBusy(false);
    }
    async function openSaved(discard=false){
      const manager=queue.current,ticket=++restoreTicket.current;
      setReady(false);setError('');
      try{await closing;const row=await manager.open(undefined,{discard});if(!alive.current||queue.current!==manager||ticket!==restoreTicket.current)return;setActiveId(row.id);if(row.project){adopt(row.project);setNotice(t('restored'));}else{setPattern(null);setName('');}setRecovery(recoveryDraft);setReady(true);}
      catch(e){if(alive.current&&queue.current===manager&&ticket===restoreTicket.current){setError(e.message);setSaveState({state:'error',message:e.message});if(currentProject.current)setReady(true);}}
    }
    useEffect(()=>{
      alive.current=true;
      const manager=createLibrarySession({request:api,onState:s=>{if(alive.current)setSaveState(s);}});
      queue.current=manager;openSaved();
      const warn=e=>{if(manager.dirty){e.preventDefault();e.returnValue='';}};
      window.addEventListener('beforeunload',warn);
      return()=>{alive.current=false;restoreTicket.current++;loadTicket.current++;exportTicket.current++;controller.current?.abort();window.removeEventListener('beforeunload',warn);
        const candidate=currentProject.current,owned=manager.id===shownId.current;if(candidate){if(owned)manager.schedule(candidate);recoveryDraft={project:candidate,message:t('recoveryHint')};}
        closing=manager.close().then(()=>{if(owned&&!manager.dirty&&recoveryDraft?.project===candidate)recoveryDraft=null;}).catch(e=>{if(candidate)recoveryDraft={project:candidate,message:e.message};});
        if(preparedRef.current)URL.revokeObjectURL(preparedRef.current.url);};
    },[]);
    useEffect(()=>{if(ready&&project&&!busy&&activeId===queue.current.id)queue.current.schedule(project);},[ready,project,busy,activeId]);
    useEffect(()=>{exportTicket.current++;if(preparedRef.current){URL.revokeObjectURL(preparedRef.current.url);preparedRef.current=null;}setPrepared(null);setDownloadState('');},[pattern,name,view]);
    const height=source?Math.max(1,Math.min(128,Math.round(Number(params.width)*(params.crop==='square'?1:source.height/source.width)))):pattern?.height||48;
    const setParam=(k,v)=>setParams(p=>({...p,[k]:v}));
    async function loadFile(file){
      if(!file||locked)return;const ticket=++loadTicket.current;setBusy(true);setError('');
      try{
        if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>12*1024*1024)throw new Error(t('fileError'));
        const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});let image;
        try{if(bitmap.width*bitmap.height>20000000)throw new Error(t('pixelError'));const c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;c.getContext('2d').drawImage(bitmap,0,0);image=c.getContext('2d').getImageData(0,0,c.width,c.height);}finally{bitmap.close();}
        if(!alive.current||ticket!==loadTicket.current)return;
        setSource(image);setSourceName(file.name.slice(0,120));setParams(p=>imageSizing(image,p,keepImageSize));setSourceId(x=>x+1);if(!pattern)setName(file.name.slice(0,120));setNotice(t('previousRetained'));
      }catch(e){if(alive.current&&ticket===loadTicket.current)setError(e.message);}finally{if(alive.current&&ticket===loadTicket.current)setBusy(false);}
    }
    async function importFile(file){
      if(!file||locked)return;const ticket=++loadTicket.current;setBusy(true);setError('');
      try{if(file.size>1024*1024)throw new Error(t('projectTooLarge'));const p=projects.parseProject(await file.text());if(!alive.current||ticket!==loadTicket.current)return;if(await libraryAction('import',p))setNotice(t('imported'));}
      catch(e){if(alive.current&&ticket===loadTicket.current)setError(e.message);}finally{if(alive.current)setBusy(false);}
    }
    async function run(image=source,p=params,snapshot=key,approved=false,afterGenerate=null){
      if(pattern&&!approved)return guardReplace(()=>run(image,p,snapshot,true));
      if(!image||!Number.isInteger(p.width)||p.width<8||p.width>128)return;
      setBusy(true);setError('');controller.current?.abort();const ac=new AbortController(),manager=queue.current,generationTicket=++loadTicket.current;controller.current=ac;
      try{
        let input=image;
        if(p.crop==='square'){const side=Math.min(image.width,image.height),ox=Math.floor((image.width-side)/2),oy=Math.floor((image.height-side)/2),data=new Uint8ClampedArray(side*side*4);for(let y=0;y<side;y++)data.set(image.data.subarray(((oy+y)*image.width+ox)*4,((oy+y)*image.width+ox+side)*4),y*side*4);input={width:side,height:side,data};}
        const targetH=Math.max(1,Math.min(128,Math.round(p.width*input.height/input.width))),sampled=core.sampleImage(input,p.width,targetH);
        const response=await fetch('/api/local-bead-studio/generate',{method:'POST',headers:{'Content-Type':'application/json','X-DSH-Bead-Studio':'1'},body:JSON.stringify({width:p.width,height:targetH,rgba:Array.from(sampled.data),maxColors:p.maxColors,boardSize:p.boardSize,background:p.background}),signal:ac.signal});
        const data=await response.json();if(!response.ok)throw new Error(data.error||t('generateError'));
        const canonical=projects.normalizeProject(data.pattern).pattern;
        if(!alive.current||ac.signal.aborted||queue.current!==manager||generationTicket!==loadTicket.current)return;
        const created=await manager.create({format:'dsh-bead-project',version:1,name:name||t('untitled'),pattern:canonical,view:{boardId:'',labels,grid,fit,zoom,highlight:''},updatedAt:null});
        if(!alive.current||ac.signal.aborted||queue.current!==manager||generationTicket!==loadTicket.current)return;setActiveId(created.id);
        if(alive.current&&!ac.signal.aborted){history.current.clear();setMode('view');setMergePreview(false);setHover(null);setBrush(canonical.palette[0]?.id||'');setPattern(canonical);setResultKey(snapshot);setBoardId('');setHighlight('');setResetKey(x=>x+1);setNotice(t('generated'));afterGenerate?.();}
      }catch(e){if(alive.current&&!ac.signal.aborted)setError(e.message);}finally{if(alive.current&&controller.current===ac)setBusy(false);}
    }
    function demo(approved=false){if(pattern&&approved!==true)return guardReplace(()=>demo(true));const image=core.demoImage(),id=sourceId+1,p={...params,width:image.width,maxColors:12,background:'transparent',crop:'original'};run(image,p,JSON.stringify([id,p]),true,()=>{setSource(image);setSourceName(t('demoName'));setSourceId(id);setName(t('demoName'));setParams(p);});}
    async function prepare(kind){
      if(!pattern||locked)return;const ticket=++exportTicket.current;setExporting(true);setError('');setDownloadState('preparing');
      try{const result=await prepareExport(core,kind,{pattern,view,name,project:projects.normalizeProject(project)});if(!alive.current||ticket!==exportTicket.current)return;
        if(preparedRef.current)URL.revokeObjectURL(preparedRef.current.url);
        const file={...result,url:URL.createObjectURL(result.blob)};preparedRef.current=file;setPrepared(file);setDownloadState('ready');
      }catch(e){if(alive.current){setDownloadState('error');setError(e.message);}}finally{if(alive.current)setExporting(false);}
    }
    async function saveAs(){
      if(!prepared||typeof window.showSaveFilePicker!=='function')return;
      try{const handle=await window.showSaveFilePicker({suggestedName:prepared.filename});setDownloadState('saving');const stream=await handle.createWritable();try{await stream.write(prepared.blob);await stream.close();}catch(e){try{await stream.abort();}catch{}throw e;}if(alive.current)setDownloadState('saved');}
      catch(e){if(alive.current){setDownloadState(e.name==='AbortError'?'cancelled':'error');if(e.name!=='AbortError')setError(e.message);}}
    }
    async function refreshLibrary(){const ticket=++listEpoch.current;try{const result=await api({action:'list',query:search,trash,offset,limit:12});if(alive.current&&ticket===listEpoch.current){setItems(result.items);setLibraryTotal(result.total);}}catch(e){if(alive.current&&ticket===listEpoch.current)setError(e.message);}}
    useEffect(()=>{if(!ready)return;const timer=setTimeout(refreshLibrary,200);return()=>clearTimeout(timer);},[ready,search,trash,offset,saveState.state,activeId]);
    async function libraryAction(action,item){
      const manager=queue.current;
      if(editPending.current||exporting||!ready)return;setBusy(true);setError('');
      try{
        if(currentProject.current&&shownId.current===manager.id)manager.schedule(currentProject.current);
        let row;
        if(action==='open')row=await manager.open(item.id);
        else if(action==='new')row=await manager.create(undefined,t('untitled'));
        else if(action==='copy')row=await manager.duplicate();
        else if(action==='import'||action==='recover')row=await manager.create(item);
        else {await manager.mutate(action,item,action==='purge'?{confirm:'DELETE'}:{});if(!manager.id){setActiveId(null);setPattern(null);setSource(null);setName('');history.current.clear();}}
        if(!alive.current)return;
        if(row){adopt(row.project);setActiveId(row.id);setLibraryOpen(false);setPendingAction(null);}
        if(action==='recover'){setRecovery(null);recoveryDraft=null;}
        setLibraryConfirm(null);await refreshLibrary();return true;
      }catch(e){if(alive.current)setError(e.message);}finally{if(alive.current)setBusy(false);}
    }
    function adoptAiImage(image){if(locked||editPending.current)return;controller.current?.abort();loadTicket.current++;setSource(image);setSourceName(t('aiSourceName'));setSourceId(v=>v+1);setParams(p=>({...p,crop:'original'}));setNotice(t('aiSourceReady'));}
    function guardReplace(fn){if(pattern)setPendingAction(()=>fn);else fn();}
    function applyLocal(next){setPattern(next);if(!next.palette.some(c=>c.id===highlight))setHighlight('');if(!next.palette.some(c=>c.id===brush))setBrush(next.palette[0]?.id||'');setHover(null);}
    function undo(){if(!pattern||locked||editPending.current||pendingAction)return;setMergePreview(false);applyLocal(history.current.undo(pattern));}
    function redo(){if(!pattern||locked||editPending.current||pendingAction)return;setMergePreview(false);applyLocal(history.current.redo(pattern));}
    async function editAction(operation){
      if(!pattern||locked||editPending.current||pendingAction)return;
      editPending.current=true;setBusy(true);setError('');const before=pattern,ac=new AbortController();controller.current=ac;const timer=setTimeout(()=>ac.abort(),15000);
      try{const response=await fetch('/api/local-bead-studio/edit',{method:'POST',headers:{'Content-Type':'application/json','X-DSH-Bead-Studio':'1'},body:JSON.stringify({...operation,project}),signal:ac.signal});const result=await response.json();if(!response.ok)throw Error(result.error||t('editFailed'));if(alive.current&&!ac.signal.aborted&&result.changed){const next=projects.normalizeProject(result.project).pattern;history.current.commit(before,next);applyLocal(next);}if(alive.current)setMergePreview(false);}
      catch(e){if(alive.current)setError(e.message);}finally{clearTimeout(timer);editPending.current=false;if(alive.current&&controller.current===ac)setBusy(false);}
    }
    function stroke(indices){if(tool==='brush'&&!brush)return;editAction({action:'paint',indices,colorId:tool==='eraser'?null:brush});}
    function pick(index){const color=pattern?.palette[pattern.cells[index]];if(color){setBrush(color.id);setTool('brush');}else setNotice(t('pickedEmpty'));}
    const merged=useMemo(()=>{if(!mergePreview||!pattern||!fromId||!toId||fromId===toId)return null;try{return editor.mergeColors(pattern,fromId,toId);}catch{return null;}},[mergePreview,pattern,fromId,toId]);
    const cell=hover===null||!pattern?null:editor.getCellInfo(pattern,hover);
    useEffect(()=>{if(pattern&&!pattern.palette.some(c=>c.id===brush))setBrush(pattern.palette[0]?.id||'');},[pattern,brush]);
    const canExport=!!pattern&&!locked;
    const field=(label,control)=>h('label',{className:'bs-field'},h('span',null,label),control);
    const button=(label,fn,props={})=>h('button',{type:'button',onClick:fn,...props},label);
    const counts=useMemo(()=>{if(!pattern)return{};const b=pattern.boards.find(b=>b.id===boardId)||{x:0,y:0,width:pattern.width,height:pattern.height};const out={};for(let y=b.y;y<b.y+b.height;y++)for(let x=b.x;x<b.x+b.width;x++){const c=pattern.palette[pattern.cells[y*pattern.width+x]];if(c)out[c.id]=(out[c.id]||0)+1;}return out;},[pattern,boardId]);
    const selected=pattern?.palette.find(c=>c.id===highlight);
    return h('main',{className:'bs-root'+(focusCanvas?' bs-focus':''),'data-testid':'bead-studio'},h('style',null,css),
      h('header',{className:'bs-head'},h('div',null,h('h1',null,t('title')),h('div',{className:'bs-muted'},t('subtitle'))),h('span',{className:'bs-tag'},'0.5.2 Beta · '+t('badge'))),
      error&&h('div',{className:'bs-alert bs-error',role:'alert'},error),
      h('div',{className:'bs-toolbar'},button(t('library'),()=>setLibraryOpen(v=>!v)),button(t('newProject'),()=>libraryAction('new'),{disabled:locked}),button(t('copyProject'),()=>libraryAction('copy'),{disabled:locked||!activeId}),button(t(focusCanvas?'exitFocus':'focusCanvas'),()=>setFocusCanvas(v=>!v)),button(t(showParams?'hideParams':'showParams'),()=>setShowParams(v=>!v)),button(t(showPalette?'hidePalette':'showPalette'),()=>setShowPalette(v=>!v))),
      libraryOpen&&h('section',{className:'bs-card bs-library'},h('div',{className:'bs-toolbar'},h('h2',null,t('library')),h('input',{'aria-label':t('searchProjects'),placeholder:t('searchProjects'),value:search,onChange:e=>{setSearch(e.target.value);setOffset(0);}}),h('label',{className:'bs-check'},h('input',{type:'checkbox',checked:trash,onChange:e=>{setTrash(e.target.checked);setOffset(0);}}),t('trash')),button(t('refresh'),refreshLibrary)),
        h('div',{className:'bs-library-grid'},...items.map(item=>h('article',{className:'bs-library-item',key:item.id},h(Thumbnail,{thumbnail:item.thumbnail}),h('strong',null,item.name),h('small',null,item.width+' × '+item.height+' · '+item.colorCount+' '+t('usedColors')+' · '+item.totalBeads+' '+t('beadUnit')),h('small',null,new Date(item.updatedAt).toLocaleString()),
          h('div',{className:'bs-toolbar'},trash?button(t('restoreProject'),()=>libraryAction('restore',item),{disabled:locked}):button(t(item.id===activeId?'currentProject':'openProject'),()=>libraryAction('open',item),{disabled:locked||item.id===activeId}),button(t(trash?'purgeProject':'trashProject'),()=>setLibraryConfirm({action:trash?'purge':'trash',item}),{disabled:locked}))))),
        !items.length&&h('p',null,t('emptyLibrary')),h('div',{className:'bs-toolbar'},button(t('previousPage'),()=>setOffset(n=>Math.max(0,n-12)),{disabled:offset===0}),h('span',null,(libraryTotal?offset+1:0)+'–'+Math.min(offset+12,libraryTotal)+' / '+libraryTotal),button(t('nextPage'),()=>setOffset(n=>n+12),{disabled:offset+12>=libraryTotal}))),
      libraryConfirm&&h('div',{className:'bs-alert',role:'alert'},t(libraryConfirm.action==='purge'?'purgeWarning':'trashWarning')+' '+libraryConfirm.item.name,button(t('confirm'),()=>libraryAction(libraryConfirm.action,libraryConfirm.item),{disabled:locked}),button(t('cancel'),()=>setLibraryConfirm(null))),
      h('section',{className:'bs-card bs-project'},h('div',{className:'bs-toolbar'},h('strong',null,t('project')),h('input',{'aria-label':t('projectName'),placeholder:t('untitled'),value:name,maxLength:120,disabled:locked||!pattern,onChange:e=>setName(e.target.value)}),button(t('importProject'),()=>jsonRef.current.click(),{disabled:locked}),h('input',{ref:jsonRef,type:'file',accept:'.json,application/json',style:{display:'none'},onChange:e=>{importFile(e.target.files[0]);e.target.value='';}}),button(t('reloadSaved'),()=>setReloadConfirm(true),{disabled:busy||exporting}),h('span',{className:'bs-muted',role:'status'},t('save_'+saveState.state),saveState.updatedAt?' · '+new Date(saveState.updatedAt).toLocaleTimeString():'')),
        h('p',{className:'bs-note'},t('saveScope')),
        recovery&&h('div',{className:'bs-alert'},t('recoveryHint'),button(t('recoverDraft'),()=>libraryAction('recover',recovery.project),{disabled:locked})),
        saveState.state==='error'&&h('div',{className:'bs-alert'},saveState.message,button(t('retry'),()=>{if(!ready)openSaved();else queue.current.retry().catch(()=>{});})),
        saveState.state==='conflict'&&h('div',{className:'bs-alert'},t('conflictHint')),
        reloadConfirm&&h('div',{className:'bs-alert',role:'alert'},t('reloadConfirm'),button(t('confirmReload'),()=>{setReloadConfirm(false);openSaved(true);}),button(t('cancel'),()=>setReloadConfirm(false)))),
      AiPanel&&h('details',{className:'bs-ai-shell'},h('summary',null,t('aiTestEntry')),h(AiPanel,{source,sourceId,params,disabled:locked||!!pendingAction,onAdopt:adoptAiImage})),
      h('div',{className:'bs-layout'+(!showParams||focusCanvas?' bs-wide':'')},
        h('aside',{className:'bs-stack',hidden:!showParams||focusCanvas},
          h('section',{className:'bs-card'},h('h2',null,'01 · '+t('source')),
            h('div',{className:'bs-drop',onDragOver:e=>e.preventDefault(),onDrop:e=>{e.preventDefault();loadFile(e.dataTransfer.files[0]);}},source?h(Source,{image:source}):h(Icon,{size:38}),h('div',{className:'bs-muted'},source?sourceName:pattern?t('sourceNotStored'):t('drop')),
              button(t(source?'replace':'upload'),()=>fileRef.current.click(),{disabled:locked}),h('input',{ref:fileRef,type:'file',accept:'image/png,image/jpeg,image/webp',style:{display:'none'},onChange:e=>{loadFile(e.target.files[0]);e.target.value='';}}),h('small',{className:'bs-muted'},t('formats'))),
            h('label',{className:'bs-check'},h('input',{type:'checkbox',checked:keepImageSize,disabled:locked,onChange:e=>setKeepImageSize(e.target.checked)}),t('keepImageSize')),
            source&&h('p',{className:'bs-note','aria-live':'polite'},t('sourcePixels')+': '+source.width+' × '+source.height+' px · '+t('plannedSize')+': '+params.width+' × '+height+' '+t('gridUnit')),
            button(t('resetImageSize'),()=>setParams(p=>imageSizing(source,p,false)),{disabled:locked||!source,className:'bs-full',style:{marginTop:8}}),
            button(t('demo'),demo,{className:'bs-full',style:{marginTop:10},disabled:locked}),h('p',{className:'bs-note'},t('privacy'))),
          h('section',{className:'bs-card'},h('h2',null,'02 · '+t('settings')),
            field(t('crop'),h('select',{value:params.crop,disabled:locked||!source,onChange:e=>setParam('crop',e.target.value)},h('option',{value:'original'},t('original')),h('option',{value:'square'},t('square')))),
            h('div',{className:'bs-pair'},field(t('width'),h('input',{type:'number',min:8,max:128,value:params.width,disabled:locked||!source,onChange:e=>setParam('width',e.target.value===''?'':Number(e.target.value))})),field(t('height'),h('input',{type:'number',readOnly:true,value:height}))),
            source&&Math.round(Number(params.width)*(params.crop==='square'?1:source.height/source.width))>128&&h('p',{className:'bs-note'},t('heightCapped')),
            field(t('colors')+' · '+params.maxColors,h('input',{type:'range',min:2,max:32,value:params.maxColors,disabled:locked||!source,onChange:e=>setParam('maxColors',Number(e.target.value))})),
            field(t('board'),h('select',{value:params.boardSize,disabled:locked||!source,onChange:e=>setParam('boardSize',Number(e.target.value))},...[...new Set([29,32,50,75,100,120,params.boardSize])].sort((a,b)=>a-b).map(n=>h('option',{key:n,value:n},`${n} × ${n}`)))),
            field(t('background'),h('select',{value:params.background,disabled:locked||!source,onChange:e=>setParam('background',e.target.value)},h('option',{value:'transparent'},t('transparent')),h('option',{value:'white'},t('white')))),
            button(t(busy?'working':'generate'),()=>run(),{className:'bs-primary bs-full',disabled:locked||!source||!Number.isInteger(params.width)||params.width<8||params.width>128}),h('p',{className:'bs-note'},t('backgroundNote')))),
        h('div',{className:'bs-stack'},
          h('div',{className:'bs-stats'},...[[pattern?`${pattern.width} × ${pattern.height}`:'—','currentDimensions'],[pattern?pattern.totalBeads.toLocaleString():'—','beads'],[pattern?pattern.palette.filter(c=>c.count>0).length:'—','usedColors'],[pattern?pattern.boards.length:'—','boards']].map(([value,label])=>h('div',{className:'bs-stat',key:label},h('strong',null,value),h('span',null,t(label))))),
          h('section',{className:'bs-card'},h('h2',null,'03 · '+t('preview')),
            h('div',{className:'bs-editor'},
              h('div',{className:'bs-toolbar'},h('strong',null,t('editTitle')),
                ...['view','edit'].map(m=>button(t('mode_'+m),()=>{setMode(m);setMergePreview(false);},{key:m,'aria-pressed':mode===m,disabled:locked||!pattern})),
                button(t('undo'),undo,{disabled:locked||!history.current.canUndo||!!pendingAction}),button(t('redo'),redo,{disabled:locked||!history.current.canRedo||!!pendingAction})),
              mode==='edit'&&h('div',{className:'bs-toolbar'},...['brush','eraser','pick'].map(k=>button(t('tool_'+k),()=>setTool(k),{key:k,'aria-pressed':tool===k,disabled:locked})),
                h('select',{'aria-label':t('brushColor'),value:brush,disabled:locked||!pattern?.palette.length,onChange:e=>{setBrush(e.target.value);setTool('brush');}},...(pattern?.palette||[]).map(c=>h('option',{key:c.id,value:c.id},c.id+' '+c.hex)))),
              h('p',{className:'bs-note'},t(mode==='edit'?'editHint':'viewHint')),
              h('div',{className:'bs-note','aria-live':'polite'},cell?t('cellPosition')+': '+cell.row+', '+cell.col+' · '+cell.boardId+' · '+(cell.color?cell.color.id+' '+cell.color.hex:t('emptyCell')):t('hoverHint')),
              pattern&&h('details',null,h('summary',null,t('mergeTitle')),h('div',{className:'bs-toolbar'},
                ...[[fromId,setFromId,'mergeFrom'],[toId,setToId,'mergeTo']].map(([v,set,label])=>field(t(label),h('select',{value:v,disabled:locked,onChange:e=>{set(e.target.value);setMergePreview(false);}},h('option',{value:''},t('chooseColor')),...pattern.palette.map(c=>h('option',{key:c.id,value:c.id},c.id+' '+c.hex+' ('+c.count+')'))))),
                button(t('mergePreview'),()=>setMergePreview(true),{disabled:locked||!fromId||!toId||fromId===toId})),
                merged&&h('div',{className:'bs-alert'},t('mergeAffected')+': '+(pattern.palette.find(c=>c.id===fromId)?.count||0)+' · '+fromId+' → '+toId+' · '+t('previewOnly'),
                  button(t('confirmMerge'),()=>editAction({action:'merge',fromId,toId}),{disabled:locked}),button(t('cancel'),()=>setMergePreview(false))))),
            pendingAction&&h('div',{className:'bs-alert',role:'alert'},t('replaceWarning'),button(t('json'),()=>prepare('json'),{disabled:locked}),button(t('confirmReplace'),()=>{const fn=pendingAction;setPendingAction(null);fn();},{disabled:locked}),button(t('cancel'),()=>setPendingAction(null))),
            dirty&&h('div',{className:'bs-alert',role:'status'},t('dirty')),
            h('div',{className:'bs-toolbar'},h('select',{'aria-label':t('boardView'),value:boardId,onChange:e=>setBoardId(e.target.value),disabled:!pattern||locked},h('option',{value:''},t('overview')),...(pattern?.boards||[]).map(b=>h('option',{key:b.id,value:b.id},`${b.id} · ${b.width}×${b.height} · ${b.count} ${t('beadUnit')}`))),
              button('−',()=>{setFit(false);setZoom(z=>Math.max(50,z-25));},{disabled:!pattern||locked,'aria-label':t('zoomOut')}),
              h('select',{'aria-label':t('zoom'),value:fit?'fit':zoom,disabled:!pattern||locked,onChange:e=>{if(e.target.value==='fit')setFit(true);else{setFit(false);setZoom(Number(e.target.value));}}},h('option',{value:'fit'},t('fit')),...[...new Set([50,75,100,150,200,300,400,zoom])].sort((a,b)=>a-b).map(z=>h('option',{key:z,value:z},z+'%'))),
              button('+',()=>{setFit(false);setZoom(z=>Math.min(400,z+25));},{disabled:!pattern||locked,'aria-label':t('zoomIn')}),button('100%',()=>{setFit(false);setZoom(100);},{disabled:!pattern||locked}),button(t('resetView'),()=>setResetKey(k=>k+1),{disabled:!pattern}),
              ...[[labels,setLabels,'labels'],[grid,setGrid,'grid']].map(([value,set,label])=>h('label',{className:'bs-check',key:label},h('input',{type:'checkbox',checked:value,disabled:locked,onChange:e=>set(e.target.checked)}),t(label)))),
            h('p',{className:'bs-note'},t('viewportHint')),
            selected&&h('div',{className:'bs-alert'},`${selected.id} · ${t('currentBoardCount')}: ${counts[selected.id]||0} · ${t('totalCount')}: ${selected.count}`,button(t('showAll'),()=>setHighlight(''))),
            pattern?h(Viewport,{pattern:merged||pattern,boardId,labels,grid,fit,zoom,highlight:merged?'':highlight,t,setZoom,setFit,resetKey,mode,tool,brushColorId:brush,disabled:locked||!!merged||!!pendingAction,onStroke:stroke,onPick:pick,onHover:setHover,onUndo:undo,onRedo:redo}):h('div',{className:'bs-preview'},h('div',{className:'bs-empty'},h(Icon,{size:64}),h('strong',null,t('emptyTitle')),h('div',null,t('emptyText')),button(t('demo'),demo,{disabled:locked}))),
            h('div',{className:'bs-exports'},...['png','svg','csv','json','pdf'].map(kind=>button(kind==='csv'?t('csv'):kind==='json'?t('json'):kind==='pdf'?t('print'):kind.toUpperCase(),()=>prepare(kind),{key:kind,disabled:!canExport}))),
            h('div',{className:'bs-note',role:'status'},downloadState?t('download_'+downloadState):notice||t('exportNote')),
            prepared&&h('div',{className:'bs-download'},h('strong',null,prepared.filename),h('span',{className:'bs-muted'},`${(prepared.blob.size/1024).toFixed(1)} KB`),h('a',{href:prepared.url,download:prepared.filename,onClick:()=>setDownloadState('requested')},t('downloadLink')),typeof window.showSaveFilePicker==='function'&&button(t('saveAs'),saveAs)),
            h('p',{className:'bs-note'},t('downloadHint'))),
          h('section',{className:'bs-card',hidden:!showPalette||focusCanvas},h('div',{className:'bs-caption'},h('h2',null,t('palette')),h('span',{className:'bs-tag'},t('generic'))),h('p',{className:'bs-note'},t('highlightHint')),
            h('div',{className:'bs-palette'},...(pattern?.palette||[]).map(c=>button(h(React.Fragment,null,h('span',{className:'bs-swatch',style:{background:c.hex}}),h('span',null,h('strong',null,c.id),h('small',null,c.hex)),h('b',null,c.count.toLocaleString())),()=>setHighlight(x=>x===c.id?'':c.id),{className:'bs-color'+(highlight===c.id?' bs-selected':''),key:c.id,disabled:locked,'aria-pressed':highlight===c.id}))),!pattern&&h('p',{className:'bs-muted'},t('noPalette'))),
          h('p',{className:'bs-note'},t('memoryNote')))));
  };
}
