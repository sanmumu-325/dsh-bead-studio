import {createAutosave} from './autosave.js';
// A page owns one selected record. Every save closes over its record ID.
export function createLibrarySession({request,onState=()=>{},delay=250}) {
  let active=null,closed=false,operation=false;
  const emit=s=>{if(!closed)onState(s);};
  async function flush(){if(!active)return;await active.queue.flush();if(active.queue.dirty){const e=Error('Unsaved changes prevent switching projects. Export JSON or resolve the save error first.');e.code='UNSAVED';throw e;}}
  async function attach(row,discard=false){
    if(closed)throw Error('Library session closed.');
    const entry={row,queue:null};
    entry.queue=createAutosave({delay,load:async()=>row,save:async(project,expectedRevision)=>{const saved=await request({action:'save',id:row.id,project,expectedRevision});entry.row=saved;return saved;},onState:s=>{if(active===entry)emit(s);}});
    await entry.queue.open();
    if(closed){await entry.queue.discard();throw Error('Library session closed.');}
    const previous=active;try{if(previous&&!discard){await previous.queue.flush();if(previous.queue.dirty)throw Error('Unsaved changes prevent switching projects.');}if(closed)throw Error('Library session closed.');if(previous)await previous.queue.discard();}catch(e){await entry.queue.discard();throw e;}if(closed){await entry.queue.discard();throw Error('Library session closed.');}active=entry;emit({state:'saved',updatedAt:row.project.updatedAt});return row;
  }
  async function exclusive(fn){if(closed)throw Error('Library session closed.');if(operation)throw Error('A project operation is running.');operation=true;try{return await fn();}finally{operation=false;}}
  async function open(id,{discard=false}={}){return exclusive(async()=>{
    if(discard&&active)await active.queue.flush().catch(()=>{});else await flush();
    if(!id)id=active?.row.id;
    if(!id){const list=await request({action:'list',limit:1});id=list.items[0]?.id;}
    if(!id){emit({state:'saved'});return{id:null,revision:0,project:null};}
    const row=await request({action:'get',id});if(row.deletedAt)throw Error('Restore this project from trash before opening it.');return attach(row,discard);
  });}
  async function create(project,name){return exclusive(async()=>{await flush();return attach(await request({action:'create',...(project?{project}:{}),...(name?{name}:{})}));});}
  async function duplicate(){return exclusive(async()=>{await flush();if(!active)throw Error('No current project.');return attach(await request({action:'duplicate',id:active.row.id,expectedRevision:active.row.revision}));});}
  async function mutate(action,item,extra={}){return exclusive(async()=>{
    await flush();const isCurrent=active?.row.id===item.id;const expectedRevision=isCurrent?active.row.revision:item.revision;
    const result=await request({action,id:item.id,expectedRevision,...extra});
    if(isCurrent&&['trash','purge'].includes(action)){await active.queue.close();active=null;emit({state:'saved'});}
    return result;
  });}
  return {open,create,duplicate,mutate,flush,schedule:p=>active?.queue.schedule(p),retry:()=>active?.queue.retry()||Promise.resolve(),
    async close(){closed=true;await active?.queue.close();},get dirty(){return !!active?.queue.dirty;},get id(){return active?.row.id||null;},get row(){return active?.row||null;},get operating(){return operation;}};
}
