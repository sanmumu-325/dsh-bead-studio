import {normalizeProject,parseProject} from './project.js';
import {paintCells,mergeColors} from './editor.js';
export class EditorService {
  edit(input){
    const project=input.projectJson!==undefined?parseProject(input.projectJson):normalizeProject(input.project);
    const before=project.pattern;
    const pattern=input.action==='paint'?paintCells(before,input.indices,input.colorId):input.action==='merge'?mergeColors(before,input.fromId,input.toId):(()=>{throw new Error('Unknown edit action');})();
    return {project:normalizeProject({...project,pattern}),changed:pattern!==before};
  }
}
export const inject=['webServer','tools'];
export function apply(ctx){
  const service=new EditorService();
  ctx.effect(()=>ctx.tools.register({name:'bead_edit',description:'Paint or erase selected bead cells, or merge one color into another. Returns the edited project with rebuilt counts; does not persist it. To keep changes, save the result with bead_project and its loaded revision.',parameters:{type:'object',properties:{action:{type:'string',enum:['paint','merge']},projectJson:{type:'string',maxLength:1048576,description:'Legacy pattern or version-1 project JSON to edit.'},indices:{type:'array',items:{type:'integer',minimum:0,maximum:16383},maxItems:16384,description:'paint: zero-based row-major cell indices.'},colorId:{type:['string','null'],description:'paint: existing color ID, or null to erase.'},fromId:{type:'string',description:'merge: source color ID.'},toId:{type:'string',description:'merge: destination color ID.'}},required:['action','projectJson'],additionalProperties:false},output:{schema:{type:'object'},render:(_a,r)=>[{type:'text',text:JSON.stringify(r)}]},isConcurrencySafe:()=>true,execute(args,exec){exec.signal?.throwIfAborted();return service.edit(args);}}));
  ctx.effect(()=>ctx.webServer.register({kind:'exact',path:'/api/local-bead-studio/edit',async handler(req,res){
    const send=(code,data)=>{if(!res.writableEnded){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}};
    if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket?.remoteAddress)||req.headers['x-dsh-bead-studio']!=='1'||(req.headers.origin!==undefined&&req.headers.origin!==ctx.webServer.getOrigin()))return send(403,{error:'Local workbench request required.'});
    if(req.method!=='POST')return send(405,{error:'POST required.'});
    if(!String(req.headers['content-type']||'').startsWith('application/json'))return send(415,{error:'JSON required.'});
    if(Number(req.headers['content-length'])>1300000)return send(413,{error:'Edit request too large.'});
    const timer=setTimeout(()=>{send(408,{error:'Request timed out.'});req.destroy();},10000);timer.unref?.();
    try{let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>1300000)return send(413,{error:'Edit request too large.'});chunks.push(chunk);}return send(200,service.edit(JSON.parse(Buffer.concat(chunks).toString('utf8'))));}
    catch(e){send(400,{error:e.message});}finally{clearTimeout(timer);}
  }}));
}
