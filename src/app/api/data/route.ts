import {authorized} from "@/lib/auth";import {prisma} from "@/lib/prisma";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(request:Request){
 if(!authorized(request))return Response.json({error:"Unauthorized"},{status:401});
 const [leads,imports]=await Promise.all([prisma.lead.findMany({orderBy:{firstSeenAt:"desc"},take:5000}),prisma.importEvent.findMany({orderBy:{startedAt:"desc"},take:10})]);
 return Response.json({leads,imports});
}
