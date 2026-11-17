import fs from 'node:fs/promises';
const root=new URL('./',import.meta.url);
// Normalize every textual input, including generated Host copies, across checkouts.
const readText=async file=>(await fs.readFile(new URL(file,root),'utf8')).replace(/\r\n?/g,'\n');
const core=(await readText('core.js')).replace(/^export /gm,'');
const pdf=(await readText('pdf.js')).replace(/^import .*;\n/m,'').replace(/^export /gm,'');
const preview=(await readText('preview.js')).replace(/^export /gm,'');
const ui=await readText('ui.js');
const project=(await readText('project.js')).replace(/^export /gm,'');
const editor=(await readText('editor.js')).replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
const extras=await Promise.all(['viewport.js','autosave.js','library-session.js','exports.js','image-sizing.js','ai-client.js','ai-panel.js','workbench.js'].map(async file=>(await readText(file)).replace(/^import .*;\n/gm,'').replace(/^export /gm,'')));
const dictionaries={};for(const lang of ['en','zh'])dictionaries[lang]=JSON.parse(await readText('locale/'+lang+'.json')).ui;
const output=`window.__ModuleLoader__.load({id:'@sanmumu/dsh-bead-studio',factory(require){const React=require('react');const core=(()=>{${core}\n${pdf}\nreturn {sampleImage,demoImage,toSvg,toCsv,toPdf};})();\nconst projects=(()=>{${project}\nreturn {normalizeProject,parseProject};})();\nconst editor=(()=>{const {normalizeProject}=projects;${editor}\nreturn {paintCells,mergeColors,getCellInfo,createHistory};})();\n${preview}\n${extras.join('\n')}\n${ui}\nreturn createClient(React,core,projects,${JSON.stringify(dictionaries)});}});\n`;
await fs.writeFile(new URL('client.js',root),output);
await fs.writeFile(new URL('core-v2.js',root),await readText('core.js'));
const host=(await readText('index.js')).replace("from './core.js'", "from './core-v2.js'");
await fs.writeFile(new URL('host-v4.js',root),host);
console.log('Built client.js: '+Buffer.byteLength(output)+' bytes');
