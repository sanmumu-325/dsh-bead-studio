import {randomUUID} from 'node:crypto';
import {normalizeProject, parseProject} from './project.js';

const ACTIONS = ['list','get','create','save','rename','duplicate','trash','restore','purge'];
const fail = (code, message) => { const error = new Error(message); error.code = code; throw error; };
const validId = id => {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(id)) fail('INVALID_INPUT', 'Invalid artwork id');
  return id;
};
const copy = record => ({id:record.id,revision:record.revision,project:normalizeProject(record.project),createdAt:record.createdAt,deletedAt:record.deletedAt});
export function emptyProject() {
  return normalizeProject({version:'1.0',width:16,height:16,maxColors:16,boardSize:29,background:'transparent',palette:[{id:'C01',rgb:[0,0,0]},{id:'C02',rgb:[255,255,255]}],cells:Array(256).fill(-1)});
}
function named(project, name) {
  return name === undefined ? normalizeProject(project) : normalizeProject({...project,name});
}
function thumbnail(pattern) {
  const scale = Math.min(1,16 / pattern.width,16 / pattern.height);
  const width = Math.max(1,Math.round(pattern.width * scale)), height = Math.max(1,Math.round(pattern.height * scale));
  const pixels = [];
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const xx = Math.min(pattern.width-1,Math.floor((x+.5)*pattern.width/width));
    const yy = Math.min(pattern.height-1,Math.floor((y+.5)*pattern.height/height));
    const color = pattern.palette[pattern.cells[yy*pattern.width+xx]];
    pixels.push(color ? color.hex : null);
  }
  return {width,height,pixels};
}
function summary(record) {
  const p=record.project.pattern;
  return {id:record.id,revision:record.revision,name:record.project.name,width:p.width,height:p.height,totalBeads:p.totalBeads,colorCount:p.palette.filter(c=>c.count>0).length,updatedAt:record.project.updatedAt,createdAt:record.createdAt,deletedAt:record.deletedAt,thumbnail:thumbnail(p)};
}

/** One instance owns the domain's mutation queue; reads wait for prior writes. */
export class LibraryService {
  constructor(projects, metadata, {now=()=>new Date().toISOString(),makeId=()=>`p_${randomUUID()}`}={}) {
    this.projects=projects;this.metadata=metadata;this.now=now;this.makeId=makeId;
    this.tail=Promise.resolve();this.closed=false;
  }
  enqueue(fn) {
    if(this.closed) fail('CLOSED','Artwork library is closing');
    const work=this.tail.then(fn);this.tail=work.catch(()=>{});return work;
  }
  /** Write artwork before marker. A partial migration never overwrites artwork. */
  migrate(legacy) {
    const project=legacy ? normalizeProject(legacy.project) : null;
    return this.enqueue(async()=>{
      if(this.metadata.get('migration_v1')?.done) return {migrated:false};
      if(project && !this.projects.get('legacy_v1')) {
        const time=project.updatedAt || this.now();
        await this.projects.put('legacy_v1',{id:'legacy_v1',revision:1,project:{...project,updatedAt:time},createdAt:time,deletedAt:null});
      }
      await this.metadata.put('migration_v1',{done:true});
      return {migrated:!!project};
    });
  }
  read(id) {
    const row=this.projects.get(validId(id));
    if(!row) fail('NOT_FOUND','Artwork not found');
    return copy(row);
  }
  async execute(input) {
    if(this.closed) fail('CLOSED','Artwork library is closing');
    if(!input || typeof input!=='object' || !ACTIONS.includes(input.action)) fail('INVALID_INPUT','Unknown library action');
    const action=input.action;
    if(action==='list') {
      const {trash=false,query='',offset=0,limit=20}=input;
      if(typeof trash!=='boolean' || typeof query!=='string' || query.length>120 || !Number.isSafeInteger(offset) || offset<0 || !Number.isInteger(limit) || limit<1 || limit>20) fail('INVALID_INPUT','Invalid list filters or pagination');
      await this.tail;
      const needle=query.trim().toLocaleLowerCase('en-US');
      const rows=[...this.projects.entries()].map(([,row])=>row).filter(row=>(row.deletedAt!==null)===trash && (!needle || row.project.name.toLocaleLowerCase('en-US').includes(needle)));
      rows.sort((a,b)=>String(b.project.updatedAt).localeCompare(String(a.project.updatedAt),'en') || a.id.localeCompare(b.id,'en'));
      return {items:rows.slice(offset,offset+limit).map(summary),total:rows.length,offset,limit,nextOffset:offset+limit<rows.length?offset+limit:null};
    }
    const id=action==='create'?null:validId(input.id);
    if(action==='get') {await this.tail;return this.read(id);}
    const expected=input.expectedRevision;
    if(action!=='create' && (!Number.isSafeInteger(expected)||expected<1)) fail('INVALID_INPUT','expectedRevision is required; load the artwork first');
    const confirm=input.confirm, name=input.name;
    if(action==='rename' && name===undefined) fail('INVALID_INPUT','name is required for rename');
    let project;
    if(action==='create' || action==='save') {
      if(input.project!==undefined && input.projectJson!==undefined) fail('INVALID_INPUT','Pass project or projectJson, not both');
      project=input.projectJson!==undefined?parseProject(input.projectJson):input.project!==undefined?normalizeProject(input.project):action==='create'?emptyProject():null;
      if(!project) fail('INVALID_INPUT','project is required for save');
      project=named(project,name);
    } else if(name!==undefined) {
      // Validate and capture names before waiting on the queue.
      named(emptyProject(),name);
    }
    return this.enqueue(async()=>{
      let row;
      if(action!=='create') {
        row=this.read(id);
        if(row.revision!==expected) fail('CONFLICT','Artwork changed in another window; reload before retrying');
        if(row.revision>=Number.MAX_SAFE_INTEGER) fail('INVALID_INPUT','Artwork revision exhausted');
        if(row.deletedAt!==null && !['restore','purge','trash'].includes(action)) fail('DELETED','Artwork is in the recycle bin; restore it first');
      }
      if(action==='purge') {
        if(row.deletedAt===null) fail('INVALID_INPUT','Only recycle-bin artwork can be permanently deleted');
        if(confirm!=='DELETE') fail('CONFIRM_REQUIRED','Permanent deletion requires confirm=DELETE');
        if(!await this.projects.delete(id)) fail('NOT_FOUND','Artwork not found');
        return {id,purged:true};
      }
      if(action==='trash' && row.deletedAt!==null || action==='restore' && row.deletedAt===null) return row;
      const time=this.now();
      if(action==='create' || action==='duplicate') {
        const newId=validId(this.makeId());
        if(newId==='legacy_v1' || this.projects.get(newId)) fail('ID_COLLISION','Artwork id already exists; retry creation');
        const source=action==='create'?project:named(row.project,name===undefined?`${row.project.name.slice(0,117)} 副本`:name);
        const created={id:newId,revision:1,project:{...source,updatedAt:time},createdAt:time,deletedAt:null};
        await this.projects.put(newId,created);return copy(created);
      }
      const next={...row,revision:row.revision+1,project:{...(action==='save'?project:action==='rename'?named(row.project,name):row.project),updatedAt:time},deletedAt:action==='trash'?time:action==='restore'?null:row.deletedAt};
      await this.projects.put(id,next);return copy(next);
    });
  }
  async close(){this.closed=true;await this.tail;}
}

