// Same-origin API only. No returned URL is ever fetched.
export async function beadAiPost(body) {
  const response=await fetch('/api/local-bead-studio/ai',{method:'POST',headers:{'Content-Type':'application/json','X-DSH-Bead-Studio':'1'},body:JSON.stringify(body)});
  const data=await response.json();if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);return data;
}
export async function encodeBeadAiSource(source) {
  if(!source||!Number.isInteger(source.width)||!Number.isInteger(source.height)||source.width<1||source.height<1||source.data?.length!==source.width*source.height*4)throw new Error('Invalid source image');
  const input=document.createElement('canvas');input.width=source.width;input.height=source.height;
  const context=input.getContext('2d'),pixels=context.createImageData(source.width,source.height);
  pixels.data.set(source.data);context.putImageData(pixels,0,0);
  const ratio=Math.min(1,1024/Math.max(source.width,source.height)),output=document.createElement('canvas');
  output.width=Math.max(1,Math.round(source.width*ratio));output.height=Math.max(1,Math.round(source.height*ratio));
  output.getContext('2d').drawImage(input,0,0,output.width,output.height);return output.toDataURL('image/png');
}
export function beadAiImageBytes(url) {
  if(typeof url!=='string'||url.length>40*1024*1024)throw new Error('Invalid AI image');
  const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(url);
  if(!match||match[2].length%4!==0)throw new Error('Expected PNG, JPEG or WebP data URL');
  const raw=atob(match[2]),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0)),is=(offset,values)=>values.every((n,i)=>bytes[offset+i]===n);
  const valid=match[1]==='png'?is(0,[137,80,78,71,13,10,26,10]):match[1]==='jpeg'?is(0,[255,216,255]):is(0,[82,73,70,70])&&is(8,[87,69,66,80]);
  if(!valid)throw new Error('Image signature does not match its type');return {bytes,type:'image/'+match[1]};
}
export async function decodeBeadAiImage(url) {
  const {bytes,type}=beadAiImageBytes(url),bitmap=await createImageBitmap(new Blob([bytes],{type}));
  try{
    if(bitmap.width<1||bitmap.height<1||bitmap.width*bitmap.height>20000000)throw new Error('AI image exceeds 20 million pixels');
    const c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;const g=c.getContext('2d');g.drawImage(bitmap,0,0);return g.getImageData(0,0,c.width,c.height);
  }finally{bitmap.close();}
}

// Keep only public configuration metadata, even if a buggy server returns extra fields.
export function beadAiPublicConfig(value={}) {
  return {baseUrl:typeof value.baseUrl==='string'?value.baseUrl:'',model:typeof value.model==='string'?value.model:'',endpoint:typeof value.endpoint==='string'?value.endpoint:'',hasKey:!!value.hasKey,revision:typeof value.revision==='string'?value.revision:'',keyStorage:'host-credentials'};
}
export async function saveBeadAiConfig({baseUrl,model,apiKey='',config,clearKey=()=>{}},post=beadAiPost) {
  try{
    if(baseUrl!==config.baseUrl&&!apiKey.trim())throw new Error('A new API key is required when changing the base URL');
    return beadAiPublicConfig(await post({action:'custom_save',baseUrl,model,...(apiKey?{apiKey}:{}),expectedRevision:config.revision}));
  }finally{clearKey();}
}

export async function readBeadAiModels({baseUrl,apiKey='',config},post=beadAiPost) {
  if(baseUrl!==config.baseUrl&&!apiKey.trim())throw new Error('A new API key is required when changing the base URL');
  const result=await post({action:'custom_models',baseUrl,...(apiKey?{apiKey}:{}),expectedRevision:config.revision});
  if(!Array.isArray(result.models))throw new Error('No model list was returned; you can enter a model manually');
  const seen=new Set(),models=[];
  for(const item of result.models){if(typeof item?.id!=='string'||!item.id||seen.has(item.id))continue;seen.add(item.id);models.push({id:item.id,imageCandidate:item.imageCandidate===true,editingVerified:false});}
  return {models,truncated:result.truncated===true};
}

