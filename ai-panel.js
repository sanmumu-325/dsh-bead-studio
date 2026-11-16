import {createBeadAiController,beadAiPost,beadAiPublicConfig,saveBeadAiConfig,readBeadAiModels} from './ai-client.js';

export const aiPanelLocales={
  zh:{aiReadModels:'连接并读取模型（联网，不生成图片）',aiModelsHelp:'仅点击后向所填基础地址发送认证信息并 GET /models；不上传图片，不验证图像编辑能力。',aiModelsFilter:'显示全部模型',aiModelsSelect:'选择模型 ID（仅修改草稿）',aiModelsPlaceholder:'请手动选择，不会自动保存',aiModelsUnverified:'图像候选筛选仅基于名称，编辑能力未验证；可切换全部或继续手填模型。',aiModelsEmpty:'没有匹配的模型；可切换全部或手填。',aiModelsTruncated:'模型列表已截断，仍可手填精确 ID。',aiModelsLoading:'正在读取模型列表…',aiModelsKey:'读取成功后，新输入密钥仅暂留前端内存供保存配置使用，不回显、不写入工程或聊天；失败会清空。',aiProvider:'图像引擎',aiCodex:'Codex 订阅',aiCustom:'自定义 API',aiBaseUrl:'HTTPS 基础地址（含供应商要求的 /v1）',aiCustomModel:'图像模型',aiApiKey:'API Key（留空仅保留同地址已有密钥）',aiKeyPresent:'已有密钥（不回显）',aiKeyMissing:'尚无密钥',aiCustomHelp:'仅支持 HTTPS 公网 OpenAI 兼容 images/edits；自动在基础地址后追加 /images/edits。不保证所有供应商兼容。',aiKeyStorage:'密钥交给 DSH 主机凭据存储；默认本机后端为明文文件，受文件权限保护，并非加密保险箱。建议使用专用限额密钥。',aiSaveConfig:'保存 API 配置',aiClearConfig:'删除 API 配置和密钥',aiConfirmClear:'再次确认删除配置和密钥（不影响原作品）',aiDismissClear:'取消删除',aiCheckConfig:'检查配置格式（不联网）',aiCheckHelp:'仅校验已保存配置格式，不测试连接、登录或额度，不发送图像。',aiCustomPrivacy:'将向下方显示的基础地址发送当前图像，并消耗该供应商额度；真实价格未知。不使用 Codex 或聊天会话；工作台仅将候选暂存在内存，工程不保存原图。供应商如何留存图片以其政策为准。',aiCustomConsent:'我同意向显示的基础地址发送图像并消耗该供应商额度，了解图像可能变化。',aiEndpoint:'实际图像接口',aiSaved:'配置已保存，请重新确认同意。',aiAddressChanged:'基础地址已改变，必须重新输入密钥。',aiRefreshStatus:'刷新可用性与对话列表',aiNeedSource:'请先在下方「选择图片」上传原图。仅恢复已保存图纸不会提供 AI 所需的参考图片。',aiConfiguredModel:'沿用 Codex 插件图像设置',aiTitle:'AI 原稿助手 · Beta',aiWarning:'AI 可能改变长相、花纹和细节，输出不是忠实抠图。',aiPrivacy:'参考图和生成结果都会保存在所选 DSH 对话及附件存储中；参考图作为用户请求附图交给 Codex 图像服务，消耗订阅额度；真实价格未知。作品库仍只存图纸；确认采用前不会替换当前上传源。',aiConsent:'我同意将参考图和生成结果保存在所选对话及附件存储中，并将参考图交给 Codex 图像服务；了解订阅额度消耗和图像变化风险。',aiSession:'用于执行的 DSH 对话',aiChooseSession:'请明确选择一个对话',aiSessionNote:'可用仅代表工具入口存在；会话模型权限、登录和额度以实际执行结果为准。请求可能被拒绝，不自动重试或切换模型、对话。',aiUnavailable:'AI 引擎尚未接入或当前不可用',aiEngine:'引擎 / 模型',aiQuota:'额度',aiUnknown:'未知',aiStyle:'风格',aiFaithful:'尽量保留原貌',aiCute:'可爱简化',aiOutline:'轮廓清晰',aiBackground:'背景',aiKeep:'尽量保留',aiWhite:'白色',aiNotes:'额外要求（最多 500 字）',aiGenerate:'生成一次 AI 候选',aiCancel:'取消等待',aiCancelled:'已取消等待；远端请求可能已计费。不会自动重试。',aiWorking:'正在等待 AI 候选…',aiOriginal:'原图',aiCandidate:'AI 候选',aiAdopt:'确认采用候选作为上传源',aiAdoptHint:'采用只替换上传源；不会保存作品或生成图纸。采用后请点击“生成”创建新作品。',aiAdopted:'候选已采用，请继续生成图纸。',aiLoading:'正在检查 AI 可用性…',aiFailed:'AI 请求失败（未自动重试）'},
  en:{aiReadModels:'Connect and read models (online, no image generation)',aiModelsHelp:'Only clicking sends authentication to the entered base URL for GET /models. No image is uploaded and editing capability is not verified.',aiModelsFilter:'Show all models',aiModelsSelect:'Select model ID (draft only)',aiModelsPlaceholder:'Choose explicitly; nothing is saved automatically',aiModelsUnverified:'Image candidates are filtered by name only; editing is unverified. Show all models or keep entering an ID manually.',aiModelsEmpty:'No matching models. Show all or enter an ID manually.',aiModelsTruncated:'The model list was truncated; exact IDs can still be entered manually.',aiModelsLoading:'Reading model list…',aiModelsKey:'On success, a newly entered key stays only in frontend memory for saving configuration. It is not displayed or written to projects or chats, and is cleared on failure.',aiProvider:'Image engine',aiCodex:'Codex subscription',aiCustom:'Custom API',aiBaseUrl:'HTTPS base URL (include /v1 if required)',aiCustomModel:'Image model',aiApiKey:'API key (blank preserves an existing key only at the same URL)',aiKeyPresent:'Key stored (never displayed)',aiKeyMissing:'No key stored',aiCustomHelp:'HTTPS public OpenAI-compatible images/edits only; /images/edits is appended to the base URL. Not all providers are compatible.',aiKeyStorage:'Keys are stored by DSH host credentials. The default local backend uses plaintext files protected by file permissions, not an encrypted vault. Use a dedicated key with a spending limit.',aiSaveConfig:'Save API configuration',aiClearConfig:'Delete API configuration and key',aiConfirmClear:'Confirm deletion of configuration and key (artworks are unaffected)',aiDismissClear:'Keep configuration',aiCheckConfig:'Check configuration format (offline)',aiCheckHelp:'Validates saved configuration only. Does not test connectivity, login or quota, or send an image.',aiCustomPrivacy:'The current image will be sent to the base URL shown below and use that provider’s quota; the actual price is unknown. No Codex or chat session is used. This workbench keeps candidates temporarily in memory; projects do not store source images. Provider-side image retention follows its own policies.',aiCustomConsent:'I consent to sending this image to the displayed base URL and using that provider’s quota, and understand possible image changes.',aiEndpoint:'Image endpoint',aiSaved:'Configuration saved. Please confirm consent again.',aiAddressChanged:'Changing the base URL requires entering a new API key.',aiRefreshStatus:'Refresh availability and conversations',aiNeedSource:'Upload a reference under Select Image below. Restoring a saved pattern does not provide a source photo for AI.',aiConfiguredModel:'Uses Codex plugin image settings',aiTitle:'AI Source Assistant · Beta',aiWarning:'AI may change appearance, markings and details. This is not a faithful background cutout.',aiPrivacy:'Both the reference image and generated results will be stored in the selected DSH conversation and attachment storage. The reference is sent as a user-request attachment to the Codex image service using subscription quota. The actual price is unknown. The artwork library still stores patterns only; the upload source is not replaced until you confirm adoption.',aiConsent:'I consent to storing this reference and generated results in the selected conversation and attachment storage and sending the reference to the Codex image service, with subscription quota usage and possible image changes.',aiSession:'DSH conversation for execution',aiChooseSession:'Explicitly choose a conversation',aiSessionNote:'Availability only means the tool entry exists. Session model permissions, login and quota are checked during execution. Requests may be refused; no automatic retries or model/conversation switching.',aiUnavailable:'The AI engine is not connected or is unavailable',aiEngine:'Engine / model',aiQuota:'Quota',aiUnknown:'Unknown',aiStyle:'Style',aiFaithful:'Preserve appearance',aiCute:'Cute and simplified',aiOutline:'Clear outlines',aiBackground:'Background',aiKeep:'Try to preserve',aiWhite:'White',aiNotes:'Additional instructions (500 characters maximum)',aiGenerate:'Generate one AI candidate',aiCancel:'Cancel waiting',aiCancelled:'Waiting cancelled; the remote request may already be charged. No automatic retry.',aiWorking:'Waiting for an AI candidate…',aiOriginal:'Original',aiCandidate:'AI candidate',aiAdopt:'Confirm candidate as upload source',aiAdoptHint:'Adopting only replaces the upload source; it does not save an artwork or generate a pattern. Click Generate afterward to create a new artwork.',aiAdopted:'Candidate adopted. You can now generate a pattern.',aiLoading:'Checking AI availability…',aiFailed:'AI request failed (not retried automatically)'}
};

