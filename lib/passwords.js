'use strict';
const crypto=require('node:crypto');
const scrypt=require('node:util').promisify(crypto.scrypt);
const {fail}=require('./transactions');
function validatePassword(value){if(typeof value!=='string'||value.length<10||value.length>128)throw fail(400,'Use a password of 10–128 characters.');return value;}
async function hashPassword(value){validatePassword(value);const salt=crypto.randomBytes(16).toString('hex');return {salt,hash:(await scrypt(value,salt,64)).toString('hex')};}
async function verifyPassword(value,row){
 if(typeof value!=='string'||value.length>128)return false;
 const valid=/^[a-f0-9]{128}$/.test(row?.password_hash||'')&&/^[a-f0-9]{32,64}$/.test(row?.password_salt||'');
 const actual=await scrypt(value,valid?row.password_salt:'0'.repeat(32),64),expected=Buffer.from(valid?row.password_hash:'0'.repeat(128),'hex');
 return crypto.timingSafeEqual(actual,expected)&&valid;
}
const fingerprint=row=>crypto.createHash('sha256').update(JSON.stringify([row.email,row.password_salt,row.password_hash])).digest('hex');
module.exports={validatePassword,hashPassword,verifyPassword,fingerprint};
