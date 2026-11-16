import {randomUUID} from 'node:crypto';

const TOOL='codex_image_generate';
const SOURCE='bead-studio-ai';
const MEDIA=new Set(['image/png','image/jpeg','image/webp','image/gif']);
class AdapterError extends Error {constructor(code,message){super(message);this.code=code;this.publicMessage=message;}}
function publicError(code,message){return new AdapterError(code,message);}
const CANCELLED='图像任务已取消。远端任务可能已开始；请先检查所选对话，不要自动重试。';
const FAILURE='Codex 图像任务未完成，可能被权限、设置、登录、额度或网络限制拒绝。请检查订阅设置和所选对话；不会自动重试或切换模型。';
const UNCERTAIN='图像可能已经生成，但结果读取或记录保存失败。请检查所选对话或 Codex 图片记录，不要直接重复生成。';

/** Uses a real selected root Agent and the complete standard tool pipeline.
 * Caller must obtain explicit consent BEFORE edit: source and result are saved
 * in the selected conversation. status means capability mounted, not signed-in
 * or quota available. No model override, login, retry or alternate engine.
 */
export function createCodexAdapter(ctx){
  const running=new Set();
  function roots(){
    const values=ctx.agents?.roots?.();
    if(!Array.isArray(values))return [];
    return values.filter(agent=>typeof agent?.id==='string' && agent.session && ctx.agents.get(agent.id)===agent);
  }
  function ready(){return typeof ctx.agents?.withInitiator==='function' && typeof ctx.tools?.execute==='function' && typeof ctx.attachments?.saveImage==='function' && typeof ctx.attachments?.readImage==='function' && typeof ctx.sessions?.flush==='function';}
  function status(){
    try{return{available:ready()&&!!ctx.tools.get?.(TOOL),engine:'Codex image',model:'configured',sessions:roots().slice(-100).reverse().map(agent=>{let title;try{title=ctx.get?.('sessionTitle')?.get(agent.session)?.title;}catch{}return{id:agent.id,label:(title?String(title).slice(0,100)+' · ':'')+agent.id};})};}
    catch{return{available:false,engine:'Codex image',model:'configured',sessions:[]};}
  }
  async function edit({image,prompt,model,sessionId,signal=new AbortController().signal}={}){
    let agent,started=false,initialRecorded=false,completionAttempted=false,toolSucceeded=false;
    const callId=`bead-ai-${randomUUID()}`;
    const check=()=>{if(signal.aborted)throw publicError('CANCELLED',CANCELLED);};
    async function record(text,attachment){
      agent.session.append('user/message',{id:randomUUID(),role:'user',source:{kind:SOURCE},content:[{type:'text',text},...(attachment?[{type:'image',attachment}]:[])]},{surfaceOp:'append'});
      await ctx.sessions.flush(agent.session);
    }
    try{
      if(!signal || typeof signal.aborted!=='boolean' || typeof signal.addEventListener!=='function')throw publicError('INVALID_INPUT','无效的取消信号。');
      check();
      if(!ready())throw publicError('UNAVAILABLE','当前环境未提供完整的 Codex 图像工具、附件或真实会话服务。');
      if(typeof sessionId!=='string'||!sessionId)throw publicError('SESSION_REQUIRED','请明确选择保存参考图的真实会话。');
      agent=roots().find(a=>a.id===sessionId);
      if(!agent||typeof agent.session.append!=='function')throw publicError('SESSION_UNAVAILABLE','所选会话已关闭或不是可选的根会话，请重新选择。');
      if(!ctx.tools.get?.(TOOL,agent))throw publicError('UNAVAILABLE','所选会话当前没有可用的 Codex 图像工具。');
      if(running.has(sessionId))throw publicError('BUSY','所选会话已有拼豆图像任务，请等待完成或取消。');
      if(model!==undefined&&model!=='configured')throw publicError('MODEL_UNSUPPORTED','此入口仅使用已配置的 Codex 图像模型，不接受单次模型覆盖。');
      if(typeof prompt!=='string'||!prompt.trim()||prompt.length>8000)throw publicError('INVALID_INPUT','图像请求应为 1–8000 字符的非空文本。');
      if(!image||!(image.bytes instanceof Uint8Array)||!image.bytes.byteLength||!MEDIA.has(image.mediaType)||!Number.isInteger(image.width)||!Number.isInteger(image.height)||image.width<1||image.height<1||image.width*image.height>20000000)throw publicError('INVALID_INPUT','请输入有效的 PNG、JPEG、WebP 或 GIF 参考图。');
      const cap=Math.min(20*1024*1024,ctx.attachments.imageLimits?.maxImageBytes??Infinity);
      if(image.bytes.byteLength>cap)throw publicError('INVALID_INPUT','参考图超过附件大小限制。');
      running.add(sessionId);started=true;
      const source=await ctx.attachments.saveImage({data:new Uint8Array(image.bytes),mediaType:image.mediaType,name:'bead-source'});
      check();
      if(ctx.agents.get(sessionId)!==agent || !roots().includes(agent))throw publicError('SESSION_UNAVAILABLE','所选会话已关闭，请重新选择。');
      // This is authentic user-authorized plugin context, not a synthetic model
      // answer or a fabricated tool call/result pair. append does not start LLM.
      agent.session.append('user/message',{id:randomUUID(),role:'user',source:{kind:SOURCE},content:[{type:'text',text:`[拼豆工作台独立图像任务 ${callId}] 用户已同意将参考图及结果保存在此对话。本任务已交给工作台直接调用 Codex 图像工具，不调用聊天模型，不要求聊天助手执行或重复生成。\n请求：${prompt}`},{type:'image',attachment:source}]},{surfaceOp:'append'});
      initialRecorded=true;
      await ctx.sessions.flush(agent.session);
      check();
      if(ctx.agents.get(sessionId)!==agent)throw publicError('SESSION_UNAVAILABLE','所选会话已关闭，请重新选择。');
      const result=await ctx.agents.withInitiator(agent,()=>ctx.tools.execute({callId,name:TOOL,arguments:{prompt,referenceImages:[{attachmentId:source.attachmentId}]},agent,signal}));
      check();
      if(!result || result.isError!==false)throw publicError('IMAGE_FAILED',FAILURE);
      toolSucceeded=true;
      // Read finalized visible content, never raw value, arbitrary URL or path.
      const images=Array.isArray(result.content)?result.content.filter(block=>block?.type==='image'&&block.attachment):[];
      if(images.length!==1)throw publicError('RESULT_UNAVAILABLE',UNCERTAIN);
      const ref=images[0].attachment;
      const stored=await ctx.attachments.readImage(ref,signal);
      check();
      if(!(stored?.data instanceof Uint8Array)||!stored.data.byteLength||!MEDIA.has(stored.ref?.mediaType))throw publicError('RESULT_UNAVAILABLE',UNCERTAIN);
      completionAttempted=true;
      await record(`[拼豆工作台独立图像任务 ${callId} 已完成] 此图由工作台通过正式 Codex 图像工具生成，未调用聊天模型。本任务已完成，不要再次执行或重复生成。`,stored.ref);
      check();
      return{imageDataUrl:`data:${stored.ref.mediaType};base64,${Buffer.from(stored.data).toString('base64')}`};
    }catch(error){
      const safe=signal?.aborted?publicError('CANCELLED',CANCELLED):error instanceof AdapterError?publicError(error.code,error.publicMessage):publicError(toolSucceeded?'RESULT_UNAVAILABLE':'IMAGE_FAILED',toolSucceeded?UNCERTAIN:FAILURE);
      if(initialRecorded&&!completionAttempted){
        try{await record(`[拼豆工作台独立图像任务 ${callId} ${safe.code==='CANCELLED'?'已取消':'未完成'}] ${safe.publicMessage} 此为插件状态记录，不要求聊天助手执行该任务。`);}
        catch{throw publicError('RECEIPT_FAILED','图像任务的状态记录未能保存；结果可能已经生成。请检查所选对话，不要自动重复调用。');}
      }else if(completionAttempted&&!signal?.aborted){throw publicError('RECEIPT_FAILED',UNCERTAIN);}
      throw safe;
    }finally{if(started)running.delete(sessionId);}
  }
  return{status,edit};
}
