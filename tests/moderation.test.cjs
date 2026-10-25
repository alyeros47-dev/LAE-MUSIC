'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {identifier,revision,note}=require('../lib/moderation');
test('moderation references, revisions and review notes are bounded before database mutations',()=>{
 assert.equal(identifier(7),'7');assert.equal(revision('0'),'0');assert.equal(revision(undefined,true),null);assert.equal(note(' A careful review. '),'A careful review.');
 for(const value of ['0','-7','7 OR TRUE','1.2',null])assert.throws(()=>identifier(value),e=>e.status===400);
 for(const value of [undefined,'-1','1e4','01','x'])assert.throws(()=>revision(value),e=>e.status===400);
 for(const value of [null,'','x','a'.repeat(801),'hidden\u0000note'])assert.throws(()=>note(value),e=>e.status===400);
});