export function createBeadAiController({post=beadAiPost,encode=encodeBeadAiSource,decode=decodeBeadAiImage,onChange=()=>{},onBusyChange=()=>{},now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout}={}) {
  let state={provider:'codex',status:null,phase:'idle',candidate:null,error:'',pendingStart:false},active=null,disposed=false,statusVersion=0;
  const snapshot=()=>({...state,busy:!!active||state.pendingStart});
  let reportedBusy=false;
  function emit(patch={}){state={...state,...patch};const value=snapshot();if(!disposed){onChange(value);if(value.busy!==reportedBusy){reportedBusy=value.busy;onBusyChange(value.busy);}}}
  const valid=job=>!disposed&&active===job;
  function clear(job){if(job?.timer!==undefined)clearTimer(job.timer);if(job?.deadlineTimer!==undefined)clearTimer(job.deadlineTimer);}
  function remoteCancel(job){if(!job.id||job.cancelSent)return;job.cancelSent=true;Promise.resolve().then(()=>post({action:'cancel',id:job.id})).catch(()=>{});}
  function cancel(phase='cancelled') {const job=active;active=null;clear(job);if(job){job.cancelled=true;remoteCancel(job);}emit({phase,candidate:null,error:''});}
  function fail(job,error){if(!valid(job))return;active=null;clear(job);job.cancelled=true;remoteCancel(job);emit({phase:'failed',candidate:null,error:String(error?.message||error)});}
  async function accept(job,result){
    if(result?.id&&!job.id)job.id=result.id;
    if(!valid(job)){if(job.cancelled)remoteCancel(job);return;}
    if(result.state==='failed'){fail(job,result.error||'AI generation failed');return;}
    if(result.state==='succeeded'){
      try{const image=await decode(result.imageDataUrl);if(!valid(job))return;active=null;clear(job);emit({phase:'succeeded',candidate:image,error:''});}catch(e){fail(job,e);}return;
    }
    if(result.state!=='running'||!job.id){fail(job,'Invalid AI job response');return;}
    if(now()-job.started>=360000){fail(job,'AI generation timed out');return;}
    emit({phase:'running'});
    job.timer=setTimer(async()=>{if(!valid(job))return;try{await accept(job,await post({action:'poll',id:job.id}));}catch(e){fail(job,e);}},2000);
  }
  return {
    snapshot,
    async status(provider=state.provider){
      if(!['codex','custom'].includes(provider)||disposed)return;
      const version=++statusVersion;if(provider!==state.provider){cancel('idle');emit({provider,status:null});}
      try{const result=await post({action:'status',provider});if(!disposed&&version===statusVersion){if(state.status&&(state.status.endpoint!==result.endpoint||state.status.revision!==result.revision))cancel('idle');emit({status:result});}}
      catch(e){if(!disposed&&version===statusVersion)emit({status:{available:false,reason:String(e.message||e)}});}
    },
    async start({source,consent,sessionId,provider=state.provider,style='faithful',background='keep',notes='',width,maxColors}){
      if(disposed||active||state.pendingStart||!state.status?.available||!source||!consent)return false;
      if(provider!==state.provider)return false;
      if(provider==='codex'&&(typeof sessionId!=='string'||!sessionId||!state.status.sessions?.some(s=>s.id===sessionId)))return false;
      if(provider==='custom'&&typeof state.status.revision!=='string')return false;
      const route=provider==='custom'?{provider,configRevision:state.status.revision}:{provider,sessionId};
      if(!['faithful','cute','outline'].includes(style)||!['keep','white'].includes(background)||typeof notes!=='string'||notes.length>500)return false;
      const job={started:now(),cancelled:false};active=job;emit({phase:'preparing',candidate:null,error:''});
      job.deadlineTimer=setTimer(()=>fail(job,'AI generation timed out'),360000);
      try{
        const imageDataUrl=await encode(source);if(!valid(job))return false;
        emit({phase:'running',pendingStart:true});
        let result;try{result=await post({action:'start',...route,imageDataUrl,style,background,notes,width,maxColors});}
        finally{emit({pendingStart:false});}
        await accept(job,result);return true;
      }catch(e){fail(job,e);return false;}
    },
    cancel,
    reset(){cancel('idle');},
    adopt(callback){if(disposed||active||state.pendingStart||state.phase!=='succeeded'||!state.candidate)return false;const image=state.candidate;emit({phase:'adopted',candidate:null});callback(image);return true;},
    dispose(){disposed=true;cancel('idle');statusVersion++;if(reportedBusy){reportedBusy=false;onBusyChange(false);}}
  };
}
