import { google } from "googleapis";
import type {SheetSource} from "./normalize";
export async function readSheet(source:SheetSource):Promise<string[][]>{
 const id=process.env[source==="LEADS"?"LEADS_SHEET_ID":"OOS_SHEET_ID"];
 const range=process.env[source==="LEADS"?"LEADS_SHEET_RANGE":"OOS_SHEET_RANGE"]||"Sheet1!A:Z";
 const encoded=process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
 if(!id||!encoded)throw new Error("Google Sheets configuration missing");
 const credentials=JSON.parse(Buffer.from(encoded,"base64").toString("utf8"));
 const auth=new google.auth.GoogleAuth({credentials,scopes:["https://www.googleapis.com/auth/spreadsheets.readonly"]});
 const api=google.sheets({version:"v4",auth});
 const response=await api.spreadsheets.values.get({spreadsheetId:id,range,valueRenderOption:"FORMATTED_VALUE"});
 return (response.data.values||[]).map(row=>row.map(String));
}
