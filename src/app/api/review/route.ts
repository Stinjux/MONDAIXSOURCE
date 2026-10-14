import {authorized} from "@/lib/auth";import {prisma} from "@/lib/prisma";
export const runtime="nodejs";
export async function PATCH(request:Request){
 if(!authorized(request))return Response.json({error:"Unauthorized"},{status:401});
 const body=await request.json().catch(()=>null);
 if(!body||typeof body.id!=="string"||!["PENDING","REVIEWED","REJECTED","FOLLOW_UP"].includes(body.status))return Response.json({error:"Invalid input"},{status:400});
 const item=await prisma.lead.update({where:{id:body.id},data:{reviewStatus:body.status,reviewedAt:body.status==="PENDING"?null:new Date()}}).catch(()=>null);
 return item?Response.json({ok:true}):Response.json({error:"Not found"},{status:404});
}
