import { normalizeProject, parseProject } from './project.js';
// Shared by HTTP and agent tool. Storage belongs to DSH's profile, not a browser origin/port.
export class ProjectService {
  constructor(table){this.table=table;this.tail=Promise.resolve();this.closed=false;}
  read(){const r=this.table.get('current');return r?{revision:r.revision,project:normalizeProject(r.project)}:{revision:0,project:null};}
  async load(){await this.tail;return this.read();}
  save(project,expectedRevision){
    if(this.closed)throw new Error('Project store is closing.');
    const canonical=normalizeProject(project);
    if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw new Error('expectedRevision must be a nonnegative integer. Load before saving.');
    const work=this.tail.then(async()=>{
      const current=this.read();
      if(current.revision!==expectedRevision){const e=new Error('Another window updated the saved project. Export your current JSON, then reload the saved project.');e.code='CONFLICT';throw e;}
      const record={revision:current.revision+1,project:{...canonical,updatedAt:new Date().toISOString()}};
      await this.table.put('current',record);
      return {revision:record.revision,project:normalizeProject(record.project)};
    });
    this.tail=work.catch(()=>{});return work;
  }
  async close(){this.closed=true;await this.tail;}
}
export function registerProject(ctx,table){
  const service=new ProjectService(table);
  const tool={name:'bead_project',description:'Load the latest locally saved bead project, or save/import a project JSON. Save replaces the latest project, not a library. Original images are not stored. Use when asked to manage the user’s bead project.',parameters:{type:'object',properties:{action:{type:'string',enum:['load','save']},projectJson:{type:'string',maxLength:1048576,description:'Required for save: legacy pattern JSON or a version 1 bead-project envelope.'},expectedRevision:{type:'integer',minimum:0,description:'Required for save: the revision returned by load; stale revisions are rejected.'}},required:['action'],additionalProperties:false},output:{schema:{type:'object'},render:(_a,r)=>[{type:'text',text:JSON.stringify(r)}]},isConcurrencySafe:()=>false,async execute(args,exec){exec.signal?.throwIfAborted();if(args.action==='load')return service.load();if(args.action==='save')return service.save(parseProject(args.projectJson),args.expectedRevision);throw new Error('Unknown project action.');}};
  const disposeTool=ctx.tools.register(tool);
  const disposeRoute=ctx.webServer.register({kind:'exact',path:'/api/local-bead-studio/project',async handler(req,res){
    const send=(code,data)=>{if(!res.writableEnded){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}};
    const local=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket?.remoteAddress),origin=req.headers.origin;
    if(!local||req.headers['x-dsh-bead-studio']!=='1'||(origin!==undefined&&origin!==ctx.webServer.getOrigin()))return send(403,{error:'Local workbench request required.'});
    if(req.method!=='POST')return send(405,{error:'POST required.'});
    if(!String(req.headers['content-type']||'').startsWith('application/json'))return send(415,{error:'JSON required.'});
    if(Number(req.headers['content-length'])>1100000)return send(413,{error:'Project exceeds 1 MB.'});
    const timer=setTimeout(()=>{send(408,{error:'Request timed out.'});req.destroy();},10000);timer.unref?.();
    try{
      let bytes=0;const chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>1100000){send(413,{error:'Project exceeds 1 MB.'});return;}chunks.push(chunk);}
      const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(input.action==='load')return send(200,await service.load());
      if(input.action==='save')return send(200,await service.save(input.project,input.expectedRevision));
      return send(400,{error:'Unknown project action.'});
    }catch(e){send(e.code==='CONFLICT'?409:400,{error:e.message,code:e.code||'INVALID_PROJECT'});}finally{clearTimeout(timer);}
  }});
  return {service,async dispose(){disposeRoute();disposeTool();await service.close();}};
}
