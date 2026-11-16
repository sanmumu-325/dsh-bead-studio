import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {LibraryService,registerLibrary,emptyProject} from './library-host.js';
import {apply,libraryRecordSchema} from './index-library.js';

const table=()=>{const rows=new Map();return{rows,get:id=>rows.get(id),entries:()=>rows.entries(),async put(id,value){rows.set(id,structuredClone(value));},async delete(id){return rows.delete(id);}};};
function setup(){const projects=table(),metadata=table();let n=0,t=0;const options={makeId:()=>`p_${++n}`,now:()=>new Date(Date.UTC(2026,0,1,0,0,t++)).toISOString()};return{projects,metadata,options,service:new LibraryService(projects,metadata,options)};}
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
const errorCode=code=>error=>error.code===code;

test('default create yields fresh empty two-color project and bounded list summaries',async()=>{
  const {service}=setup(),a=await service.execute({action:'create',name:'Cat'}),b=await service.execute({action:'create',name:'Flower'});
  assert.equal(a.revision,1);assert.equal(a.deletedAt,null);assert.equal(a.project.pattern.width,16);assert.equal(a.project.pattern.totalBeads,0);
  assert.deepEqual(a.project.pattern.palette.map(c=>[c.id,c.hex]),[['C01','#000000'],['C02','#FFFFFF']]);
  assert.ok(a.project.pattern.cells.every(c=>c===-1));assert.equal(a.project.pattern.boardSize,29);
  const list=await service.execute({action:'list',limit:1});
  assert.equal(list.total,2);assert.equal(list.nextOffset,1);assert.equal(list.items[0].id,b.id);
  assert.equal(list.items[0].project,undefined);assert.equal(list.items[0].thumbnail.pixels.length,256);
  assert.equal((await service.execute({action:'list',offset:1,limit:1})).items[0].id,a.id);
  assert.equal((await service.execute({action:'list',query:'cAt'})).total,1);
  a.project.pattern.cells[0]=0;assert.equal((await service.execute({action:'get',id:a.id})).project.pattern.cells[0],-1);
});

test('save rename duplicate maintain isolation and revisions',async()=>{
  const {service}=setup(),a=await service.execute({action:'create'});
  const input=structuredClone(a.project);input.pattern.cells[0]=0;input.source={secret:'not persisted'};
  const b=await service.execute({action:'save',id:a.id,expectedRevision:1,project:input});
  assert.equal(b.revision,2);assert.equal(b.createdAt,a.createdAt);assert.equal(b.project.pattern.totalBeads,1);assert.equal(b.project.source,undefined);
  input.pattern.cells[0]=-1;assert.equal((await service.execute({action:'get',id:a.id})).project.pattern.totalBeads,1);
  const renamed=await service.execute({action:'rename',id:a.id,expectedRevision:2,name:'Renamed'});
  assert.equal(renamed.revision,3);assert.equal(renamed.project.name,'Renamed');
  const duplicate=await service.execute({action:'duplicate',id:a.id,expectedRevision:3});
  assert.notEqual(duplicate.id,a.id);assert.equal(duplicate.revision,1);assert.equal(duplicate.project.name,'Renamed 副本');
  duplicate.project.pattern.cells[0]=-1;
  assert.equal((await service.execute({action:'get',id:a.id})).project.pattern.totalBeads,1);
  assert.equal((await service.execute({action:'get',id:duplicate.id})).project.pattern.totalBeads,1);
});

