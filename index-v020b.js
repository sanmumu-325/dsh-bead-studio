import { z } from 'zod';
import { apply as applyBase } from './host-v4.js';
import { normalizeProject } from './project.js';
import { registerProject } from './project-host.js';
export const inject=['webServer','tools','storageDomain'];
export async function apply(ctx){
  applyBase(ctx);
  await ctx.effect(async()=>{
    const valueSchema=z.object({revision:z.number().int().positive(),project:z.unknown()}).transform(record=>({revision:record.revision,project:normalizeProject(record.project)}));
    const domain=await ctx.storageDomain.open({name:'local_bead_studio_projects',version:1,layout:'single',tables:{projects:{valueSchema}}});
    let registration;
    try{registration=registerProject(ctx,domain.table('projects'));}catch(e){await domain.close();throw e;}
    return async()=>{await registration.dispose();await domain.close();};
  });
}
