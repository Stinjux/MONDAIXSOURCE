export type SheetSource = "LEADS" | "OUT_OF_STOCK";
export type ParsedLead = {
 source: SheetSource; sourceRow:number; asin:string; name:string; key:string; supplierKey:string;
 amazonUrl?:string; supplierUrl?:string; store?:string; salePrice?:number; costPrice?:number;
 buyBox90?:number; fbaFee?:number; estimatedSales?:number; currency?:string;
 availability?:string; notes?:string; sheetRoi?:number; sheetMargin?:number; sheetProfit?:number;
 lastChecked?:string; checkDetail?:string; exportDate?:string;
};
export const amount=(value:string|undefined):number|undefined=>{
 if(!value?.trim()) return undefined;
 const v=value.replace(/[^\d,.-]/g,""); if(!v) return undefined;
 const decimal=v.includes(",")&&v.includes(".") ? (v.lastIndexOf(",")>v.lastIndexOf(".") ? v.replace(/\./g,"").replace(",",".") : v.replace(/,/g,"")) : v.includes(",") ? v.replace(",",".") : v;
 const n=Number(decimal);return Number.isFinite(n)?n:undefined;
};
export function normalizeUrl(value:string|undefined):string {
 if(!value) return "";
 try { const u=new URL(value.trim()); const keep=new URLSearchParams(); for(const k of ["sku","variant"]) if(u.searchParams.has(k)) keep.set(k,u.searchParams.get(k)!);
 return u.hostname.toLowerCase().replace(/^www\./,"")+u.pathname.replace(/\/$/,"").toLowerCase()+(keep.size?"?"+keep.toString():""); }catch{return value.trim().toLowerCase();}
}
export function supplierIdentity(url?:string,store?:string):string {
 return normalizeUrl(url)||store?.trim().toLowerCase()||"unknown";
}
const at=(r:string[],i:number)=>(r[i]||"").trim();
export function parseRow(source:SheetSource,r:string[],sourceRow:number):ParsedLead|null {
 const asin=at(r,1).toUpperCase();
 if(!/^[A-Z0-9]{10}$/.test(asin))return null;
 if(source==="LEADS") {
 const supplierUrl=at(r,9);const supplierKey=supplierIdentity(supplierUrl);
 return {source,sourceRow,asin,name:at(r,0),key:asin+"|"+supplierKey,supplierKey,amazonUrl:at(r,2),buyBox90:amount(r[3]),salePrice:amount(r[4]),estimatedSales:amount(r[5]),exportDate:at(r,6),fbaFee:amount(r[7]),costPrice:amount(r[8]),supplierUrl,currency:"CAD"};
 }
 const store=at(r,9);const supplierKey=supplierIdentity(/^https?:\/\//i.test(store)?store:undefined,store);
 return {source,sourceRow,asin,name:at(r,0),key:asin+"|"+supplierKey,supplierKey,amazonUrl:at(r,2),buyBox90:amount(r[3]),salePrice:amount(r[4]),sheetRoi:amount(r[5]),sheetMargin:amount(r[6]),sheetProfit:amount(r[7]),estimatedSales:amount(r[8]),store,notes:at(r,10),costPrice:amount(r[11]),currency:at(r,12),availability:at(r,13),lastChecked:at(r,14),checkDetail:at(r,15)};
}
export function weekBounds(date:Date):{start:Date;end:Date} {
 const local=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Toronto",year:"numeric",month:"2-digit",day:"2-digit",weekday:"short"}).formatToParts(date);
 const get=(k:string)=>local.find(x=>x.type===k)?.value||"";
 const midnight=new Date(get("year")+"-"+get("month")+"-"+get("day")+"T12:00:00Z");
 const weekday=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(get("weekday"));
 midnight.setUTCDate(midnight.getUTCDate()-(weekday+6)%7);
 const d=midnight.toISOString().slice(0,10);
 const last=new Date(midnight);last.setUTCDate(last.getUTCDate()+7);
 // dates are calendar-based; the exclusive upper bound remains at local midnight via UTC midday reference
 return {start:new Date(d+"T00:00:00Z"),end:new Date(last.toISOString().slice(0,10)+"T00:00:00Z")};
}
