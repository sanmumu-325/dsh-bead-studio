import {randomUUID} from 'node:crypto';
export function aiEditRequest(input) {
  const styles={faithful:'Preserve the identity, face proportions, pose, and distinctive markings of the supplied subject. Simplify fine texture and shading without inventing a different subject.',cute:'Simplify into a cute, compact character while retaining the supplied subject\'s recognizable face, silhouette and distinctive markings.',outline:'Create a clean simplified illustration with strong readable contours, large flat color areas and clearly separated adjacent regions.'};
  if(!input||!Object.hasOwn(styles,input.style)||!['keep','white'].includes(input.background))throw Error('Invalid AI style or background option.');
  if(!Number.isInteger(input.width)||input.width<8||input.width>128||!Number.isInteger(input.maxColors)||input.maxColors<2||input.maxColors>32)throw Error('Invalid target bead dimensions or color limit.');
  const notes=input.notes??'';if(typeof notes!=='string'||notes.length>500)throw Error('Notes must be at most 500 characters.');
  return ['Edit the provided reference image into an illustration suitable for a bead-art pattern. Do not generate an unrelated image.','Return only the finished illustration: no bead grid, coordinates, color codes, material lists, text labels, fake transparency checkerboard or mockup.',styles[input.style],input.background==='white'?'Remove distracting surroundings and place the subject on a clean solid white background. This is a redraw, not lossless background removal.':'Keep the meaningful composition and simplify the background so it does not compete with the main subject.',`The final bead pattern will be approximately ${input.width} cells wide, with at most ${input.maxColors} colors. Make details readable at that scale. Use large color regions, little shading, avoid fine hair strands and isolated dots. The application, not you, will perform exact pixel quantization and counting.`,notes?'Additional user art direction: '+notes:''].filter(Boolean).join('\n');
}
export function parseAiInput(dataUrl) {
  if(typeof dataUrl!=='string'||dataUrl.length>6*1024*1024||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl))throw Error('Supply one PNG data URL, at most 6 MiB.');
  const base64=dataUrl.slice('data:image/png;base64,'.length),bytes=Buffer.from(base64,'base64');
  if(bytes.toString('base64')!==base64||bytes.length<33||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.toString('ascii',12,16)!=='IHDR')throw Error('Invalid PNG image.');
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);if(width<1||height<1||width>1024||height>1024)throw Error('AI input must be resized to at most 1024 pixels on each side.');
  return {bytes,mediaType:'image/png',width,height};
}
export class AiStudioService {
  constructor(adapter,{now=()=>Date.now(),id=()=>randomUUID(),timeout=300000,ttl=600000}={}){this.adapter=adapter;this.now=now;this.id=id;this.timeout=timeout;this.ttl=ttl;this.jobs=new Map();this.closed=false;}
  async status(provider='codex'){if(!['codex','custom'].includes(provider))throw Error('Unknown image provider.');const state=await this.adapter.status(provider);return{...state,provider,maxInputSide:1024,quota:'unknown',experimental:true};}
  sweep(){for(const [id,j] of this.jobs)if(!j.executing&&j.state!=='running'&&this.now()-j.finishedAt>this.ttl)this.jobs.delete(id);}
  view(job){return{id:job.id,state:job.state,engine:job.engine,model:job.model,...(job.error?{error:job.error}:{}),...(job.state==='succeeded'?{imageDataUrl:job.imageDataUrl}:{})};}
  async start(input){
    if(this.closed)throw Error('AI service is closed.');this.sweep();const prompt=aiEditRequest(input),image=parseAiInput(input.imageDataUrl);
    if([...this.jobs.values()].some(j=>j.executing))throw Error('An AI image request is already running. Wait for it or cancel it.');
    const provider=input.provider??'codex';const state=await this.status(provider);if(provider==='custom'&&(!input.configRevision||input.configRevision!==state.revision))throw Error('API configuration changed. Refresh it and confirm the destination again.');if(!state.available)throw Error(state.reason||'No supported image-editing provider is configured.');
    if(this.closed||[...this.jobs.values()].some(j=>j.executing))throw Error('An AI operation is already running or the service closed.');
    if(this.jobs.size>=8)throw Error('Too many retained AI results. Please wait ten minutes before requesting another.');
    const job={id:this.id(),provider,sessionId:input.sessionId,state:'running',executing:true,engine:state.engine,model:state.model,controller:new AbortController(),finishedAt:0};this.jobs.set(job.id,job);
    const timer=setTimeout(()=>{if(job.state==='running'){job.state='failed';job.error='AI request timed out. The provider may have charged quota; it was not retried.';job.finishedAt=this.now();job.controller.abort();}},this.timeout);
    job.promise=Promise.resolve().then(()=>{if(this.closed||job.state!=='running'||job.controller.signal.aborted)return;return this.adapter.edit({image,prompt,provider,configRevision:input.configRevision,model:state.model,sessionId:input.sessionId,signal:job.controller.signal});}).then(result=>{if(job.state!=='running'||this.closed)return;if(typeof result?.imageDataUrl!=='string'||result.imageDataUrl.length>24*1024*1024||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(result.imageDataUrl))throw Error('The AI provider did not return a supported image.');job.imageDataUrl=result.imageDataUrl;job.state='succeeded';}).catch(e=>{if(job.state==='running'){job.state='failed';job.error=e.publicMessage||'AI request failed. No automatic retry was made; provider quota may already have been used.';}}).finally(()=>{clearTimeout(timer);job.executing=false;job.finishedAt=this.now();});
    return this.view(job);
  }
  poll(id){this.sweep();const job=this.jobs.get(id);if(!job)throw Error('AI job not found or expired.');return this.view(job);}
  cancel(id){const job=this.jobs.get(id);if(!job)throw Error('AI job not found or expired.');if(job.state==='running'){job.state='cancelled';job.finishedAt=this.now();job.controller.abort();}else if(job.state==='succeeded'){job.state='cancelled';job.finishedAt=this.now();}delete job.imageDataUrl;return this.view(job);}
  async close(){this.closed=true;for(const job of this.jobs.values())if(job.state==='running')this.cancel(job.id);this.jobs.clear();}
}
