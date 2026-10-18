// Durable operational handoff (ADR 0032). Evidence is a state transition, never a chat message.
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireCan, requireVenue, actorCan, overridesOf, worksAt } from "./lib/auth";
import type { Actor } from "./lib/auth";
import { appError } from "./lib/errors";
import { audit } from "./lib/audit";
import { enqueue } from "./lib/notify";
import { parseOrThrow } from "./lib/validate";
import { operatingActionInput, operatingActionTransitionInput } from "../schemas";
import { chainOf } from "../lib/domain/chain";
import type { Overrides } from "../lib/domain/chain";
import { isAtLeast } from "../lib/domain/positions";
import { POSITIONS } from "../lib/domain/types";
import type { Position } from "../lib/domain/types";

type Ctx = QueryCtx | MutationCtx;
type Item = Doc<"operatingActions">;
const DAY = 24*3600_000;
function above(actor: Actor, position: Position, overrides: Overrides) {
  const chain = chainOf(position, overrides);
  return chain.includes(actor.position) || (isAtLeast(actor.primaryPosition,"manager") && chain.includes(actor.primaryPosition));
}
async function venueAccess(ctx: Ctx, actor: Actor, venueId: Id<"venues">) {
  requireVenue(actor, venueId);
  const venue = await ctx.db.get(venueId);
  if (!venue || !venue.active || venue.companyId !== actor.companyId) throw appError("NOT_FOUND");
  return venue;
}
async function managed(ctx: Ctx, actor: Actor, item: Item, overrides?: Overrides) {
  if (actor._id === item.assigneeId || !actorCan(actor,"actions.manage")) return false;
  const target = await ctx.db.get(item.assigneeId);
  if (!target || target.companyId !== actor.companyId) return false;
  return above(actor,target.primaryPosition,overrides ?? await overridesOf(ctx,item.venueId));
}
async function access(ctx: Ctx, actor: Actor, actionId: Id<"operatingActions">) {
  const item = await ctx.db.get(actionId);
  if (!item) throw appError("NOT_FOUND");
  await venueAccess(ctx,actor,item.venueId);
  const canManage = await managed(ctx,actor,item);
  if (item.assigneeId !== actor._id && !canManage) throw appError("FORBIDDEN");
  return { item, canManage };
}
async function targetFor(ctx: Ctx, actor: Actor, venueId: Id<"venues">, id: Id<"users">) {
  const target = await ctx.db.get(id);
  if (!target || !target.active || target.companyId!==actor.companyId || target._id===actor._id ||
    !await worksAt(ctx,target,venueId) || !above(actor,target.primaryPosition,await overridesOf(ctx,venueId))) throw appError("FORBIDDEN");
  return target;
}
function futureDue(dueAt: number) {
  if (dueAt <= Date.now() || dueAt > Date.now()+366*DAY) throw appError("INVALID_INPUT",undefined,{fields:{dueAt:"future"}});
}
async function view(ctx: Ctx, item: Item, canManage: boolean) {
  const assignee = await ctx.db.get(item.assigneeId);
  return {...item, assigneeName: assignee?.name ?? null, assigneeActive: !!assignee?.active, canManage};
}
async function event(ctx: MutationCtx, item: Item, command: string, note: string, actorId?: Id<"users">) {
  await ctx.db.insert("operatingActionEvents", {venueId:item.venueId, actionId:item._id, actorId, command, note,
    state:item.state, revision:item.revision, at:Date.now(), assigneeId:item.assigneeId, dueAt:item.dueAt,
    escalationStage:command==="escalated"?item.escalationStage:undefined});
  await audit(ctx,{actorId,venueId:item.venueId,action:command==="created"?"action.created":command==="escalated"?"action.escalated":"action.changed",
    entity:"operatingActions",entityId:item._id,meta:{command,revision:item.revision}});
}