test('trash blocks saves and restore/purge require revision and confirmation',async()=>{
  const {service}=setup(),a=await service.execute({action:'create'});
  await assert.rejects(service.execute({action:'purge',id:a.id,expectedRevision:1,confirm:'DELETE'}),errorCode('INVALID_INPUT'));
  const trashed=await service.execute({action:'trash',id:a.id,expectedRevision:1});
  assert.equal(trashed.revision,2);assert.ok(trashed.deletedAt);
  assert.equal((await service.execute({action:'list'})).total,0);assert.equal((await service.execute({action:'list',trash:true})).total,1);
  await assert.rejects(service.execute({action:'save',id:a.id,expectedRevision:2,project:a.project}),errorCode('DELETED'));
  await assert.rejects(service.execute({action:'duplicate',id:a.id,expectedRevision:2}),errorCode('DELETED'));
  assert.equal((await service.execute({action:'trash',id:a.id,expectedRevision:2})).revision,2);
  const restored=await service.execute({action:'restore',id:a.id,expectedRevision:2});assert.equal(restored.revision,3);assert.equal(restored.deletedAt,null);
  const again=await service.execute({action:'trash',id:a.id,expectedRevision:3});
  await assert.rejects(service.execute({action:'purge',id:a.id,expectedRevision:again.revision}),errorCode('CONFIRM_REQUIRED'));
  assert.deepEqual(await service.execute({action:'purge',id:a.id,expectedRevision:again.revision,confirm:'DELETE'}),{id:a.id,purged:true});
  await assert.rejects(service.execute({action:'get',id:a.id}),errorCode('NOT_FOUND'));
});

test('CAS serializes competing windows and reads wait for pending durable writes',async()=>{
  const {service,projects}=setup(),a=await service.execute({action:'create'}),gate=deferred(),put=projects.put;
  projects.put=async(id,row)=>{await gate.promise;await put(id,row);};
  const one=service.execute({action:'rename',id:a.id,expectedRevision:1,name:'one'});
  const two=service.execute({action:'rename',id:a.id,expectedRevision:1,name:'two'});
  let loaded=false;const read=service.execute({action:'get',id:a.id}).then(r=>(loaded=true,r));
  await Promise.resolve();assert.equal(loaded,false);gate.resolve();
  assert.equal((await one).revision,2);await assert.rejects(two,errorCode('CONFLICT'));assert.equal((await read).project.name,'one');
});

test('failed writes/deletes leave data and revision intact; close drains accepted jobs',async()=>{
  const {service,projects}=setup(),a=await service.execute({action:'create'}),put=projects.put;
  projects.put=async()=>{throw Error('disk full');};
  await assert.rejects(service.execute({action:'rename',id:a.id,expectedRevision:1,name:'lost'}),/disk full/);
  assert.deepEqual(await service.execute({action:'get',id:a.id}),a);
  projects.put=put;const gone=await service.execute({action:'trash',id:a.id,expectedRevision:1});projects.delete=async()=>{throw Error('delete failed');};
  await assert.rejects(service.execute({action:'purge',id:a.id,expectedRevision:2,confirm:'DELETE'}),/delete failed/);
  assert.deepEqual(await service.execute({action:'get',id:a.id}),gone);
  const pending=service.execute({action:'restore',id:a.id,expectedRevision:2});const closed=service.close();
  assert.equal((await pending).revision,3);await closed;
  await assert.rejects(service.execute({action:'create'}),errorCode('CLOSED'));
});

test('migration is idempotent and purged legacy artwork never resurrects',async()=>{
  const s=setup(),legacy={revision:99,project:emptyProject()};
  await s.service.migrate(legacy);const first=await s.service.execute({action:'get',id:'legacy_v1'});
  assert.equal(first.revision,1);assert.deepEqual(s.metadata.get('migration_v1'),{done:true});
  await s.service.migrate(legacy);assert.deepEqual(await s.service.execute({action:'get',id:'legacy_v1'}),first);
  await s.service.execute({action:'trash',id:'legacy_v1',expectedRevision:1});await s.service.execute({action:'purge',id:'legacy_v1',expectedRevision:2,confirm:'DELETE'});
  const reopened=new LibraryService(s.projects,s.metadata,s.options);await reopened.migrate(legacy);
  assert.equal((await reopened.execute({action:'list',trash:true})).total,0);assert.equal((await reopened.execute({action:'list'})).total,0);
});

