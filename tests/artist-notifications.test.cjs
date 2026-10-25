'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {notificationId,inboxOptions}=require('../lib/artist-notifications');
test('notification cursors and acknowledgement references reject invalid database casts',()=>{
 for(const value of ['1','9223372036854775807'])assert.equal(notificationId(value),value);
 for(const value of [null,1,'0','-1','1e3','1.0',' 12','9223372036854775808','x','1 OR TRUE'])assert.throws(()=>notificationId(value),e=>e.status===400);
 assert.deepEqual(inboxOptions(new URLSearchParams('before=12&unread=1')),{before:'12',unread:true});
 assert.deepEqual(inboxOptions(new URLSearchParams()),{before:null,unread:false});
 assert.throws(()=>inboxOptions(new URLSearchParams('unread=true')),e=>e.status===400);
});