export function createAiPanel(React,{Source,t}) {
  const h=React.createElement;
  return function AiPanel({source,sourceId,params={},disabled=false,onAdopt,onBusyChange}){
    const [state,setState]=React.useState({status:null,phase:'idle',candidate:null,busy:false,pendingStart:false,error:''});
    const [sessionId,setSessionId]=React.useState('');
    const [style,setStyle]=React.useState('faithful'),[background,setBackground]=React.useState('keep'),[notes,setNotes]=React.useState(''),[consent,setConsent]=React.useState(false);
    const [provider,setProvider]=React.useState('codex'),[config,setConfig]=React.useState(beadAiPublicConfig()),[baseUrl,setBaseUrl]=React.useState(''),[model,setModel]=React.useState(''),[apiKey,setApiKey]=React.useState(''),[configBusy,setConfigBusy]=React.useState(false),[configMessage,setConfigMessage]=React.useState(''),[confirmClear,setConfirmClear]=React.useState(false);
    const [modelList,setModelList]=React.useState({models:null,busy:false,error:'',truncated:false}),[allModels,setAllModels]=React.useState(false);
    const controller=React.useRef(null),latest=React.useRef(null),configTicket=React.useRef(0),modelTicket=React.useRef(0);latest.current={onAdopt,onBusyChange};
    React.useEffect(()=>{const c=createBeadAiController({onChange:setState,onBusyChange:value=>latest.current.onBusyChange?.(value)});controller.current=c;c.status();return()=>{configTicket.current++;modelTicket.current++;c.dispose();if(controller.current===c)controller.current=null;};},[]);
    React.useLayoutEffect(()=>{controller.current?.reset();setConsent(false);clearModels();},[sourceId]);
    React.useLayoutEffect(()=>{controller.current?.reset();setConsent(false);clearModels();},[state.status?.endpoint,state.status?.revision]);
    const locked=disabled||state.busy||configBusy,sessionValid=provider==='custom'||!!sessionId&&!!state.status?.sessions?.some(s=>s.id===sessionId);
    function invalidate(){controller.current?.reset();setConsent(false);}
    function clearModels(){modelTicket.current++;setModelList({models:null,busy:false,error:'',truncated:false});setAllModels(false);}
    async function readModels(){
      if(locked||modelList.busy||provider!=='custom'||!baseUrl)return;
      const ticket=++modelTicket.current;invalidate();setModelList({models:null,busy:true,error:'',truncated:false});setAllModels(false);
      try{const result=await readBeadAiModels({baseUrl,apiKey,config});if(ticket===modelTicket.current)setModelList({...result,busy:false,error:''});}
      catch(e){if(ticket===modelTicket.current){setApiKey('');setModelList({models:null,busy:false,error:String(e.message||e),truncated:false});}}
    }
    function installConfig(value){const safe=beadAiPublicConfig(value);setConfig(safe);setBaseUrl(safe.baseUrl);setModel(safe.model);}
    async function configAction(action){
      if(configBusy||disabled)return;
      if(action==='custom_clear'&&!confirmClear){setConfirmClear(true);return;}
      const ticket=++configTicket.current;clearModels();setConfigBusy(true);setConfigMessage('');invalidate();
      const key=apiKey;setApiKey('');
      try{
        let result;
        if(action==='custom_save')result=await saveBeadAiConfig({baseUrl,model,apiKey:key,config});
        else result=await beadAiPost({action,...(action==='custom_clear'?{expectedRevision:config.revision}:{})});
        if(ticket!==configTicket.current)return;
        if(action==='custom_check')setConfigMessage(result.message||String(result.valid));
        else{installConfig(result);setConfirmClear(false);if(action==='custom_save')setConfigMessage(t('aiSaved'));await controller.current?.status('custom');}
      }catch(e){if(ticket===configTicket.current)setConfigMessage(String(e.message||e));}
      finally{if(ticket===configTicket.current){setApiKey('');setConfigBusy(false);}}
    }
    function changeProvider(value){
      clearModels();configTicket.current++;setConfigBusy(false);setConfigMessage('');setConfirmClear(false);setApiKey('');invalidate();setProvider(value);controller.current?.status(value);
      if(value==='custom'){
        const ticket=++configTicket.current;setConfigBusy(true);
        beadAiPost({action:'custom_config'}).then(result=>{if(ticket===configTicket.current)installConfig(result);}).catch(e=>{if(ticket===configTicket.current)setConfigMessage(String(e.message||e));}).finally(()=>{if(ticket===configTicket.current)setConfigBusy(false);});
      }
    }
    const field=(label,child)=>h('label',{className:'bs-field'},h('span',null,label),child);
    const select=(value,set,options)=>h('select',{value,disabled:locked,onChange:e=>set(e.target.value)},...options.map(([id,key])=>h('option',{key:id,value:id},t(key))));
    const visibleModels=(modelList.models||[]).filter(item=>allModels||item.imageCandidate);
    const configReady=provider!=='custom'||!modelList.busy&&apiKey===''&&baseUrl===config.baseUrl&&model===config.model&&state.status?.revision===config.revision;
    function start(){if(locked||!consent||!source||!sessionValid||!configReady)return;controller.current?.start({source,consent,sessionId,provider,style,background,notes,width:params.width,maxColors:params.maxColors});}
    return h('section',{className:'bs-card bs-ai-panel'},
      h('h2',null,t('aiTitle')),
      !source&&h('p',{className:'bs-alert',role:'status'},t('aiNeedSource')),
      h('p',{className:'bs-note'},t('aiWarning')),
      field(t('aiProvider'),h('select',{value:provider,disabled:disabled||configBusy,onChange:e=>changeProvider(e.target.value)},h('option',{value:'codex'},t('aiCodex')),h('option',{value:'custom'},t('aiCustom')))),
      h('p',{className:'bs-note'},t(provider==='custom'?'aiCustomPrivacy':'aiPrivacy')),
      provider==='custom'&&h('div',{className:'bs-ai-config'},
        h('p',{className:'bs-note'},t('aiCustomHelp')),h('p',{className:'bs-note'},t('aiKeyStorage')),
        field(t('aiBaseUrl'),h('input',{type:'url',value:baseUrl,disabled:locked,autoComplete:'off',onChange:e=>{clearModels();invalidate();setBaseUrl(e.target.value);setApiKey('');}})),
        field(t('aiCustomModel'),h('input',{value:model,disabled:locked,autoComplete:'off',onChange:e=>{invalidate();setModel(e.target.value);}})),
        field(t('aiApiKey'),h('input',{type:'password',value:apiKey,disabled:locked,autoComplete:'new-password',onChange:e=>{clearModels();invalidate();setApiKey(e.target.value);}})),
        h('p',{className:'bs-muted'},t(config.hasKey?'aiKeyPresent':'aiKeyMissing')),
        h('button',{type:'button',disabled:locked||modelList.busy||!baseUrl||baseUrl!==config.baseUrl&&!apiKey.trim(),onClick:readModels},t('aiReadModels')),
        h('p',{className:'bs-note'},t('aiModelsHelp')),h('p',{className:'bs-note'},t('aiModelsKey')),
        modelList.busy&&h('p',{className:'bs-note',role:'status'},t('aiModelsLoading')),
        modelList.error&&h('p',{className:'bs-alert',role:'status'},modelList.error),
        modelList.models&&h('div',null,
          h('label',{className:'bs-check'},h('input',{type:'checkbox',checked:allModels,onChange:e=>setAllModels(e.target.checked)}),t('aiModelsFilter')),
          field(t('aiModelsSelect'),h('select',{'data-ai-model-list':true,value:visibleModels.some(item=>item.id===model)?model:'',disabled:locked,onChange:e=>{if(visibleModels.some(item=>item.id===e.target.value)){invalidate();setModel(e.target.value);}}},h('option',{value:''},t('aiModelsPlaceholder')),...visibleModels.map(item=>h('option',{key:item.id,value:item.id},item.id)))),
          h('p',{className:'bs-note'},t('aiModelsUnverified')),!visibleModels.length&&h('p',{className:'bs-note'},t('aiModelsEmpty')),
          modelList.truncated&&h('p',{className:'bs-note'},t('aiModelsTruncated'))),
        baseUrl!==config.baseUrl&&h('p',{className:'bs-note'},t('aiAddressChanged')),
        h('p',{className:'bs-note'},t('aiEndpoint')+': '+(state.status?.endpoint||config.endpoint||t('aiUnknown'))),
        h('div',{className:'bs-exports'},h('button',{type:'button',disabled:locked||!baseUrl||!model||baseUrl!==config.baseUrl&&!apiKey.trim(),onClick:()=>configAction('custom_save')},t('aiSaveConfig')),
          h('button',{type:'button',disabled:locked,onClick:()=>configAction('custom_check')},t('aiCheckConfig')),
          h('button',{type:'button',disabled:locked,onClick:()=>configAction('custom_clear')},t(confirmClear?'aiConfirmClear':'aiClearConfig')),
          confirmClear&&h('button',{type:'button',disabled:locked,onClick:()=>setConfirmClear(false)},t('aiDismissClear'))),
        h('p',{className:'bs-note'},t('aiCheckHelp')),configMessage&&h('p',{className:'bs-note',role:'status'},configMessage)), 
      h('div',{className:'bs-muted'},t('aiEngine')+': '+(state.status?.engine||t('aiUnknown'))+' / '+(state.status?.model==='configured'?t('aiConfiguredModel'):state.status?.model||t('aiUnknown'))),
      h('div',{className:'bs-muted'},t('aiQuota')+': '+(typeof state.status?.quota==='string'&&state.status.quota!=='unknown'?state.status.quota:t('aiUnknown'))),
      !state.status?h('p',{role:'status',className:'bs-note'},t('aiLoading')):!state.status.available?h('p',{role:'status',className:'bs-alert'},state.status.reason||t('aiUnavailable')):null,
      provider==='codex'&&field(t('aiSession'),h('select',{value:sessionId,disabled,onChange:e=>{controller.current?.reset();setSessionId(e.target.value);setConsent(false);}},h('option',{value:''},t('aiChooseSession')),...(state.status?.sessions||[]).map(s=>h('option',{key:s.id,value:s.id},s.label||s.id)))),
      h('button',{type:'button',disabled:locked,onClick:()=>provider==='custom'?configAction('custom_config'):controller.current?.status()},t('aiRefreshStatus')),
      provider==='codex'&&h('p',{className:'bs-note'},t('aiSessionNote')),
      h('div',{className:'bs-pair'},field(t('aiStyle'),select(style,setStyle,[['faithful','aiFaithful'],['cute','aiCute'],['outline','aiOutline']])),field(t('aiBackground'),select(background,setBackground,[['keep','aiKeep'],['white','aiWhite']]))),
      field(t('aiNotes'),h('textarea',{value:notes,maxLength:500,rows:3,disabled:locked,onChange:e=>setNotes(e.target.value.slice(0,500)),style:{width:'100%',resize:'vertical',font:'inherit',color:'inherit',background:'var(--dsw-alias-bg-base)',border:'1px solid var(--dsw-alias-border-l2)',borderRadius:7,padding:8}})),
      h('label',{className:'bs-check'},h('input',{type:'checkbox',checked:consent,disabled:locked,onChange:e=>setConsent(e.target.checked)}),t(provider==='custom'?'aiCustomConsent':'aiConsent')),
      h('div',{className:'bs-exports'},h('button',{type:'button',disabled:locked||!source||!consent||!sessionValid||!configReady||!state.status?.available,onClick:start},t('aiGenerate')),
        state.busy&&h('button',{type:'button',onClick:()=>controller.current?.cancel()},t('aiCancel'))),
      h('div',{className:'bs-note',role:'status'},state.phase==='cancelled'?t('aiCancelled'):state.busy?t('aiWorking'):state.phase==='adopted'?t('aiAdopted'):state.phase==='failed'?t('aiFailed'):''),
      state.error&&h('p',{className:'bs-alert bs-error',role:'alert'},state.error),
      state.candidate&&h('div',{className:'bs-ai-comparison'},h('div',{className:'bs-pair'},h('div',null,h('p',{className:'bs-muted'},t('aiOriginal')),source&&h(Source,{image:source})),h('div',null,h('p',{className:'bs-muted'},t('aiCandidate')),h(Source,{image:state.candidate}))),
        h('p',{className:'bs-note'},t('aiAdoptHint')),h('button',{type:'button',disabled:locked||!consent,onClick:()=>{if(!disabled&&consent)controller.current?.adopt(image=>latest.current.onAdopt?.(image));}},t('aiAdopt'))));
  };
}
