import {z} from 'zod';
import {normalizeProject} from './project.js';
import {LibraryService,registerLibrary} from './library-host.js';

const legacyValueSchema=z.object({revision:z.number().int().positive(),project:z.unknown()}).transform(row=>({revision:row.revision,project:normalizeProject(row.project)}));
export const libraryRecordSchema=z.object({
  id:z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),revision:z.number().int().positive(),
  project:z.unknown(),createdAt:z.string().datetime(),deletedAt:z.string().datetime().nullable()
}).transform(row=>({...row,project:normalizeProject(row.project)}));
export const inject=['webServer','tools','storageDomain'];

/** Own both domain lifetimes; await setup so a failed migration fails activation. */
export async function apply(ctx) {
  await ctx.effect(async()=>{
    let legacy=null;
    const old=await ctx.storageDomain.open({name:'local_bead_studio_projects',version:1,layout:'single',tables:{projects:{valueSchema:legacyValueSchema}}});
    try {const row=old.table('projects').get('current');if(row)legacy={revision:row.revision,project:normalizeProject(row.project)};}
    finally {await old.close();}
    const domain=await ctx.storageDomain.open({name:'local_bead_library',version:1,layout:'per-record',tables:{projects:{valueSchema:libraryRecordSchema},metadata:{valueSchema:z.object({done:z.literal(true)})}}});
    const service=new LibraryService(domain.table('projects'),domain.table('metadata'));
    let registration;
    try {await service.migrate(legacy);registration=registerLibrary(ctx,service);}
    catch(error){await service.close();await domain.close();throw error;}
    return async()=>{try{await registration.dispose();}finally{await domain.close();}};
  });
}
