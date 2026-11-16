import {lookup as dnsLookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {request as httpsRequest} from 'node:https';

export class ImageApiError extends Error {
  constructor(code,message){super(message);this.name='ImageApiError';this.code=code;this.publicMessage=message;}
}
const fail=(code,message)=>new ImageApiError(code,message);
const cancelled=()=>fail('CANCELLED','请求已取消；服务商可能已开始处理并计费，本应用不会自动重试。');

export const MAX_ERROR_BYTES=8192;
/** Untrusted error fields select only a fixed local category/message. Never
 * interpolate upstream codes, messages, parameter names, headers or URLs.
 */
export function classifyHttpError(status,body){
  const valid=Number.isInteger(status)&&status>=100&&status<=599;
  let code='',type='',param='',message='';
  if(body instanceof Uint8Array&&body.length<=MAX_ERROR_BYTES){
    try{
      const error=JSON.parse(Buffer.from(body).toString('utf8'))?.error;
      const field=(key,limit)=>typeof error?.[key]==='string'&&error[key].length<=limit?error[key].toLowerCase():'';
      code=field('code',100);type=field('type',100);message=field('message',2048);
      const candidate=field('param',40);if(['model','image','prompt','n','size','quality','response_format','mask'].includes(candidate))param=candidate;
    }catch{/* Non-JSON and truncated responses retain only the status category. */}
  }
  const tokens=[code,type];
  const has=(...allowed)=>tokens.some(value=>allowed.includes(value));
  let category='unknown',advice='请检查基础地址、模型名称与服务商文档。';
  if(valid&&status>=300&&status<400){category='redirect';advice='已拒绝重定向，请直接配置最终的 HTTPS API 基础地址。';}
  else if(status===401||status===403||has('invalid_api_key','authentication_error','permission_denied','unauthorized','forbidden')||/invalid.{0,40}api.?key|incorrect.{0,40}api.?key|unauthori[sz]ed|permission denied|密钥.{0,30}无效|权限不足/.test(message)){category='authentication';advice='密钥认证失败或没有访问权限。请检查密钥、账户权限和服务商配置。';}
  else if(status===429||has('insufficient_quota','quota_exceeded','rate_limit_exceeded','billing_hard_limit_reached','billing_not_active')||/insufficient quota|quota exceeded|rate limit|余额不足|额度不足|请求过于频繁/.test(message)){category='quota';advice='额度不足或触发请求频率限制。请检查余额、额度和频率限制。';}
  else if(has('model_not_found','invalid_model','model_not_supported')||(param==='model'&&has('invalid_parameter','invalid_value'))||/model.{0,100}(not found|does not exist|not exist|not supported|unsupported|invalid)|invalid model|unsupported model|模型.{0,40}(不存在|无效|不支持)/.test(message)){category='invalid_model';advice='模型不存在、不可用或不支持当前请求。请重新读取模型列表并明确选择；模型列表不保证支持图像编辑。';}
  else if(has('missing_required_parameter','missing_parameter','required_parameter_missing')||/missing.{0,40}(parameter|field|argument)|required.{0,40}(parameter|field).{0,40}missing|.{1,40} is required|缺少.{0,30}(参数|字段)|必填.{0,30}(参数|字段)/.test(message)){category='missing_parameter';advice='请求缺少服务商要求的参数。请检查其图像编辑接口文档；应用不会猜测参数或重复提交。';}
  else if(status===415||has('unsupported_format','unsupported_image_format','invalid_image_format','unsupported_media_type')||/unsupported.{0,40}(format|media type|file type)|invalid image format|不支持.{0,30}(格式|文件类型)/.test(message)){category='unsupported_format';advice='图像格式或请求内容类型不被支持。请确认该接口接受 multipart PNG 图像编辑请求。';}
  else if(has('unknown_parameter','unsupported_parameter','unsupported_value')||/unknown.{0,30}(parameter|argument|field)|unrecognized.{0,30}(parameter|argument|field)|unsupported.{0,30}(parameter|argument|field)|参数.{0,30}不支持|未知参数/.test(message)){category='unsupported_parameter';advice='服务商不支持当前请求中的参数或参数值。请检查接口协议；应用不会擅自删改参数后重试。';}
  else if(status===404||status===405||status===501||has('endpoint_not_found','unsupported_endpoint','method_not_allowed','not_implemented')||/endpoint.{0,40}(not found|not supported)|images\/edits.{0,40}(not supported|not found)|不支持.{0,30}编辑接口/.test(message)){category='unsupported_endpoint';advice='请求的接口不存在或未开放。请检查基础地址以及服务商是否提供所需的 /models 或 /images/edits 接口。';}
  const result=fail('HTTP_ERROR',`${valid?`服务返回 HTTP ${status}。`:'服务返回无效 HTTP 状态。'}${advice}本应用不会自动重试或切换模型。`);
  result.category=category;if(valid)result.status=status;
  return result;
}

/** Conservative public-unicast allowlist. Transition, mapped, reserved and
 * documentation networks are rejected, even where a narrow exception exists.
 */
export function isPublicAddress(address){
  if(typeof address!=='string'||address.includes('%'))return false;
  const family=isIP(address);
  if(family===4){
    const [a,b,c]=address.split('.').map(Number);
    return !(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||(b===0&&(c===0||c===2))||(b===88&&c===99)))||(a===198&&(b===18||b===19||(b===51&&c===100)))||(a===203&&b===0&&c===113));
  }
  if(family!==6)return false;
  const halves=address.toLowerCase().split('::');
  const left=halves[0]?halves[0].split(':'):[],right=halves[1]?halves[1].split(':'):[];
  if([...left,...right].some(x=>x.includes('.')))return false;
  const words=halves.length===2?[...left,...Array(8-left.length-right.length).fill('0'),...right]:left;
  const [a,b]=words.map(x=>Number.parseInt(x,16));
  // Only 2000::/3, excluding IETF protocol assignments, documentation and 6to4.
  return a>=0x2000&&a<=0x3fff&&!(a===0x2001&&(b<0x200||b===0xdb8))&&a!==0x2002&&!(a===0x3fff&&b<0x1000);
}

