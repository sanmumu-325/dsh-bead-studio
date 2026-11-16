import { generate, demoImage, sampleImage } from './core.js';
export const inject = ['webServer', 'tools'];
export class BeadStudioService {
  generate(input) { return generate(input); }
  demo() { const image = demoImage(); return this.generate({width:image.width,height:image.height,rgba:Array.from(image.data),maxColors:12,boardSize:29,background:'transparent'}); }
}
export function apply(ctx) {
  const service = new BeadStudioService();
  ctx.effect(() => ctx.tools.register({
    name: 'bead_pattern',
    description: 'Generate a deterministic bead pattern from a small RGBA grid, or return the built-in demo. Returns generic color IDs, cells, per-color counts and board partitions; no brand-color claims, file writes or model calls. The workbench uses the same generator.',
    parameters: {type:'object', properties:{
      action:{type:'string',enum:['generate','demo']},
      width:{type:'integer',minimum:1,maximum:128},height:{type:'integer',minimum:1,maximum:128},
      rgba:{type:'array',items:{type:'integer',minimum:0,maximum:255},maxItems:65536,description:'Row-major RGBA bytes, width × height × 4; required for generate.'},
      maxColors:{type:'integer',minimum:2,maximum:32},boardSize:{type:'integer',minimum:8,maximum:64},
      background:{type:'string',enum:['transparent','white']}
    },required:['action'],additionalProperties:false},
    output:{schema:{type:'object'},render:(_a,r)=>[{type:'text',text:JSON.stringify(r)}]},
    isConcurrencySafe:()=>true,
    async execute(args, exec){exec.signal?.throwIfAborted();const {action,...input}=args;return action==='demo'?service.demo():service.generate(input);}
  }));
  ctx.effect(() => ctx.webServer.register({kind:'exact',path:'/api/local-bead-studio/generate',async handler(req,res){
    const send=(code,value)=>{if(res.writableEnded)return;res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
    // Desktop's fetch bridge omits browser-generated Origin/Sec-Fetch headers.
    // A required custom header + JSON forces cross-origin browsers to preflight;
    // no CORS/preflight is enabled. Explicit foreign/null origins remain denied.
    const local=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    const origin=req.headers.origin;
    if(!local || req.headers['x-dsh-bead-studio']!=='1' || (origin!==undefined && origin!==ctx.webServer.getOrigin())) return send(403,{error:'Local workbench request required.'});
    if(req.method!=='POST')return send(405,{error:'POST required.'});
    if(!String(req.headers['content-type']||'').startsWith('application/json'))return send(415,{error:'JSON required.'});
    if(Number(req.headers['content-length'])>300000)return send(413,{error:'Input exceeds 300 KB.'});
    let bytes=0; const chunks=[];
    const timer=setTimeout(()=>{send(408,{error:'Request timed out.'});req.destroy();},10000);timer.unref?.();
    try {
      for await(const chunk of req){bytes+=chunk.length;if(bytes>300000){send(413,{error:'Input exceeds 300 KB.'});return;}chunks.push(chunk);}
      const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const pattern=service.generate(input);send(200,{pattern});
    }catch(error){send(400,{error:error instanceof Error?error.message:String(error)});}finally{clearTimeout(timer);}
  }}));
}
