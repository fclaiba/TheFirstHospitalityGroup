import { describe, expect, it } from "vitest";
import { buildSteps } from "../lib/guides/plan";
describe("interactive screen walkthrough planning",()=>{
  it("keeps visible role controls and omits hidden, disabled or repeated actions",()=>{
    const steps=buildSteps([
      {id:"intro",kind:"overview",label:"My week",visible:true},
      {id:"one",kind:"field",label:"Week",visible:true},
      {id:"two",kind:"field",label:"Week",visible:true},
      {id:"publish",kind:"action",label:"Publish",visible:false},
      {id:"confirm",kind:"action",label:"Confirm",visible:true,disabled:true},
      {id:"next",kind:"navigation",label:"Next week",visible:true},
    ]);
    expect(steps.map(s=>s.id)).toEqual(["intro","one","next"]);
  });
  it("bounds repeated content and preserves one useful step for an empty screen",()=>{
    expect(buildSteps([])).toEqual([]);
    const items=Array.from({length:80},(_,i)=>({id:String(i),kind:"section" as const,label:`Section ${i}`,visible:true}));
    expect(buildSteps(items)).toHaveLength(24);
  });
});
