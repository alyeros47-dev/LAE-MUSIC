'use strict';
// Synthetic completed songs for owned disposable databases/containers only.
const crypto=require('node:crypto'),assert=require('node:assert/strict'),path=require('node:path');
async function seedStudioSong(pool,artistId,title,audio){
 const identity=(await pool.query('SELECT current_database() AS name,host(inet_server_addr()) AS host,inet_server_port() AS port')).rows[0];
 const review=identity.name==='lae_music_review'&&identity.host==='127.0.0.1'&&identity.port===55432&&['LAE_REVIEW_FIXTURE_SEED','LAE_REVIEW_RELEASE_TESTS'].some(k=>process.env[k]==='1');
 if(!review){const url=require('./ci-database.cjs').ciDatabase();assert.equal(identity.name,'lae_music_ci');assert(['localhost','127.0.0.1'].includes(url.hostname));}
 const task='isolated_fixture_'+crypto.randomBytes(10).toString('hex'),clip='isolated_clip_'+crypto.randomBytes(10).toString('hex');
 await pool.query("INSERT INTO sonic_test_tasks(task_id,creator_id,status) VALUES($1,$2,'succeeded')",[task,artistId]);
 return require(path.join(process.cwd(),'lib/music-upload-codes')).issue({pool,artistId,taskId:task,clipId:clip,provider:{clips:async()=>[{clip_id:clip,title,audio_url:'https://fixture.invalid/original.mp3'}]},download:async()=>({bytes:audio})});
}
function seedContainerSong(name,artistId,title,audio){
 assert(process.env.LAE_REVIEW_CONTAINER_TESTS==='1'||process.env.LAE_REVIEW_PERSISTENCE_TESTS==='1');
 assert(/^lae-(review-ci|integrations-ci|review-state-test-[a-f0-9]{12}-[ab])$/.test(name));
 const {execFileSync}=require('node:child_process'),env={...process.env};for(const k of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete env[k];
 const docker=args=>execFileSync('docker',['--host=unix:///var/run/docker.sock',...args],{env,encoding:'utf8',input:JSON.stringify({artistId,title,audio:audio.toString('base64')}),maxBuffer:1024*1024});
 docker(['cp',__filename,name+':/app/lae-studio-song-fixture.cjs']);
 docker(['exec','--user','0',name,'chmod','644','/app/lae-studio-song-fixture.cjs']);
 return JSON.parse(docker(['exec','--user','postgres','-i','-e','LAE_REVIEW_FIXTURE_SEED=1',name,'node','/app/lae-studio-song-fixture.cjs']));
}
module.exports={seedStudioSong,seedContainerSong};
if(require.main===module)(async()=>{
 assert.equal(process.env.LAE_REVIEW_FIXTURE_SEED,'1');
 const chunks=[];for await(const c of process.stdin)chunks.push(c);const input=JSON.parse(Buffer.concat(chunks));
 const fs=require('node:fs'),{Pool}=require(path.join(process.cwd(),'node_modules/pg')),password=fs.readFileSync('/tmp/lae-review-password','utf8').trim();
 const pool=new Pool({host:'127.0.0.1',port:55432,database:'lae_music_review',user:'postgres',password});
 try{console.log(JSON.stringify(await seedStudioSong(pool,input.artistId,input.title,Buffer.from(input.audio,'base64'))));}finally{await pool.end();}
})().catch(()=>{console.error('Disposable Studio song fixture refused or failed.');process.exitCode=1;});
