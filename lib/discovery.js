'use strict';
const {fail,digest}=require('./transactions');
function parseDiscovery(params){
  const q=String(params.get('q')||'').trim().slice(0,100),genre=String(params.get('genre')||'').slice(0,60),sort=params.get('sort')==='popular'?'popular':'new';
  const raw=params.get('limit')||'50';if(!/^\d{1,2}$/.test(raw)||Number(raw)<1||Number(raw)>50)throw fail(400,'Choose a page size between 1 and 50 songs.');
  const options={q,genre,sort,limit:Number(raw),filter:digest({q,genre,sort})};
  const token=params.get('cursor');if(token){try{if(token.length>1024||!/^[a-zA-Z0-9_-]+$/.test(token))throw Error();const c=JSON.parse(Buffer.from(token,'base64url').toString());if(c.filter!==options.filter||!/^\d{1,16}$/.test(c.id)||!/^\d{1,19}$/.test(c.plays)||typeof c.at!=='string'||c.at.length>50||!Number.isFinite(Date.parse(c.at)))throw Error();options.cursor=c;}catch{throw fail(400,'This discovery page has expired or does not match your filters.');}}
  return options;
}
async function discover(pool,params){
  const input=parseDiscovery(params),values=[input.q.replace(/[!%_]/g,'!$&'),input.genre],when='COALESCE(t.published_at,t.created_at)';
  let after='';if(input.cursor){if(input.sort==='popular'){values.push(input.cursor.plays,input.cursor.at,input.cursor.id);after=` AND (t.plays,${when},t.id)<($3::bigint,$4::timestamptz,$5::bigint)`;}else{values.push(input.cursor.at,input.cursor.id);after=` AND (${when},t.id)<($3::timestamptz,$4::bigint)`;}}
  values.push(input.limit+1);
  const order=input.sort==='popular'?`t.plays DESC,${when} DESC,t.id DESC`:`${when} DESC,t.id DESC`;
  const [tracks,genres,artists]=await Promise.all([
    pool.query(`SELECT t.id,t.title,t.genre,t.description,t.plays,t.status,t.created_at,t.published_at,c.id AS artist_id,c.display_name AS artist,${when}::text AS cursor_at FROM music_tracks t JOIN creators c ON c.id=t.creator_id WHERE t.status='published' AND ($1='' OR t.title ILIKE '%'||$1||'%' ESCAPE '!' OR c.display_name ILIKE '%'||$1||'%' ESCAPE '!') AND ($2='' OR t.genre=$2)${after} ORDER BY ${order} LIMIT $${values.length}`,values),
    pool.query("SELECT genre,COUNT(*)::int AS tracks FROM music_tracks WHERE status='published' GROUP BY genre ORDER BY tracks DESC,genre LIMIT 30"),
    pool.query("SELECT c.id,c.display_name,COUNT(t.id)::int AS tracks,COALESCE(SUM(t.plays),0)::bigint AS plays FROM creators c JOIN music_tracks t ON t.creator_id=c.id AND t.status='published' GROUP BY c.id ORDER BY plays DESC,c.id LIMIT 12")
  ]);
  const page=tracks.rows.slice(0,input.limit),last=page.at(-1);
  const next=tracks.rows.length>input.limit&&last?Buffer.from(JSON.stringify({filter:input.filter,id:String(last.id),plays:String(last.plays),at:last.cursor_at})).toString('base64url'):null;
  return {tracks:page.map(({cursor_at,...track})=>track),genres:genres.rows,artists:artists.rows,next_cursor:next};
}
module.exports={parseDiscovery,discover};
