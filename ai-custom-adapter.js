import {randomBytes} from 'node:crypto';
import {createSafeTransport,ImageApiError,publicHttpsUrl} from './ai-http.js';

export const MAX_IMAGE_BYTES=16*1024*1024;
export const MAX_JSON_BYTES=24*1024*1024;
const fail=(code,message)=>new ImageApiError(code,message);

export function normalizeApiBaseUrl(value){
  const url=publicHttpsUrl(value);
  url.pathname=url.pathname.replace(/\/+$/,'');
  return url.href.replace(/\/$/,'');
}
/** Pure formatting validation, not a connection, login or capability test. */
export function normalizeApiConfig(input){
  if(!input||typeof input!=='object')throw fail('INVALID_CONFIG','请先配置图像 API 地址、模型和密钥。');
  const baseUrl=normalizeApiBaseUrl(input.baseUrl);
  const model=typeof input.model==='string'?input.model.trim():'';
  const apiKey=typeof input.apiKey==='string'?input.apiKey.trim():'';
  if(!model||model.length>200||/[\u0000-\u001f\u007f]/.test(model))throw fail('INVALID_CONFIG','模型名称应为 1–200 字符，不包含控制字符。');
  if(!apiKey||apiKey.length>4096||/[^\x21-\x7e]/.test(apiKey))throw fail('INVALID_CONFIG','API 密钥应为非空 ASCII 文本，不包含空白或控制字符。');
  return{baseUrl,model,apiKey};
}

/** Recognize bounded raster containers, rejecting SVG/HTML/truncated headers.
 * This is structural admission, not a complete JPEG/WebP pixel decoder. The
 * workbench must still decode the raster before turning it into bead cells.
 */
export function inspectRaster(input){
  const data=Buffer.from(input);
  let mediaType,width,height;
  if(data.length<12||data.length>MAX_IMAGE_BYTES)throw fail('INVALID_IMAGE','返回的图像为空、过大或不是支持的位图。');
  if(data.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))){
    if(data.length<45||data.readUInt32BE(8)!==13||data.toString('ascii',12,16)!=='IHDR')throw fail('INVALID_IMAGE','返回的 PNG 结构无效。');
    width=data.readUInt32BE(16);height=data.readUInt32BE(20);mediaType='image/png';
    let pos=8,hasData=false,ended=false;
    while(pos+12<=data.length){
      const size=data.readUInt32BE(pos),type=data.toString('ascii',pos+4,pos+8);
      if(size>data.length-pos-12)break;
      if(type==='IDAT'&&size>0)hasData=true;
      if(type==='IEND'){ended=size===0&&pos+12===data.length;break;}
      pos+=size+12;
    }
    if(!hasData||!ended||![0,2,3,4,6].includes(data[25])||data[26]!==0||data[27]!==0||data[28]>1)throw fail('INVALID_IMAGE','返回的 PNG 不完整或结构无效。');
  }else if(data[0]===0xff&&data[1]===0xd8){
    if(data[data.length-2]!==0xff||data[data.length-1]!==0xd9)throw fail('INVALID_IMAGE','返回的 JPEG 不完整。');
    let pos=2,hasScan=false;
    const sof=new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
    while(pos+4<=data.length){
      if(data[pos++]!==0xff)break;
      while(data[pos]===0xff)pos++;
      const marker=data[pos++];
      if(marker===0xda){hasScan=true;break;}
      if(marker===0xd9||marker===0xd8||marker===0x00)break;
      if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
      if(pos+2>data.length)break;
      const size=data.readUInt16BE(pos);
      if(size<2||pos+size>data.length)break;
      if(sof.has(marker)&&size>=8){height=data.readUInt16BE(pos+3);width=data.readUInt16BE(pos+5);}
      pos+=size;
    }
    if(!hasScan||!width||!height)throw fail('INVALID_IMAGE','返回的 JPEG 结构无效。');
    mediaType='image/jpeg';
  }else if(data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP'){
    if(data.readUInt32LE(4)!==data.length-8)throw fail('INVALID_IMAGE','返回的 WebP 不完整。');
    let pos=12,hasPixels=false;
    while(pos+8<=data.length){
      const type=data.toString('ascii',pos,pos+4),size=data.readUInt32LE(pos+4),start=pos+8;
      if(size>data.length-start)throw fail('INVALID_IMAGE','返回的 WebP 结构无效。');
      if(type==='VP8 '&&size>=10&&data.subarray(start+3,start+6).equals(Buffer.from([0x9d,1,0x2a]))){width??=data.readUInt16LE(start+6)&0x3fff;height??=data.readUInt16LE(start+8)&0x3fff;hasPixels=true;}
      if(type==='VP8L'&&size>=5&&data[start]===0x2f){const bits=data.readUInt32LE(start+1);width??=(bits&0x3fff)+1;height??=((bits>>>14)&0x3fff)+1;hasPixels=true;}
      if(type==='VP8X'&&size===10){width=data.readUIntLE(start+4,3)+1;height=data.readUIntLE(start+7,3)+1;}
      pos=start+size+(size%2);
    }
    if(!hasPixels||pos!==data.length)throw fail('INVALID_IMAGE','返回的 WebP 结构无效。');
    mediaType='image/webp';
  }else throw fail('INVALID_IMAGE','图像服务必须返回真实 PNG、JPEG 或 WebP，不能返回 HTML、SVG 或其他文件。');
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>8192||height>8192||width*height>20000000)throw fail('INVALID_IMAGE','返回的图像尺寸无效或超过安全限制。');
  return{mediaType,width,height};
}

