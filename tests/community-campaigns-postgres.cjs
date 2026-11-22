'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),{Pool}=require('pg');
const {createCampaigns}=require('../lib/community-campaigns');
const target=require('./ci-database.cjs').ciDatabase();
(async()=>{
 const control=new Pool({connectionString:target.href}),schema='campaign_'+crypto.randomBytes(6).toString('hex');await control.query('CREATE SCHEMA '+schema);
 const pool=new Pool({connectionString:target.href,options:'-c search_path='+schema});
 try{
  await pool.query(fs.readFileSync('migrations/041-community-campaigns.sql','utf8'));
  await pool.query('CREATE TABLE platform_audit(actor_type TEXT,actor_id TEXT,action TEXT,resource TEXT,details JSONB)');
  let now=Date.now();const service=createCampaigns({pool,env:{CAMPAIGN_TOKEN_KEY:'local-fixture-only'},now:()=>now});
  const first='https://chat.whatsapp.com/CreatorFixture123456789',second='https://chat.whatsapp.com/OfficialFixture123456789';
  const before=await service.report();assert(before.campaigns.every(c=>c.warning&&c.invitation_url===''));
  await service.save({slug:'creator-network',invitation_url:first,pixel_id:'123456789012345'},'fixture-owner');
  await service.save({slug:'gospel-creators',invitation_url:second},'fixture-owner');
  async function request(path,options={}){
   const headers={};let status,text='';const res={setHeader(k,v){headers[k.toLowerCase()]=v;},writeHead(s,h={}){status=s;for(const[k,v]of Object.entries(h))headers[k.toLowerCase()]=v;},end(value){text=String(value||'');}};
   await service.handle({method:options.method||'GET',headers:options.headers||{}},res,new URL(path,'https://lae.test'),{json:(r,s,x)=>{status=s;text=JSON.stringify(x);}});return {status,headers,text};
  }
  const a=await request('/join/creator-network?utm_source=facebook&utm_campaign=creators&fbclid=private');
  const b=await request('/join/gospel-creators?utm_source=instagram&utm_campaign=official');
  assert.equal(a.status,200);assert(a.text.includes('data-pixel="123456789012345"'));assert(!b.text.includes('data-pixel='));
  const clickA=a.text.match(/href="(\/join\/creator-network\/whatsapp\?t=[^"]+)"/)[1];
  const clickB=b.text.match(/href="(\/join\/gospel-creators\/whatsapp\?t=[^"]+)"/)[1];
  const outcomes=await Promise.all(Array.from({length:12},()=>request(clickA)));assert(outcomes.every(r=>r.headers.location===first));
  assert.equal((await request(clickB)).headers.location,second);
  await request('/join/creator-network',{method:'HEAD'});await request('/join/creator-network',{headers:{'user-agent':'facebookexternalhit/1.1'}});
  let report=await service.report();assert.deepEqual(report.campaigns.map(c=>[c.visits,c.clicks]),[['1','1'],['1','1']]);
  assert.equal(report.daily.find(r=>r.slug==='creator-network').attribution.utm_campaign,'creators');assert(!JSON.stringify(report).includes('fbclid'));
  assert.equal((await request(clickA.replace('/creator-network/','/gospel-creators/'))).headers.location,'/join/gospel-creators');
  await service.save({slug:'creator-network',invitation_url:second,pixel_id:''},'fixture-owner');assert.equal((await request(clickA)).headers.location,second,'Updated invitations take effect without a restart');
  now+=1800001;assert.equal((await request(clickA)).headers.location,'/join/creator-network');
  await service.save({slug:'creator-network',invitation_url:''},'fixture-owner');assert.equal((await request(clickA)).status,503);
  await assert.rejects(service.save({slug:'creator-network',invitation_url:'https://example.com/unsafe'},'fixture-owner'));
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM platform_audit')).rows[0].n,4);
  console.log('PASS real PostgreSQL: additive migration, separate settings/UTM totals, concurrent click deduplication, correct redirects, bot/HEAD exclusion, expired/cross-campaign tokens, link replacement/removal, audit records.');
 }finally{await pool.end();await control.query('DROP SCHEMA '+schema+' CASCADE');await control.end();}
})().catch(e=>{console.error(e);process.exitCode=1;});
