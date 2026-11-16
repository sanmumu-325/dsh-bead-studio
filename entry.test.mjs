import test from 'node:test';
import assert from 'node:assert/strict';
import {apply as applyProjects,inject} from './index-projects.js';
import {apply as applyBase} from './host-v4.js';
const apply=async ctx=>{applyBase(ctx);await applyProjects(ctx);};
import {generate} from './core.js';
test('actual plugin entry uses real Zod record parsing and closes its domain',async()=>{
  const effects=[],tools=new Map(),routes=new Map(),rows=new Map();let schema,closed=false;
  const ctx={
    effect:fn=>{const p=Promise.resolve(fn());effects.push(p);return p;},
    tools:{register:t=>(tools.set(t.name,t),()=>tools.delete(t.name))},
    webServer:{getOrigin:()=> 'http://127.0.0.1:8153',register:r=>(routes.set(r.path,r),()=>routes.delete(r.path))},
    storageDomain:{open:async spec=>{
      assert.equal(spec.name,'local_bead_studio_projects');assert.match(spec.name,/^[a-z][a-z0-9_]*$/);schema=spec.tables.projects.valueSchema;
      return {
        table:()=>({get:k=>rows.get(k),put:async(k,v)=>rows.set(k,schema.parse(v))}),
        close:async()=>{closed=true;}
      };
    }}
  };
  await apply(ctx);const disposers=await Promise.all(effects);
  assert.ok(inject.includes('storageDomain'));assert.ok(tools.has('bead_project'));assert.ok(tools.has('bead_pattern'));
  assert.throws(()=>schema.parse({revision:-1,project:{}}));
  const pattern=generate({width:1,height:1,rgba:[200,100,50,255]});
  const saved=await tools.get('bead_project').execute({action:'save',projectJson:JSON.stringify(pattern),expectedRevision:0},{signal:new AbortController().signal});
  assert.equal(saved.project.pattern.totalBeads,1);assert.equal(schema.parse(JSON.parse(JSON.stringify(rows.get('current')))).revision,1);
  for(const dispose of disposers.reverse())await dispose();
  assert.equal(closed,true);assert.equal(tools.size,0);assert.equal(routes.size,0);
});