export function publicHttpsUrl(value,{allowQuery=false}={}){
  let url;
  try{if(typeof value!=='string'||value.length>8192||!/^https:\/\//i.test(value)||/[\\\u0000-\u0020\u007f]/.test(value))throw Error();url=new URL(value);}catch{throw fail('INVALID_URL','请输入有效的公网 HTTPS 地址。');}
  if(url.protocol!=='https:'||url.username||url.password||value.match(/^https:\/\/([^/?#]*)/i)?.[1].includes('@')||value.includes('#')||(!allowQuery&&value.includes('?')))throw fail('INVALID_URL','地址必须使用 HTTPS，且不能包含账号、密码、片段；API 基础地址不能包含查询参数。');
  const hostname=url.hostname.replace(/^\[|\]$/g,'').replace(/\.$/,'').toLowerCase();
  if(!hostname||hostname==='localhost'||/\.(localhost|local|internal|lan|home)$/.test(hostname)||(!isIP(hostname)&&!hostname.includes('.'))||(isIP(hostname)&&!isPublicAddress(hostname)))throw fail('UNSAFE_ADDRESS','仅允许公网 HTTPS 地址，不能访问本机、内网或保留地址。');
  return url;
}

function untilAbort(promise,signal){
  return new Promise((resolve,reject)=>{
    if(signal.aborted){reject(signal.reason);return;}
    const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});
    Promise.resolve(promise).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
  });
}

/** Test seams replace DNS and native HTTPS, never weaken address policy.
 * DNS is validated once and pinned through lookup; fresh agent=false prevents
 * reuse of sockets resolved elsewhere. No proxy/environment or redirect layer.
 */
export function createSafeTransport({lookup=dnsLookup,request=httpsRequest}={}){
  return async function transfer(address,{method='GET',headers={},body,signal,maxBytes=24*1024*1024,timeoutMs=120000}={}){
    let timer,abortListener;
    const controller=new AbortController();
    try{
      const url=publicHttpsUrl(address,{allowQuery:true});
      if(!['GET','POST'].includes(method)||!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>24*1024*1024||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>300000)throw fail('INVALID_REQUEST','请求参数无效。');
      if(signal?.aborted)throw cancelled();
      abortListener=()=>controller.abort(cancelled());signal?.addEventListener('abort',abortListener,{once:true});
      timer=setTimeout(()=>controller.abort(fail('TIMEOUT','图像请求超时；服务商可能已经计费，本应用不会自动重试。')),timeoutMs);
      const active=controller.signal;
      const hostname=url.hostname.replace(/^\[|\]$/g,'').replace(/\.$/,'');
      const literalFamily=isIP(hostname);
      const addresses=literalFamily?[{address:hostname,family:literalFamily}]:await untilAbort(lookup(hostname,{all:true,verbatim:true}),active);
      if(!Array.isArray(addresses)||addresses.length===0||addresses.length>64||addresses.some(x=>!isPublicAddress(x.address)||isIP(x.address)!==x.family))throw fail('UNSAFE_ADDRESS','域名解析包含非公网地址，已拒绝连接。');
      if(active.aborted)throw active.reason;
      const pinned=addresses[0];
      const safeHeaders={...headers,'Accept-Encoding':'identity'};
      return await new Promise((resolve,reject)=>{
        let req,done=false,abort;
        const finish=(error,value)=>{if(done)return;done=true;active.removeEventListener('abort',abort);if(error){req?.destroy();reject(error);}else resolve(value);};
        abort=()=>finish(active.reason);active.addEventListener('abort',abort,{once:true});
        if(active.aborted){abort();return;}
        try{
          req=request(url,{method,headers:safeHeaders,agent:false,maxHeaderSize:16384,rejectUnauthorized:true,servername:literalFamily?'':hostname,lookup(_host,options,callback){
            if(active.aborted){callback(active.reason);return;}
            if(options?.all)callback(null,[{...pinned}]);else callback(null,pinned.address,pinned.family);
          }},res=>{
            const status=res.statusCode;
            const rejectResponse=error=>{res.destroy();finish(error);};
            if(!Number.isInteger(status)||status<200||status>=300){
              // Redirects and compressed/oversized errors are refused without
              // reading their bodies. Ordinary errors admit at most 8 KiB.
              const length=res.headers['content-length'],encoding=res.headers['content-encoding'];
              if(!Number.isInteger(status)||status<400||status>599||(encoding&&encoding!=='identity')||(length!==undefined&&(!/^\d+$/.test(String(length))||Number(length)>MAX_ERROR_BYTES))){rejectResponse(classifyHttpError(status));return;}
              const chunks=[];let total=0;
              res.on('data',chunk=>{if(done)return;total+=chunk.length;if(total>MAX_ERROR_BYTES){rejectResponse(classifyHttpError(status));return;}chunks.push(Buffer.from(chunk));});
              res.on('end',()=>{if(!done)rejectResponse(classifyHttpError(status,Buffer.concat(chunks,total)));});
              res.on('error',()=>finish(classifyHttpError(status)));
              res.on('aborted',()=>finish(classifyHttpError(status)));
              return;
            }
            const encoding=res.headers['content-encoding'];
            if(encoding&&encoding!=='identity'){rejectResponse(fail('ENCODING_UNSUPPORTED','图像服务返回了不支持的压缩响应。'));return;}
            const length=res.headers['content-length'];
            if(length!==undefined&&(!/^\d+$/.test(String(length))||Number(length)>maxBytes)){rejectResponse(fail('RESPONSE_TOO_LARGE','图像服务响应超过大小限制。'));return;}
            const chunks=[];let total=0;
            res.on('data',chunk=>{if(done)return;const bytes=Buffer.from(chunk);total+=bytes.length;if(total>maxBytes){rejectResponse(fail('RESPONSE_TOO_LARGE','图像服务响应超过大小限制。'));return;}chunks.push(bytes);});
            res.on('end',()=>{if(!done)finish(null,{status,body:Buffer.concat(chunks,total)});});
            res.on('error',()=>finish(fail('NETWORK_ERROR','图像服务连接中断；不会自动重试。')));
            res.on('aborted',()=>finish(fail('NETWORK_ERROR','图像服务响应中断；不会自动重试。')));
          });
          req.on('error',()=>finish(active.aborted?active.reason:fail('NETWORK_ERROR','无法安全连接图像服务，请检查 HTTPS 证书、网络与地址；不会自动重试。')));
          req.end(body);
        }catch{finish(fail('NETWORK_ERROR','无法建立图像服务请求；不会自动重试。'));}
      });
    }catch(error){throw error instanceof ImageApiError?error:fail('NETWORK_ERROR','图像服务网络检查失败；不会自动重试。');}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',abortListener);}
  };
}
