import {authorized} from "@/lib/auth";import {syncAll} from "@/lib/sync";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function POST(request:Request){
 if(!authorized(request,"sync"))return Response.json({error:"Unauthorized"},{status:401});
 try{return Response.json({results:await syncAll()})}catch(e){return Response.json({error:e instanceof Error?e.message:"Sync failed"},{status:500})}
}