export function registerLibrary(ctx,service) {
  const disposers=[];
  try {
    disposers.push(ctx.effect(()=>ctx.tools.register({
      name:'bead_library',description:'Manage saved bead artworks and their recycle bin. List returns summaries and thumbnails; get opens one full project. Purge permanently deletes a trashed artwork. Original source images are never stored.',
      parameters:{type:'object',properties:{
        action:{type:'string',enum:ACTIONS},id:{type:'string',maxLength:80,description:'Artwork id from list/create; required except for list/create.'},
        expectedRevision:{type:'integer',minimum:1,description:'Required for save/rename/duplicate/trash/restore/purge; use the latest get revision.'},
        projectJson:{type:'string',maxLength:1048576,description:'Required for save; optional for create (otherwise a blank 16×16 project). Legacy pattern or version-1 project JSON.'},
        name:{type:'string',maxLength:120,description:'Required for rename; optional name for create/save/duplicate.'},trash:{type:'boolean',description:'list: true for recycle bin only; default false.'},query:{type:'string',maxLength:120,description:'list: case-insensitive name filter.'},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:20,default:20},confirm:{type:'string',enum:['DELETE'],description:'Required only for permanent purge, after user confirmation.'}
      },required:['action'],additionalProperties:false},
      output:{schema:{type:'object'},render:(_args,result)=>[{type:'text',text:JSON.stringify(result)}]},isConcurrencySafe:()=>false,
      execute(args,exec){exec.signal?.throwIfAborted();return service.execute(args);}
    })));
    disposers.push(ctx.effect(()=>ctx.webServer.register({kind:'exact',path:'/api/local-bead-studio/library',async handler(req,res){
      const send=(status,data)=>{if(!res.writableEnded){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}};
      if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket?.remoteAddress)||req.headers['x-dsh-bead-studio']!=='1'||(req.headers.origin!==undefined&&req.headers.origin!==ctx.webServer.getOrigin()))return send(403,{error:'Local workbench request required.'});
      if(req.method!=='POST')return send(405,{error:'POST required.'});
      if(!String(req.headers['content-type']||'').startsWith('application/json'))return send(415,{error:'JSON required.'});
      if(Number(req.headers['content-length'])>1300000)return send(413,{error:'Library request too large.'});
      const timer=setTimeout(()=>{send(408,{error:'Request timed out.'});req.destroy();},10000);timer.unref?.();
      try{
        const chunks=[];let size=0;
        for await(const chunk of req){size+=chunk.length;if(size>1300000)return send(413,{error:'Library request too large.'});chunks.push(chunk);}
        const result=await service.execute(JSON.parse(Buffer.concat(chunks).toString('utf8')));send(200,result);
      }catch(e){send(e.code==='CONFLICT'?409:e.code==='NOT_FOUND'?404:400,{error:e.message,code:e.code||'INVALID_INPUT'});}finally{clearTimeout(timer);}
    }})));
  } catch(error) {for(const dispose of disposers.reverse())dispose();throw error;}
  return {async dispose(){for(const dispose of disposers.reverse())await dispose();await service.close();}};
}