test('migration retries both crash boundaries without overwriting existing legacy record',async()=>{
  const s=setup(),legacy={project:emptyProject()},put=s.projects.put,mark=s.metadata.put;
  s.projects.put=async()=>{throw Error('project crash');};await assert.rejects(s.service.migrate(legacy),/project crash/);
  assert.equal(s.metadata.get('migration_v1'),undefined);assert.equal(s.projects.get('legacy_v1'),undefined);
  s.projects.put=put;s.metadata.put=async()=>{throw Error('marker crash');};
  await assert.rejects(s.service.migrate(legacy),/marker crash/);const record=s.projects.get('legacy_v1');
  const changed=structuredClone(record);changed.project.name='Do not replace';changed.revision=8;await put('legacy_v1',changed);
  s.metadata.put=mark;const reopened=new LibraryService(s.projects,s.metadata,s.options);await reopened.migrate(legacy);
  assert.equal(s.projects.get('legacy_v1').project.name,'Do not replace');assert.equal(s.projects.get('legacy_v1').revision,8);
  const empty=setup();await empty.service.migrate(null);await empty.service.migrate(legacy);assert.equal(empty.projects.rows.size,0);
});

test('thumbnail is bounded and list has stable ties without exposing full projects',async()=>{
  const {service}=setup();service.now=()=> '2026-01-01T00:00:00.000Z';
  const project=emptyProject();project.pattern.width=128;project.pattern.height=64;project.pattern.cells=Array(8192).fill(1);
  const a=await service.execute({action:'create',project,name:'A'});await service.execute({action:'create',name:'B'});
  const list=await service.execute({action:'list'});assert.equal(list.items[0].id,a.id);
  assert.deepEqual(list.items[0].thumbnail,{width:16,height:8,pixels:Array(128).fill('#FFFFFF')});
  assert.equal(list.items[0].colorCount,1);assert.ok(!JSON.stringify(list).includes('"cells"'));
});

test('validation rejects invalid IDs revisions names pagination and project inputs',async()=>{
  const {service}=setup(),a=await service.execute({action:'create'});
  for(const id of ['../x','',42,'x'.repeat(81)])await assert.rejects(service.execute({action:'get',id}));
  for(const expectedRevision of [undefined,0,-1,1.5,'1'])await assert.rejects(service.execute({action:'rename',id:a.id,expectedRevision,name:'x'}));
  for(const filter of [{limit:21},{limit:0},{offset:-1},{query:'x'.repeat(121)},{trash:'true'}])await assert.rejects(service.execute({action:'list',...filter}));
  await assert.rejects(service.execute({action:'rename',id:a.id,expectedRevision:1}));
  await assert.rejects(service.execute({action:'create',name:'x'.repeat(121)}));
  await assert.rejects(service.execute({action:'create',projectJson:'not JSON'}));
  await assert.rejects(service.execute({action:'create',project:emptyProject(),projectJson:'{}'}));
  await assert.rejects(service.execute({action:'save',id:a.id,expectedRevision:1}));
  await assert.rejects(service.execute({action:'unknown'}));
});

test('trash racing an old autosave cannot resurrect deleted artwork',async()=>{
  const {service}=setup(),a=await service.execute({action:'create'});
  const trash=service.execute({action:'trash',id:a.id,expectedRevision:1});
  const save=service.execute({action:'save',id:a.id,expectedRevision:1,project:a.project});
  await trash;await assert.rejects(save,errorCode('CONFLICT'));
  const current=await service.execute({action:'get',id:a.id});assert.ok(current.deletedAt);
  await assert.rejects(service.execute({action:'save',id:a.id,expectedRevision:current.revision,project:a.project}),errorCode('DELETED'));
});

test('pagination covers all records and ID collisions cannot overwrite artwork',async()=>{
  const {service}=setup();
  for(let i=0;i<23;i++)await service.execute({action:'create',name:`item ${i}`});
  const first=await service.execute({action:'list'}),last=await service.execute({action:'list',offset:first.nextOffset});
  assert.equal(first.items.length,20);assert.equal(last.items.length,3);assert.equal(last.nextOffset,null);
  assert.equal(new Set([...first.items,...last.items].map(x=>x.id)).size,23);
  service.makeId=()=>first.items[0].id;
  await assert.rejects(service.execute({action:'create',name:'Do not overwrite'}),errorCode('ID_COLLISION'));
  assert.equal((await service.execute({action:'list'})).total,23);
});

test('real zod record schema accepts canonical record and rejects corrupt data',async()=>{
  const {service}=setup(),a=await service.execute({action:'create'});assert.deepEqual(libraryRecordSchema.parse(a),a);
  for(const row of [{...a,id:'../x'},{...a,revision:0},{...a,revision:Number.MAX_SAFE_INTEGER+1},{...a,createdAt:'today'},{...a,project:{}}])assert.throws(()=>libraryRecordSchema.parse(row));
});

