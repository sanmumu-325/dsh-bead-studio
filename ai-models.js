import {normalizeApiBaseUrl} from './ai-custom-adapter.js';
import {createSafeTransport,ImageApiError} from './ai-http.js';

export const MAX_MODELS_BYTES=2*1024*1024;
export const MAX_MODELS=500;
const fail=(code,message)=>new ImageApiError(code,message);
const controls=/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/;

function secretMatcher(key){
  const base64=Buffer.from(key,'ascii').toString('base64');
  const secrets=new Set([key,base64,base64.replace(/=+$/,''),Buffer.from(key,'ascii').toString('base64url')]);
  // Percent-decoding catches both encodeURIComponent and fully %-encoded keys,
  // including encoded base64. A second level also handles common double encoding.
  return id=>{
    let candidate=id;
    for(let i=0;i<3;i++){
      if([...secrets].some(secret=>candidate.includes(secret)))return true;
      for(const encoded of new Set([candidate,...candidate.split(/[-_.:]/)])){
        if(/^[A-Za-z0-9+/_=-]+$/.test(encoded)&&encoded.length>=4){
          const decoded=Buffer.from(encoded,'base64').toString('utf8');
          if(decoded.includes(key))return true;
        }
      }
      const decoded=candidate.replace(/%([0-9a-f]{2})/gi,(_match,hex)=>String.fromCharCode(Number.parseInt(hex,16)));
      if(decoded===candidate)return false;candidate=decoded;
    }
    return false;
  };
}

/** Explicit model-list request, not a model/format/edit capability probe.
 * The caller owns user consent and the atomic baseUrl/key configuration snapshot.
 * No model inference can cause a generation request or an automatic selection.
 */
export async function discoverApiModels({baseUrl,apiKey,signal}={}, {transport=createSafeTransport()}={}){
  try{
    const base=normalizeApiBaseUrl(baseUrl);
    if(typeof apiKey!=='string'||!apiKey||apiKey.length>4096||/[^\x21-\x7e]/.test(apiKey))throw fail('INVALID_CONFIG','请配置有效的 ASCII API 密钥（最多 4096 字符，不含空白或控制字符）。');
    if(signal?.aborted)throw fail('CANCELLED','模型列表读取已取消，不会自动重试。');
    const response=await transport(`${base}/models`,{method:'GET',headers:{Authorization:`Bearer ${apiKey}`,Accept:'application/json'},signal,maxBytes:MAX_MODELS_BYTES,timeoutMs:30000});
    if(signal?.aborted)throw fail('CANCELLED','模型列表读取已取消，不会自动重试。');
    if(!(response?.body instanceof Uint8Array)||response.body.length>MAX_MODELS_BYTES)throw fail('INVALID_MODELS_RESPONSE','模型列表响应为空、过大或格式无效。');
    let payload;try{payload=JSON.parse(Buffer.from(response.body).toString('utf8'));}catch{throw fail('INVALID_MODELS_RESPONSE','模型接口未返回有效 JSON。请检查基础地址及 /models 接口。');}
    if(!Array.isArray(payload?.data))throw fail('INVALID_MODELS_RESPONSE','模型接口应返回包含 data 数组的 JSON；未读取到支持的模型列表。');
    const leaksSecret=secretMatcher(apiKey),seen=new Set(),models=[];
    let truncated=payload.has_more===true;
    for(const row of payload.data){
      const raw=row?.id;
      if(typeof raw!=='string'||raw.length>200||controls.test(raw))continue;
      if(raw!==raw.trim())continue;
      const id=raw;if(!id||seen.has(id)||leaksSecret(id))continue;
      seen.add(id);
      if(models.length>=MAX_MODELS){truncated=true;break;}
      models.push({id,imageCandidate:/image|flux|dall-e|imagen|sdxl|stable-diffusion/i.test(id),editingVerified:false});
    }
    return{models,truncated};
  }catch(error){
    if(error instanceof ImageApiError)throw error;
    throw fail('MODELS_REQUEST_FAILED','模型列表读取失败。请检查地址、密钥权限和网络；不会自动重试或生成图片。');
  }
}
