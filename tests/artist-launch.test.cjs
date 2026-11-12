'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),launch=require('../lib/artist-launch-access');
test('only database account-ID grants unlock owner or promotional access',async()=>{
 const seen=[],db={query:async(sql,args)=>{seen.push({sql,args});return {rowCount:1,rows:[{owner_unlimited:true,promotion:false,promotion_used:false}]};}};
 assert.deepEqual(await launch.state(db,'17'),{owner_unlimited:true,promotion:false,remaining_generations:null});
 assert.deepEqual(seen[0].args,['17']);assert(!seen[0].sql.includes('email'));
 const invalid={query:async()=>({rowCount:1,rows:[{owner_unlimited:'true',promotion:'true'}]})};
 assert.deepEqual(await launch.state(invalid,17),{owner_unlimited:false,promotion:false,remaining_generations:0});
 assert.deepEqual(await launch.state(null,17),{owner_unlimited:false,promotion:false,remaining_generations:0});
});
test('unlimited access is represented explicitly, and a spent promotion grants no new generation',async()=>{
 const db=value=>({query:async()=>({rowCount:1,rows:[value]})});
 const owner=await launch.allowance(db({owner_unlimited:true}),1);assert.equal(owner.unlimited,true);assert.equal(owner.remaining_generations,null);assert.equal(owner.tracks_per_generation,2);
 const free=await launch.allowance(db({promotion:true,promotion_used:true}),2);assert.equal(free.unlimited,false);assert.equal(free.remaining_generations,0);assert.equal(free.active,true,'the two completed tracks can still be published');
 assert.equal(await launch.reserve(db({}),3,'reference'),null);
 await assert.rejects(launch.settle({query:()=>{throw Error('must not query');}},3,'reference','unknown'),/Invalid/);
});
test('the public offer is closed without verified capacity information',async()=>{
 assert.equal(await launch.open(null),false);
 for(const value of [false,undefined,'true'])assert.equal(await launch.open({query:async()=>({rows:[{open:value}]})}),false);
 assert.equal(await launch.open({query:async()=>({rows:[{open:true}]})}),true);
});
