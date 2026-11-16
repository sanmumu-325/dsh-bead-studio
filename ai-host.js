import {AiStudioService} from './ai-core.js';
import {createCodexAdapter} from './ai-codex-adapter.js';
import {createCustomApiAdapter} from './ai-custom-adapter.js';
import {ApiConfigStore} from './ai-api-config.js';
export const inject=['webServer','tools','agents','attachments','sessions','credentials'];
export function registerAi(ctx,service,config){
  const toolActions=new Set(['status','start','poll','cancel','custom_config','custom_check']);
  const dispatch=async input=>{switch(input.action){case 'status':return service.status(input.provider);case 'start':return service.start(input);case 'poll':return service.poll(input.id);case 'cancel':return service.cancel(input.id);case 'custom_config':return config.view();case 'custom_check':return config.check();case 'custom_models':return config.models(input);case 'custom_save':case 'custom_clear':if([...service.jobs.values()].some(j=>j.executing&&j.provider==='custom'))throw Error('请等待当前自定义 API 请求结束，再修改配置。');return input.action==='custom_save'?config.save(input):config.clear(input);default:throw Error('Unknown AI operation.');}};
  const disposers=[];
  disposers.push(ctx.tools.register({name:'bead_ai',description:'Experimental bead-art image editing. Start only on an explicit image-edit request; the selected provider may charge quota. Codex stores task images in this conversation; custom API uses the saved destination without Codex. Never auto-retry. Config reads/checks are offline and reveal no key; credentials are configured only in the UI.',parameters:{type:'object',additionalProperties:false,required:['action'],properties:{action:{type:'string',enum:['status','start','poll','cancel','custom_config','custom_check']},provider:{type:'string',enum:['codex','custom'],description:'Image engine; defaults to codex.'},configRevision:{type:'string',description:'custom start: exact revision from custom status, after confirming its destination.'},includeImage:{type:'boolean',description:'poll: attach a successful result to this conversation and DSH attachment storage.'},id:{type:'string',description:'Job ID returned by start.'},imageDataUrl:{type:'string',maxLength:6291456,description:'start: PNG data URL, resized to at most 1024 pixels per side.'},style:{type:'string',enum:['faithful','cute','outline']},background:{type:'string',enum:['keep','white']},notes:{type:'string',maxLength:500},width:{type:'integer',minimum:8,maximum:128},maxColors:{type:'integer',minimum:2,maximum:32}}},output:{schema:{type:'object'},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)},...(value.imageAttachment?[{type:'image',attachment:value.imageAttachment}]:[])]},async execute(args,exec){
    if(!toolActions.has(args.action))throw Error('Credential configuration is available only in the user interface.');
    if(['start','poll','cancel'].includes(args.action)){
      if(!exec?.agent?.id)throw Error('A real calling conversation is required.');
      if(args.action==='poll'||args.action==='cancel'){const job=service.jobs.get(args.id);if(!job||job.sessionId!==exec.agent.id)throw Error('AI job does not belong to this conversation.');}
    }
    const result=await dispatch({...args,sessionId:exec?.agent?.id});const {imageDataUrl,...summary}=result;
    if(imageDataUrl&&args.action==='poll'&&args.includeImage){const job=service.jobs.get(args.id);if(!job.imageAttachment){const match=/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(imageDataUrl);job.imageAttachment=await ctx.attachments.saveImage({data:new Uint8Array(Buffer.from(match[2],'base64')),mediaType:match[1],name:'bead-ai-candidate'});}return{...summary,imageAvailable:true,imageAttachment:job.imageAttachment};}
    return{...summary,...(imageDataUrl?{imageAvailable:true,nextAction:'poll with includeImage=true to view and store the result in this conversation'}:{})};
  }}));
  disposers.push(ctx.webServer.register({kind:'exact',path:'/api/local-bead-studio/ai',handler(req,res){
    const send=(status,value)=>{if(res.writableEnded)return;res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
    const remote=req.socket.remoteAddress||'',origin=req.headers.origin;
    if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote)||req.headers['x-dsh-bead-studio']!=='1'||(origin!==undefined&&origin!==ctx.webServer.getOrigin()))return send(403,{error:'Local same-origin requests only.'});
    if(req.method!=='POST')return send(405,{error:'Use POST.'});
    if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))return send(415,{error:'Use application/json.'});
    let chunks=[],size=0,ended=false;const timer=setTimeout(()=>{ended=true;chunks=[];send(408,{error:'Request body timed out.'});},10000);
    req.on('data',chunk=>{if(ended)return;size+=chunk.length;if(size>6500000){ended=true;chunks=[];clearTimeout(timer);send(413,{error:'Image request is too large.'});}else chunks.push(chunk);});
    req.on('end',async()=>{clearTimeout(timer);if(ended)return;ended=true;try{let input;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('Invalid JSON request.');}finally{chunks=[];}if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid request.');send(200,await dispatch(input));}catch(e){send(400,{error:e.publicMessage||e.message||'AI request failed.'});}});
    req.on('error',()=>{clearTimeout(timer);chunks=[];if(!ended){ended=true;send(400,{error:'Request interrupted.'});}});
  }}));
  return()=>{for(const dispose of disposers.reverse())dispose();};
}
export function apply(ctx){ctx.effect(()=>{const config=new ApiConfigStore(ctx.credentials),codex=createCodexAdapter(ctx),custom=createCustomApiAdapter({getConfig:()=>config.getConfig()});const adapter={async status(provider){if(provider==='custom'){const view=await config.view();return{...view,available:view.hasKey,engine:'Custom image API'};}return codex.status();},edit(input){return(input.provider==='custom'?custom:codex).edit(input);}};const service=new AiStudioService(adapter);const dispose=registerAi(ctx,service,config);return async()=>{dispose();config.close();await service.close();};});}
