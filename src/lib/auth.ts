import {timingSafeEqual} from "node:crypto";
export function safeEqual(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)}
export function authorized(request:Request,kind:"admin"|"sync"="admin"){
 const secret=process.env[kind==="admin"?"ADMIN_PASSWORD":"SYNC_SECRET"];
 if(!secret)return false;
 const header=request.headers.get("authorization")||"";
 return safeEqual(header,"Bearer "+secret);
}
