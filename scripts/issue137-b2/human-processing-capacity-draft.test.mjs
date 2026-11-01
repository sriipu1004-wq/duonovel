import assert from "node:assert/strict";
import {decideHumanProcessingTrialCapacity as decide} from
 "../../src/lib/recording/humanProcessingCapacityDraft.ts";
const cap=8*1024*1024+256;
const check=(size,raw,local,status)=>assert.equal(decide(size,raw,local).status,status);
check(cap,String(cap),true,"allowed");
check(cap+1,String(cap),true,"exceeded");
check(4*1024*1024,String(cap),true,"allowed");
check(cap+1,String(cap),false,"inactive");
check(cap+1,undefined,true,"inactive");
for(const raw of ["","0","invalid","4.1","10000000000000000000000",
 String(4*1024*1024),String(1024*1024*1024+1)])
 check(cap,raw,true,"invalid");
assert.equal(decide(cap+1,String(cap),true).capBytes,cap);
console.log("PASS: #137 nonproduction capacity gate 13 boundary assertions; no Production cap selected");
