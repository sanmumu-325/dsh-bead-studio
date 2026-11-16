// One serialized optimistic save queue; no browser storage and no original-image persistence.
export function createAutosave({load,save,onState=()=>{},delay=250}) {
  let revision=0,ready=false,blocked=false,pending=null,timer=null,running=null,last='',disposed=false,loading=false;
  const fingerprint=p=>JSON.stringify({...p,updatedAt:null});
  const notify=state=>{if(!disposed)onState(state);};
  async function open(){
    if(loading||running)throw new Error('A project operation is already running.');
    loading=true;ready=false;blocked=false;pending=null;clearTimeout(timer);notify({state:'loading'});
    try{const row=await load();if(disposed)throw new Error('Project reader disposed.');revision=row.revision;last=row.project?fingerprint(row.project):'';ready=true;notify({state:'saved',updatedAt:row.project?.updatedAt||null});return row;}
    catch(e){blocked=true;notify({state:'error',message:e.message});throw e;}finally{loading=false;}
  }
  function schedule(project){
    if(!ready||disposed)return;
    const key=fingerprint(project);if(key===last&&!running){pending=null;clearTimeout(timer);return;}
    pending={project,key};clearTimeout(timer);
    if(blocked)return;
    notify({state:'pending'});timer=setTimeout(()=>{flush().catch(()=>{});},delay);
  }
  function flush(){
    clearTimeout(timer);
    if(running)return running;
    if(!ready||blocked||!pending)return Promise.resolve();
    running=(async()=>{
      while(pending&&!blocked){
        const item=pending;pending=null;if(item.key===last)continue;
        notify({state:'saving'});
        try{const row=await save(item.project,revision);revision=row.revision;last=item.key;notify({state:pending?'pending':'saved',updatedAt:row.project?.updatedAt||null});}
        catch(e){if(!pending)pending=item;blocked=true;notify({state:e.code==='CONFLICT'?'conflict':'error',message:e.message});throw e;}
      }
    })().finally(()=>{running=null;});
    return running;
  }
  async function retry(){if(!ready)throw new Error('Load saved project before retrying.');blocked=false;return flush();}
  function close(){clearTimeout(timer);const p=flush();disposed=true;return p;}
  function discard(){clearTimeout(timer);pending=null;disposed=true;return running?running.catch(()=>{}):Promise.resolve();}
  return {open,schedule,flush,retry,close,discard,get dirty(){return !!pending||!!running;}};
}
