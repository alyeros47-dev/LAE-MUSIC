'use strict';
const API='https://api.musicapi.ai/api/v1/sonic';
function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data))}
async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>16000)throw Error('Request too large')}return JSON.parse(raw)}
function songs(data){const items=Array.isArray(data)?data:Array.isArray(data?.data)?data.data:Array.isArray(data?.songs)?data.songs:[];return items.map(s=>({title:String(s.title||'Generated song'),audio_url:s.audio_url||s.audioUrl||s.audio||'',image_url:s.image_url||''})).filter(s=>/^https:\/\//.test(s.audio_url))}
async function remote(path,method,payload){const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),45000);try{const r=await fetch(API+path,{method,headers:{Authorization:'Bearer '+process.env.MUSICAPI_API_KEY,'Content-Type':'application/json'},body:payload?JSON.stringify(payload):undefined,signal:controller.signal});const j=await r.json().catch(()=>({}));if(!r.ok||j.code&&j.code!==200&&r.status!==202){const e=new Error(String(j.message||j.error||j.type||'Music provider request failed'));e.status=r.status;throw e}return j}finally{clearTimeout(timeout)}}
module.exports=async function handleMusicAPI(req,res,p,{me,pool,validOrigin}){
 if(!p.startsWith('/api/music/sonic/'))return false;
 if(!['GET','POST'].includes(req.method))return send(res,405,{error:'Method not allowed'}),true;
 if(req.method==='POST'&&!validOrigin(req))return send(res,403,{error:'Invalid origin'}),true;
 const user=await me(req);
 if(!user)return send(res,401,{error:'Sign in to your LAE-MUSIC artist account first.'}),true;
 if(!pool)return send(res,503,{error:'Music studio database unavailable'}),true;
 if(!process.env.MUSICAPI_API_KEY)return send(res,503,{error:'MusicAPI key is not configured on Render'}),true;
 await pool.query("CREATE TABLE IF NOT EXISTS sonic_test_tasks (task_id TEXT PRIMARY KEY, creator_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
 if(p==='/api/music/sonic/create'&&req.method==='POST'){
  const b=await body(req),title=String(b.title||'').trim(),lyrics=String(b.lyrics||'').trim(),style=String(b.style||'').trim();
  if(title.length<2||title.length>120||lyrics.length<20||lyrics.length>6000||style.length<3||style.length>2000)return send(res,400,{error:'Enter a title, lyrics and music style within the permitted lengths.'}),true;
  const recent=await pool.query("SELECT count(*)::int AS total, count(*) FILTER (WHERE status IN ('pending','running') AND created_at>NOW()-INTERVAL '15 minutes')::int AS active FROM sonic_test_tasks WHERE creator_id=$1 AND created_at>NOW()-INTERVAL '24 hours'",[user.id]);
  if(recent.rows[0].active>0)return send(res,429,{error:'Your previous song is still processing. Please wait before starting another.'}),true;
  if(recent.rows[0].total>=5)return send(res,429,{error:'Testing limit: 5 generation requests per account per 24 hours.'}),true;
  const result=await remote('/create','POST',{task_type:'create_music',custom_mode:true,mv:'sonic-v6',title,prompt:lyrics,tags:style,make_instrumental:false});
  const id=result.task_id||result.data?.task_id;
  if(!id)return send(res,502,{error:'Music provider did not return a task ID.'}),true;
  await pool.query('INSERT INTO sonic_test_tasks(task_id,creator_id,status) VALUES($1,$2,$3)',[id,user.id,'pending']);
  return send(res,200,{task_id:id,status:'pending'}),true;
 }
 if(p==='/api/music/sonic/status'&&req.method==='GET'){
  const id=new URL(req.url,'http://localhost').searchParams.get('id')||'';
  if(!/^[a-zA-Z0-9_-]{8,128}$/.test(id))return send(res,400,{error:'Invalid task ID'}),true;
  const owned=await pool.query('SELECT task_id,status FROM sonic_test_tasks WHERE task_id=$1 AND creator_id=$2',[id,user.id]);
  if(!owned.rowCount)return send(res,404,{error:'Song request not found for this account'}),true;
  const result=await remote('/task/'+encodeURIComponent(id),'GET');
  const state=String(result.status||result.state||result.data?.status||result.data?.state|| (result.code===102?'running':'pending')).toLowerCase();
  const found=songs(result.data||result.results||result);
  const status=found.length?'succeeded':state==='failed'?'failed':state==='succeeded'?'succeeded':state==='running'?'running':'pending';
  await pool.query('UPDATE sonic_test_tasks SET status=$1 WHERE task_id=$2',[status,id]);
  return send(res,200,{task_id:id,status,songs:found,error:status==='failed'?String(result.message||result.error||'Generation failed'):undefined}),true;
 }
 return send(res,404,{error:'Unknown music endpoint'}),true;
};
