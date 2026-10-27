'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const src=fs.readFileSync(require('node:path').join(__dirname,'..','server.js'),'utf8');
function extract(start,end){const a=src.indexOf(start),b=src.indexOf(end,a+start.length);assert(a>=0&&b>a,'Cannot locate '+start);return src.slice(a,b)}
const referral=extract('async function recordVerifiedProductReferral(', '// One-time affiliate enrollment only.');
const reconciliation=extract('async function reconcileClosedAffiliateQuarter(', 'async function reconcileDemoReferrals(');
const calls=[];
const members=new Map([[10,{id:10,referred_by:null}],[20,{id:20,referred_by:10}],[30,{id:30,referred_by:20}],[40,{id:40,referred_by:30}]]);
const client={query:async(sql,params=[])=>{calls.push({sql,params});if(sql.includes('SELECT id,referred_by FROM creators')){const row=members.get(Number(params[0]));return {rowCount:row?1:0,rows:row?[row]:[]}}return {rowCount:1,rows:[]}}};
const context={PLANS:{starter:{usd:6,directReferralPercent:15},growth:{usd:10,directReferralPercent:25},professional:{usd:20,directReferralPercent:25}},pool:{connect:async()=>client},Date,Error,Number,Math,console};
vm.createContext(context);
vm.runInContext(referral+'\n'+reconciliation,context);
async function run(){
 await context.recordVerifiedProductReferral(client,101,99,'starter',20);
 assert.equal(calls.filter(c=>c.sql.includes('INSERT INTO affiliate_subscription_commissions')).length,1);
 assert.equal(calls.find(c=>c.sql.includes('INSERT INTO affiliate_subscription_commissions')).params[4],90);
 assert.equal(calls.find(c=>c.sql.includes('INSERT INTO affiliate_team_sales')).params[2],10);
 calls.length=0;
 await context.recordVerifiedProductReferral(client,102,99,'growth',30);
 assert.equal(calls.find(c=>c.sql.includes('INSERT INTO affiliate_subscription_commissions')).params[4],250);
 assert.equal(calls.find(c=>c.sql.includes('INSERT INTO affiliate_team_sales')).params[2],20,'C sales must benefit B, never A');
 calls.length=0;
 await context.recordVerifiedProductReferral(client,103,20,'professional',20);
 assert.equal(calls.length,0,'Self referral must be rejected');
 await context.recordVerifiedProductReferral(client,104,99,'starter',10);
 assert.equal(calls.filter(c=>c.sql.includes('INSERT INTO affiliate_team_sales')).length,0,'Top-level affiliate has no team leader');
 calls.length=0;
 await assert.rejects(context.reconcileClosedAffiliateQuarter('2026-02-01'),/Quarter must start/);
 await assert.rejects(context.reconcileClosedAffiliateQuarter('2099-01-01'),/Quarter is not closed/);
 // A fully closed historical quarter should reconcile in one transaction.
 calls.length=0;
 await context.reconcileClosedAffiliateQuarter('2025-01-01');
 assert(calls.some(c=>c.sql.includes('pg_advisory_xact_lock')));
 assert(calls.some(c=>c.sql.includes("s.status='paid'")));
 assert(calls.some(c=>c.sql.includes('seller.referred_by=t.team_leader_id')));
 assert(calls.some(c=>c.sql.includes('COMMIT')));
 console.log('Affiliate transaction behavior tests passed.');
}
run().catch(e=>{console.error(e);process.exitCode=1});
