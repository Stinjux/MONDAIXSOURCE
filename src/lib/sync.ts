import {prisma} from "./prisma";
import {readSheet} from "./google";
import {parseRow,type SheetSource} from "./normalize";
export async function syncSource(source:SheetSource){
 const log=await prisma.importEvent.create({data:{source}});
 let imported=0,updated=0,duplicates=0,errors=0;
 try {
  const rows=await readSheet(source);
  for(let index=0;index<rows.length;index++){
   const row=rows[index];if(index===0&&/asin/i.test(row[1]||""))continue;
   if(!row.some(Boolean))continue;
   const parsed=parseRow(source,row,index+1);
   if(!parsed){errors++;continue;}
   const {source:src,sourceRow,key,...fields}=parsed;
   const existing=await prisma.lead.findUnique({where:{source_sourceRow:{source:src,sourceRow}}});
   if(existing){
     if(existing.key!==key){ // sheet row repurposed: reset review metadata for new lead
      await prisma.lead.update({where:{id:existing.id},data:{...fields,key,occurrences:1,firstSeenAt:new Date(),status:"NEW",reviewStatus:"PENDING",reviewedAt:null}});
      imported++;
     } else {
      await prisma.lead.update({where:{id:existing.id},data:{...fields,key}});
      updated++;
     }
   }else{
    const same=await prisma.lead.findFirst({where:{key}});
    if(same)duplicates++;
    await prisma.lead.create({data:{source:src,sourceRow,key,...fields}});
    imported++;
   }
  }
  await prisma.importEvent.update({where:{id:log.id},data:{imported,updated,duplicates,errors}});
  return {source,imported,updated,duplicates,errors};
 }catch(e){
  await prisma.importEvent.update({where:{id:log.id},data:{imported,updated,duplicates,errors:errors+1,details:e instanceof Error?e.message:"Unknown error"}});
  throw e;
 }
}
export async function syncAll(){return [await syncSource("LEADS"),await syncSource("OUT_OF_STOCK")]}