export const create = mutation({
  args:{venueId:v.id("venues"),assigneeId:v.id("users"),instructions:v.object({en:v.string(),es:v.string()}),dueAt:v.number(),sourceShiftId:v.optional(v.id("shifts")),sourceItem:v.optional(v.number())},
  handler:async(ctx,args)=>{
    const actor=await requireCan(ctx,"actions.manage");
    const p=parseOrThrow(operatingActionInput,args);
    await venueAccess(ctx,actor,args.venueId);
    const target=await targetFor(ctx,actor,args.venueId,args.assigneeId);
    let sourceText:string|undefined;
    if(args.sourceShiftId){
      const shift=await ctx.db.get(args.sourceShiftId);
      const report=await ctx.db.query("closeReports").withIndex("by_shift",q=>q.eq("shiftId",args.sourceShiftId!)).unique();
      if(!shift || shift.venueId!==args.venueId || !report || report.status!=="submitted" || !report.openItems[p.sourceItem!]) throw appError("INVALID_INPUT");
      sourceText=report.openItems[p.sourceItem!];
      const existing=await ctx.db.query("operatingActions").withIndex("by_source",q=>q.eq("sourceShiftId",args.sourceShiftId).eq("sourceItem",p.sourceItem)).unique();
      if(existing){await access(ctx,actor,existing._id); return {actionId:existing._id};}
    }
    futureDue(p.dueAt);
    const actionId=await ctx.db.insert("operatingActions",{venueId:args.venueId,assigneeId:target._id,position:target.primaryPosition,
      instructions:p.instructions,dueAt:p.dueAt,createdBy:actor._id,state:"assigned",revision:1,archived:false,updatedAt:Date.now(),
      sourceShiftId:args.sourceShiftId,sourceItem:p.sourceItem,sourceText,overdue:false,escalationStage:0,nextEscalationAt:p.dueAt});
    await event(ctx,(await ctx.db.get(actionId))!,"created","",actor._id);
    await enqueue(ctx,[target._id],{topic:"approval",key:"actionAssigned",url:`/actions/${actionId}`});
    return {actionId};
  }
});
export const get = query({args:{actionId:v.id("operatingActions")},handler:async(ctx,{actionId})=>{
  const actor=await requireCan(ctx,"actions.own"); const {item,canManage}=await access(ctx,actor,actionId);
  return view(ctx,item,canManage);
}});
export const list = query({args:{venueId:v.id("venues"),scope:v.union(v.literal("mine"),v.literal("supervised")),archive:v.boolean(),paginationOpts:paginationOptsValidator},handler:async(ctx,args)=>{
  const actor=await requireCan(ctx,args.scope==="mine"?"actions.own":"actions.manage");
  await venueAccess(ctx,actor,args.venueId);
  const o=await overridesOf(ctx,args.venueId);
  const positions=POSITIONS.filter(p=>above(actor,p,o));
  const base=args.scope==="mine"?ctx.db.query("operatingActions").withIndex("by_assignee_venue_archived",q=>q.eq("assigneeId",actor._id).eq("venueId",args.venueId).eq("archived",args.archive)):
    ctx.db.query("operatingActions").withIndex("by_venue_archived_due",q=>q.eq("venueId",args.venueId).eq("archived",args.archive))
      .filter(q=>q.and(q.neq(q.field("assigneeId"),actor._id),q.or(...positions.map(p=>q.eq(q.field("position"),p)))));
  const result=await base.paginate(args.paginationOpts);
  const page=[];
  for(const item of result.page){const canManage=await managed(ctx,actor,item,o);if(item.assigneeId===actor._id||canManage)page.push(await view(ctx,item,canManage));}
  return {...result,page};
}});
export const history = query({args:{actionId:v.id("operatingActions"),paginationOpts:paginationOptsValidator},handler:async(ctx,args)=>{
  const actor=await requireCan(ctx,"actions.own");await access(ctx,actor,args.actionId);
  const result=await ctx.db.query("operatingActionEvents").withIndex("by_action",q=>q.eq("actionId",args.actionId)).order("desc").paginate(args.paginationOpts);
  return {...result,page:await Promise.all(result.page.map(async e=>({...e,actorName:e.actorId?(await ctx.db.get(e.actorId))?.name??null:null,
    assigneeName:(await ctx.db.get(e.assigneeId))?.name??null})))};
}});
export const assignees = query({args:{venueId:v.id("venues"),paginationOpts:paginationOptsValidator},handler:async(ctx,args)=>{
  const actor=await requireCan(ctx,"actions.manage");await venueAccess(ctx,actor,args.venueId);
  const o=await overridesOf(ctx,args.venueId);const positions=POSITIONS.filter(p=>above(actor,p,o));
  const result=await ctx.db.query("users").withIndex("by_company_position",q=>q.eq("companyId",actor.companyId))
    .filter(q=>q.and(q.eq(q.field("active"),true),q.neq(q.field("_id"),actor._id),q.or(...positions.map(p=>q.eq(q.field("primaryPosition"),p)))))
    .paginate(args.paginationOpts);
  const page=[];for(const user of result.page) if(await worksAt(ctx,user,args.venueId)) page.push({id:user._id,name:user.name,position:user.primaryPosition});
  return {...result,page};
}});
export const transition = mutation({args:{actionId:v.id("operatingActions"),revision:v.number(),command:v.string(),note:v.string(),assigneeId:v.optional(v.id("users")),dueAt:v.optional(v.number())},handler:async(ctx,args)=>{
  const actor=await requireCan(ctx,"actions.own");const p=parseOrThrow(operatingActionTransitionInput,args);
  const {item,canManage}=await access(ctx,actor,args.actionId);
  if(item.revision!==p.revision) throw appError("VERSION_STALE");
  if(item.archived) throw appError("INVALID_TRANSITION");
  const own=item.assigneeId===actor._id;
  const patch:Partial<Item>={revision:item.revision+1,updatedAt:Date.now()};
  if(p.command==="start"||p.command==="submit"){
    if(!own) throw appError("FORBIDDEN");
    if(!["assigned","in_progress","needs_work"].includes(item.state)) throw appError("INVALID_TRANSITION");
    if(p.command==="start"&&item.state==="in_progress")throw appError("INVALID_TRANSITION");
    patch.state=p.command==="start"?"in_progress":"ready";
  }else{
    if(!canManage)throw appError("FORBIDDEN");
    if(p.command==="verify"||p.command==="return"){
      if(item.state!=="ready")throw appError("INVALID_TRANSITION");
      patch.state=p.command==="verify"?"verified":"needs_work";
    }else if(p.command==="cancel")patch.state="canceled";
    else{
      const target=await targetFor(ctx,actor,item.venueId,args.assigneeId!);futureDue(p.dueAt!);
      Object.assign(patch,{assigneeId:target._id,position:target.primaryPosition,dueAt:p.dueAt,state:"assigned",overdue:false,escalationStage:0,nextEscalationAt:p.dueAt});
    }
  }
  if(patch.state==="verified"||patch.state==="canceled")Object.assign(patch,{archived:true,nextEscalationAt:undefined});
  await ctx.db.patch(item._id,patch);
  const updated=(await ctx.db.get(item._id))!;await event(ctx,updated,p.command,p.note,actor._id);
  const recipients=p.command==="reassign"?[item.assigneeId,updated.assigneeId]:own?[item.createdBy]:[item.assigneeId];
  await enqueue(ctx,recipients.filter(id=>id!==actor._id),{topic:"approval",key:"actionUpdated",url:`/actions/${item._id}`});
  return {ok:true};
}});
export const sweep = internalMutation({args:{},handler:async(ctx)=>{
  const now=Date.now();
  const rows=await ctx.db.query("operatingActions").withIndex("by_next_escalation",q=>q.gt("nextEscalationAt",0).lte("nextEscalationAt",now)).take(50);
  for(const item of rows){
    if(item.archived){await ctx.db.patch(item._id,{nextEscalationAt:undefined});continue;}
    const venue=await ctx.db.get(item.venueId);if(!venue?.active) {await ctx.db.patch(item._id,{nextEscalationAt:now+DAY});continue;}
    const stage=item.escalationStage+1;const target=await ctx.db.get(item.assigneeId);
    const chain=stage===1?chainOf(target?.primaryPosition??item.position,await overridesOf(ctx,item.venueId)):stage===2?["director","owner"] as Position[]:["owner"] as Position[];
    let recipients:Id<"users">[]=[];
    for(const position of chain){
      const users=await ctx.db.query("users").withIndex("by_company_position",q=>q.eq("companyId",venue.companyId).eq("primaryPosition",position)).filter(q=>q.eq(q.field("active"),true)).take(100);
      for(const user of users)if(user._id!==item.assigneeId&&await worksAt(ctx,user,item.venueId))recipients.push(user._id);
      if(recipients.length)break;
    }
    await ctx.db.patch(item._id,{overdue:true,escalationStage:stage,nextEscalationAt:stage<3?item.dueAt+stage*DAY:undefined});
    await event(ctx,{...item,overdue:true,escalationStage:stage},"escalated","",undefined);
    await enqueue(ctx,recipients,{topic:"escalation",key:"actionOverdue",url:`/actions/${item._id}`});
  }
  if(rows.length===50)await ctx.scheduler.runAfter(0,internal.actions.sweep,{});
  return {processed:rows.length};
}});