function multipart(image,model,prompt){
  const boundary=`bead-${randomBytes(24).toString('hex')}`;
  const parts=[];
  for(const [name,value]of Object.entries({model,prompt,n:'1'}))parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="source.png"\r\nContent-Type: image/png\r\n\r\n`),Buffer.from(image),Buffer.from(`\r\n--${boundary}--\r\n`));
  return{body:Buffer.concat(parts),contentType:`multipart/form-data; boundary=${boundary}`};
}

/** Only getConfig handles credentials. A local config snapshot and revision
 * bind consent to the exact destination/model/key, independent of conversations.
 * transport is an offline-test seam; production uses validated, pinned HTTPS.
 */
export function createCustomApiAdapter({getConfig,transport=createSafeTransport()}={}){
  async function snapshot(){
    const raw=await getConfig?.();
    if(!raw)return null;
    const config=normalizeApiConfig(raw);
    if(typeof raw.revision!=='string'||!raw.revision||raw.revision.length>128)throw fail('INVALID_CONFIG','图像配置版本无效，请重新保存设置。');
    return Object.freeze({...config,revision:raw.revision});
  }
  async function status(){
    try{const config=await snapshot();return config?{available:true,engine:'Custom image API',model:config.model,baseUrl:config.baseUrl,revision:config.revision}:{available:false,engine:'Custom image API',model:'',baseUrl:'',revision:'',reason:'请先配置自定义图像 API。'};}
    catch{return{available:false,engine:'Custom image API',model:'',baseUrl:'',revision:'',reason:'自定义图像 API 配置无效，请检查本地设置。'};}
  }
  async function edit({image,prompt,model,signal,configRevision}={}){
    try{
      const config=await snapshot();
      if(!config)throw fail('NOT_CONFIGURED','请先配置自定义图像 API。');
      if(typeof configRevision!=='string'||configRevision!==config.revision)throw fail('CONFIG_CHANGED','图像 API 设置已变更，请刷新配置并重新确认上传目标。');
      if(model!==undefined&&model!==config.model)throw fail('CONFIG_CHANGED','图像模型已变更，请刷新配置并重新确认。');
      if(signal?.aborted)throw fail('CANCELLED','请求已取消，本应用不会自动重试。');
      if(typeof prompt!=='string'||!prompt.trim()||prompt.length>8000)throw fail('INVALID_INPUT','图像提示应为 1–8000 字符的非空文本。');
      if(!(image?.bytes instanceof Uint8Array)||image.bytes.length>6*1024*1024||image.mediaType!=='image/png')throw fail('INVALID_INPUT','参考图必须为不超过 6 MiB 的 PNG。');
      const bytes=Buffer.from(image.bytes),dimensions=inspectRaster(bytes);
      if(dimensions.mediaType!=='image/png'||dimensions.width!==image.width||dimensions.height!==image.height||dimensions.width>1024||dimensions.height>1024)throw fail('INVALID_INPUT','参考图尺寸不匹配，或未缩小到 1024 像素以内。');
      const endpoint=`${config.baseUrl}/images/edits`;
      const {body,contentType}=multipart(bytes,config.model,prompt);
      const response=await transport(endpoint,{method:'POST',headers:{Authorization:`Bearer ${config.apiKey}`,'Content-Type':contentType,'Content-Length':String(body.length),Accept:'application/json'},body,signal,maxBytes:MAX_JSON_BYTES,timeoutMs:240000});
      if(signal?.aborted)throw fail('CANCELLED','请求已取消；服务商可能已经计费，本应用不会自动重试。');
      if(!(response?.body instanceof Uint8Array)||response.body.length>MAX_JSON_BYTES)throw fail('INVALID_RESPONSE','图像服务响应过大或格式无效。');
      let payload;try{payload=JSON.parse(Buffer.from(response.body).toString('utf8'));}catch{throw fail('INVALID_RESPONSE','图像服务未返回有效的 JSON；请检查 API 基础地址与 /images/edits 协议。');}
      if(!Array.isArray(payload?.data)||payload.data.length!==1||!payload.data[0]||typeof payload.data[0]!=='object')throw fail('INVALID_RESPONSE','图像服务必须在 data 数组中返回一张图片。');
      const item=payload.data[0];let result;
      if(typeof item.b64_json==='string'){
        const base64=item.b64_json;
        if(base64.length>Math.ceil(MAX_IMAGE_BYTES/3)*4||!base64||base64.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))throw fail('INVALID_IMAGE','图像服务返回的 Base64 图像无效或过大。');
        result=Buffer.from(base64,'base64');
        if(result.toString('base64')!==base64)throw fail('INVALID_IMAGE','图像服务返回的 Base64 图像编码无效。');
      }else if(typeof item.url==='string'){
        // Signed public URLs are allowed, but never logged, persisted or echoed.
        // No API Authorization is sent, even if the image uses the same origin.
        const url=publicHttpsUrl(item.url,{allowQuery:true});
        const download=await transport(url.href,{method:'GET',headers:{Accept:'image/png, image/jpeg, image/webp'},signal,maxBytes:MAX_IMAGE_BYTES,timeoutMs:30000});
        if(!(download?.body instanceof Uint8Array))throw fail('INVALID_IMAGE','下载的图像无效。');
        result=Buffer.from(download.body);
      }else throw fail('INVALID_RESPONSE','图像服务未提供 b64_json 或可下载的图像 URL。');
      if(signal?.aborted)throw fail('CANCELLED','请求已取消；服务商可能已经计费，本应用不会自动重试。');
      const raster=inspectRaster(result);
      return{imageDataUrl:`data:${raster.mediaType};base64,${result.toString('base64')}`};
    }catch(error){throw error instanceof ImageApiError?error:fail('IMAGE_API_FAILED','自定义图像请求失败。请检查配置、权限与网络；不会自动重试，服务商可能已经计费。');}
  }
  return{status,edit};
}
