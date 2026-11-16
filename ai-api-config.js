import {randomUUID} from 'node:crypto';
import {normalizeApiConfig} from './ai-custom-adapter.js';
import {discoverApiModels} from './ai-models.js';
export const API_CREDENTIAL_KEY='local-bead-studio/custom-image-api';
class ConfigError extends Error {constructor(message){super(message);this.publicMessage=message;}}
const fail=message=>new ConfigError(message);
const empty=()=>({baseUrl:'',model:'',endpoint:'',hasKey:false,revision:'',keyStorage:'host-credentials'});
function unpack(record){
  if(!record)return null;
  const p=record.kind==='grant'&&record.payload;
  if(!p||p.format!=='bead-image-api-v1'||typeof p.revision!=='string'||!p.revision)throw fail('图像 API 配置存储格式异常，未读取或发送密钥。');
  if(p.cleared)return{cleared:true,revision:p.revision};
  try{return{...normalizeApiConfig(p),revision:p.revision};}catch{throw fail('已保存的图像 API 配置无效，请重新配置。');}
}
export class ApiConfigStore {
  constructor(credentials,{discoverModels=discoverApiModels}={}){this.credentials=credentials;this.discoverModels=discoverModels;this.discovering=false;this.closed=false;}
  close(){this.closed=true;this.discoveryController?.abort();}
  async models(input){
    if(this.closed)throw fail('图像 API 配置服务已关闭。');
    if(this.discovering)throw fail('正在读取模型，请等待当前请求结束。');
    if(typeof input.expectedRevision!=='string'||typeof input.baseUrl!=='string'||(input.apiKey!==undefined&&typeof input.apiKey!=='string'))throw fail('请先刷新配置，并填写基础地址。');
    this.discovering=true;const controller=new AbortController();this.discoveryController=controller;
    try{
      const current=await this.read();
      if((current?.revision||'')!==input.expectedRevision)throw fail('配置已改变，请刷新后再读取模型。');
      let address;try{address=normalizeApiConfig({baseUrl:input.baseUrl,model:'discovery-only',apiKey:'validation-placeholder'}).baseUrl;}catch{throw fail('请输入有效的公网 HTTPS 基础地址，不含查询参数。');}
      const supplied=input.apiKey?.trim()||'';
      if(!supplied&&(!current||current.cleared||current.baseUrl!==address))throw fail('新地址必须输入密钥，旧密钥不会发送给新地址。');
      let config;try{config=normalizeApiConfig({baseUrl:address,model:'discovery-only',apiKey:supplied||current.apiKey});}catch{throw fail('API 密钥格式无效，请重新输入。');}
      const result=await this.discoverModels({baseUrl:config.baseUrl,apiKey:config.apiKey,signal:controller.signal});
      if(((await this.read())?.revision||'')!==input.expectedRevision)throw fail('读取期间配置已改变，请刷新后再读取模型。');
      return result;
    }finally{this.discovering=false;this.discoveryController=null;}
  }
  async read(){try{return unpack(await this.credentials.readRecord(API_CREDENTIAL_KEY));}catch(e){throw e instanceof ConfigError?e:fail('无法读取图像 API 配置，请检查 DSH 凭据存储。');}}
  async getConfig(){const p=await this.read();return p&&!p.cleared?p:null;}
  async view(){const p=await this.read();if(!p)return empty();if(p.cleared)return{...empty(),revision:p.revision};return{baseUrl:p.baseUrl,model:p.model,endpoint:p.baseUrl+'/images/edits',hasKey:true,revision:p.revision,keyStorage:'host-credentials'};}
  async save(input){
    if(typeof input.expectedRevision!=='string')throw fail('请先读取配置，再保存修改。');
    if(typeof input.baseUrl!=='string'||typeof input.model!=='string'||(input.apiKey!==undefined&&typeof input.apiKey!=='string'))throw fail('请输入有效的 API 地址、模型和密钥。');
    // Normalize with a non-secret placeholder first. The adapter validates the
    // real key only once it is paired with its destination under the store lock.
    let address;try{address=normalizeApiConfig({baseUrl:input.baseUrl,model:input.model,apiKey:'validation-placeholder'});}catch{throw fail('地址或模型格式无效：仅支持不含查询参数的公网 HTTPS 基础地址。');}
    const supplied=input.apiKey?.trim()||'';
    try{await this.credentials.modifyRecord(API_CREDENTIAL_KEY,async record=>{
      const current=unpack(record);if((current?.revision||'')!==input.expectedRevision)throw fail('配置已被其他页面修改，请刷新后重试。');
      if(!supplied&&(!current||current.cleared||current.baseUrl!==address.baseUrl))throw fail('首次配置或修改 API 地址时必须重新输入密钥，旧密钥不会发送给新地址。');
      let next;try{next=normalizeApiConfig({...address,apiKey:supplied||current.apiKey});}catch{throw fail('API 密钥格式无效，请重新输入；密钥未保存。');}
      return{kind:'grant',payload:{format:'bead-image-api-v1',baseUrl:next.baseUrl,model:next.model,apiKey:next.apiKey,revision:randomUUID()}};
    });}catch(e){throw e instanceof ConfigError?e:fail('配置保存失败；未回显密钥，请检查 DSH 凭据存储后重试。');}
    return this.view();
  }
  async clear(input){
    if(typeof input.expectedRevision!=='string')throw fail('请先刷新配置，再清除。');
    try{await this.credentials.modifyRecord(API_CREDENTIAL_KEY,async record=>{const current=unpack(record);if((current?.revision||'')!==input.expectedRevision)throw fail('配置已改变，请刷新后再清除。');return{kind:'grant',payload:{format:'bead-image-api-v1',cleared:true,revision:randomUUID()}};});}catch(e){throw e instanceof ConfigError?e:fail('无法清除图像 API 配置，请检查 DSH 凭据存储。');}
    return this.view();
  }
  async check(){const p=await this.getConfig();return p?{valid:true,message:'已保存配置的格式检查通过。未联网、未发送图片；尚未验证认证、模型支持或接口可用性。'}:{valid:false,message:'尚未保存完整的 API 地址、模型和密钥。'};}
}
