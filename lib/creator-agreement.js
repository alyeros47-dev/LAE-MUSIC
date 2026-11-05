'use strict';
const crypto=require('node:crypto'),agreement=require('../config/music-creator-agreement.json');
const {transaction,audit,fail}=require('./transactions');
const hash=crypto.createHash('sha256').update(JSON.stringify(agreement)).digest('hex');
function disclosure(){return {...agreement,content_hash:hash};}
async function accepted(db,artistId){return (await db.query('SELECT id,version,content_hash,accepted_at FROM creator_agreement_acceptances WHERE artist_id=$1 AND version=$2 AND content_hash=$3',[artistId,agreement.version,hash])).rows[0]||null;}
async function requireAcceptance(db,artistId){const a=await accepted(db,artistId);if(!a)throw fail(428,'Review and accept the LAE-MUSIC Music Creator Agreement before creating or publishing new music.');return a;}
async function accept(pool,artistId,input){if(input?.accepted!==true||input.version!==agreement.version||input.content_hash!==hash)throw fail(400,'Explicitly accept the current Music Creator Agreement.');return transaction(pool,async db=>{await db.query('SELECT id FROM creators WHERE id=$1 FOR UPDATE',[artistId]);const q=await db.query('INSERT INTO creator_agreement_acceptances(artist_id,version,content_hash,agreement) VALUES($1,$2,$3,$4) ON CONFLICT(artist_id,version,content_hash) DO NOTHING RETURNING id,version,content_hash,accepted_at',[artistId,agreement.version,hash,JSON.stringify(agreement)]);const record=q.rows[0]||await accepted(db,artistId);if(q.rowCount)await audit(db,{type:'artist',id:artistId},'membership.agreement.accept',String(record.id),{version:agreement.version,content_hash:hash});return record;});}
module.exports={disclosure,accepted,requireAcceptance,accept};
