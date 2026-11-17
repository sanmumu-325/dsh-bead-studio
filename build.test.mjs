import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const inputs=['build.mjs','core.js','pdf.js','preview.js','ui.js','project.js','editor.js','viewport.js','autosave.js','library-session.js','exports.js','image-sizing.js','ai-client.js','ai-panel.js','workbench.js','index.js','locale/en.json','locale/zh.json'];
const outputs=['client.js','core-v2.js','host-v4.js'];
const normalize=text=>text.replace(/\r\n?/g,'\n');

test('LF, CRLF and CR build inputs produce identical valid published runtime files',async()=>{
  const parent=await fs.realpath(os.tmpdir());
  const temporary=await fs.mkdtemp(path.join(parent,'bead-build-eol-'));
  const owned=await fs.realpath(temporary);
  assert.equal(path.dirname(owned),parent);assert.ok(path.basename(owned).startsWith('bead-build-eol-'));
  try{
    const source=new Map(await Promise.all(inputs.map(async file=>[file,normalize(await fs.readFile(new URL(file,import.meta.url),'utf8'))])));
    const expected=new Map(await Promise.all(outputs.map(async file=>[file,normalize(await fs.readFile(new URL(file,import.meta.url),'utf8'))])));
    await fs.mkdir(path.join(owned,'locale'));
    await fs.writeFile(path.join(owned,'package.json'),'{"type":"module"}\n');
    for(const eol of ['\n','\r\n','\r']){
      for(const [file,text]of source)await fs.writeFile(path.join(owned,file),text.replace(/\n/g,eol));
      const build=spawnSync(process.execPath,['build.mjs'],{cwd:owned,stdio:'inherit',timeout:30000});
      assert.ifError(build.error);assert.equal(build.status,0,`build exit for ${JSON.stringify(eol)}`);
      for(const file of outputs){
        const actual=await fs.readFile(path.join(owned,file),'utf8');assert.equal(actual,expected.get(file),`${file} differs with ${JSON.stringify(eol)}`);assert.equal(actual.includes('\r'),false);
        const check=spawnSync(process.execPath,['--check',file],{cwd:owned,stdio:'inherit',timeout:30000});assert.ifError(check.error);assert.equal(check.status,0,`${file} must parse`);
      }
    }
  }finally{
    // Delete only the exact real directory created above; never follow a replaced link.
    const current=await fs.realpath(temporary),stat=await fs.lstat(temporary);
    assert.equal(current,owned);assert.equal(stat.isSymbolicLink(),false);assert.equal(path.dirname(current),parent);
    await fs.rm(temporary,{recursive:true,force:true});
  }
});
