import test from "node:test";import assert from "node:assert/strict";
import {parseRow,normalizeUrl,amount} from "../src/lib/normalize";
test("parse LEADS A-J",()=>{const x=parseRow("LEADS",["Nike Socks","B012345678","https://amazon.ca/dp/B012345678","40","45","90","2026-10-13","7","20","https://shop.ca/item?utm_source=x"],2);assert.equal(x?.costPrice,20);assert.equal(x?.supplierKey,"shop.ca/item");});
test("parse OOS A-P",()=>{const x=parseRow("OUT_OF_STOCK",["Brush","B012345678","","30","40","50","30","12","100","Walmart","note","22","CAD","OUT","2026-10-13","checked"],5);assert.equal(x?.availability,"OUT");assert.equal(x?.sourceRow,5);});
test("amount localized",()=>assert.equal(amount("1 234,56 $"),1234.56));
test("normalize URL tracking",()=>assert.equal(normalizeUrl("https://www.shop.ca/a/?utm_x=1"),"shop.ca/a"));