test('Host entry opens old domain read-only then new underscore domain and owns disposal',async()=>{
  const oldTable=table(),newTable=table(),meta=table();await oldTable.put('current',{revision:5,project:emptyProject()});
  const before=JSON.stringify([...oldTable.entries()]),events=[],cleanup=[];
  const ctx={effect(fn){const result=fn();if(result?.then)return result.then(dispose=>{cleanup.push(dispose);return dispose;});cleanup.push(result);return result;},tools:{register(){return()=>{};}},webServer:{register(){return()=>{};},getOrigin(){return 'http://127.0.0.1';}},storageDomain:{async open(spec){events.push(spec.name);assert.match(spec.name,/^[a-z][a-z0-9_]*$/);if(spec.name==='local_bead_studio_projects')return{table:()=>oldTable,async close(){events.push('old close');}};assert.equal(spec.layout,'per-record');return{table:name=>name==='projects'?newTable:meta,async close(){events.push('new close');}};}}};
  await apply(ctx);assert.deepEqual(events,['local_bead_studio_projects','old close','local_bead_library']);assert.equal(JSON.stringify([...oldTable.entries()]),before);assert.ok(newTable.get('legacy_v1'));
  await cleanup.at(-1)();assert.equal(events.at(-1),'new close');
  await assert.rejects(apply({...ctx,storageDomain:{async open(){throw Error('init visible');}}}),/init visible/);
});

test('HTTP and tool share CRUD semantics, conflicts and authorization limits',async t=>{
  const {service}=setup();let route,tool,origin;const effects=[];
  const ctx={effect(fn){const d=fn();effects.push(d);return d;},tools:{register:x=>(tool=x,()=>{})},webServer:{getOrigin:()=>origin,register:x=>(route=x,()=>{})}};
  const registration=registerLibrary(ctx,service),server=http.createServer((req,res)=>route.handler(req,res));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{await registration.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  const headers={'Content-Type':'application/json','X-DSH-Bead-Studio':'1',Origin:origin};
  const request=(body,extra={})=>fetch(origin,{method:'POST',headers:{...headers,...extra},body:typeof body==='string'?body:JSON.stringify(body)});
  const exec=args=>tool.execute(args,{signal:new AbortController().signal});
  const a=await(await request({action:'create',name:'HTTP'})).json();assert.deepEqual(await exec({action:'get',id:a.id}),a);
  const b=await exec({action:'rename',id:a.id,expectedRevision:1,name:'Tool'});assert.deepEqual(await(await request({action:'get',id:a.id})).json(),b);
  assert.equal((await request({action:'rename',id:a.id,expectedRevision:1,name:'Stale'})).status,409);
  const c=await exec({action:'save',id:a.id,expectedRevision:2,projectJson:JSON.stringify(b.project)});assert.equal(c.revision,3);
  assert.deepEqual(await(await request({action:'list'})).json(),await exec({action:'list'}));
  const duplicate=await exec({action:'duplicate',id:a.id,expectedRevision:3,name:'Copy'});
  const trash=await(await request({action:'trash',id:duplicate.id,expectedRevision:1})).json();
  const restore=await exec({action:'restore',id:trash.id,expectedRevision:trash.revision});assert.equal(restore.deletedAt,null);
  const trashAgain=await exec({action:'trash',id:restore.id,expectedRevision:restore.revision});
  assert.equal((await request({action:'purge',id:trashAgain.id,expectedRevision:trashAgain.revision})).status,400);
  assert.deepEqual(await exec({action:'purge',id:trashAgain.id,expectedRevision:trashAgain.revision,confirm:'DELETE'}),{id:trashAgain.id,purged:true});
  assert.equal((await request({action:'get',id:trashAgain.id})).status,404);
  for(const Origin of ['null','https://evil.example',''])assert.equal((await request({action:'list'},{Origin})).status,403);
  assert.equal((await request({action:'list'},{'X-DSH-Bead-Studio':''})).status,403);
  assert.equal((await request('{')).status,400);assert.equal((await request(' '.repeat(1300001))).status,413);
  assert.equal(effects.length,2);
});
