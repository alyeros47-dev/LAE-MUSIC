'use strict';
const {fail,digest}=require('./transactions');
const listening=require('../web/listening-preferences');
function preferenceSQL(preference,values,alias='t'){
 if(!preference?.selections.length)return '';
 const add=v=>{values.push(v);return '$'+values.length;};
 const parts=preference.selections.map(s=>{const family=listening.families.find(f=>f.id===s.family);let sql=`${alias}.genre ~* ${add(family.pattern)}`;if(s.family==='other')sql+=` AND ${alias}.genre !~* ${add(listening.families.filter(f=>f.id!=='other').map(f=>f.pattern).join('|'))}`;if(s.family!=='gospel')sql+=` AND ${alias}.genre !~* ${add(listening.families[0].pattern)}`;
 if(s.genres.length){if(s.family==='gospel')sql+=` AND ${alias}.genre ~* ${add(s.genres.join('|'))} AND btrim(${alias}.genre) !~* '^gospel\\s*&\\s*worship$'`;else sql+=` AND ${alias}.genre = ANY(${add(s.genres)}::text[])`;}return '('+sql+')';});
 return ' AND ('+parts.join(' OR ')+')';
}
function validCursorTime(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value)||Number(value.slice(0,4))<1)return false;const time=new Date(value);return Number.isFinite(time.getTime())&&time.toISOString().slice(0,19)===value.slice(0,19);}
function parseDiscovery(params){
  const q=String(params.get('q')||'').trim().slice(0,100),genre=String(params.get('genre')||'').slice(0,60),sort=params.get('sort')==='popular'?'popular':'new';
  if(q.includes('\0')||genre.includes('\0'))throw fail(400,'Search and genre cannot contain null characters.');
  const raw=params.get('limit')||'50';if(!/^\d{1,2}$/.test(raw)||Number(raw)<1||Number(raw)>50)throw fail(400,'Choose a page size between 1 and 50 songs.');
  let preference=null;const rawPreference=params.get('listening');if(rawPreference){try{if(rawPreference.length>12000)throw Error();preference=listening.normalize(JSON.parse(rawPreference));}catch{throw fail(400,'Choose valid listening preferences.');}}
  const options={q,genre,sort,preference,limit:Number(raw),filter:digest(preference?{q,genre,sort,preference}:{q,genre,sort})};
  const token=params.get('cursor');if(token){try{if(token.length>1024||!/^[a-zA-Z0-9_-]+$/.test(token))throw Error();const c=JSON.parse(Buffer.from(token,'base64url').toString());if(c.filter!==options.filter||!/^\d{1,16}$/.test(c.id)||!/^\d{1,19}$/.test(c.plays)||BigInt(c.plays)>9223372036854775807n||!validCursorTime(c.at))throw Error();options.cursor=c;}catch{throw fail(400,'This discovery page has expired or does not match your filters.');}}
  return options;
}
async function discover(pool,params){
  const input=parseDiscovery(params),values=[input.q.replace(/[!%_]/g,'!$&'),input.genre],when='COALESCE(t.published_at,t.created_at)';
  const taste=preferenceSQL(input.preference,values);
  let after='';if(input.cursor){if(input.sort==='popular'){const n=values.length;values.push(input.cursor.plays,input.cursor.at,input.cursor.id);after=` AND (t.plays,${when},t.id)<($${n+1}::bigint,$${n+2}::timestamptz,$${n+3}::bigint)`;}else{const n=values.length;values.push(input.cursor.at,input.cursor.id);after=` AND (${when},t.id)<($${n+1}::timestamptz,$${n+2}::bigint)`;}}
  values.push(input.limit+1);
  const order=input.sort==='popular'?`t.plays DESC,${when} DESC,t.id DESC`:`${when} DESC,t.id DESC`;
  const genreValues=[],genreTaste=preferenceSQL(input.preference,genreValues);
  const [tracks,genres,artists]=await Promise.all([
    pool.query(`SELECT t.id,t.title,t.genre,t.description,t.plays,t.status,t.created_at,t.published_at,c.id AS artist_id,c.display_name AS artist,${`to_char(${when} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`} AS cursor_at FROM music_tracks t JOIN creators c ON c.id=t.creator_id WHERE t.status='published' AND ($1='' OR t.title ILIKE '%'||$1||'%' ESCAPE '!' OR c.display_name ILIKE '%'||$1||'%' ESCAPE '!') AND ($2='' OR t.genre=$2)${taste}${after} ORDER BY ${order} LIMIT $${values.length}`,values),
    pool.query(`SELECT t.genre,COUNT(*)::int AS tracks FROM music_tracks t WHERE t.status='published'${genreTaste} GROUP BY t.genre ORDER BY tracks DESC,t.genre LIMIT 100`,genreValues),
    pool.query(`SELECT c.id,c.display_name,COUNT(t.id)::int AS tracks,COALESCE(SUM(t.plays),0)::bigint AS plays FROM creators c JOIN music_tracks t ON t.creator_id=c.id AND t.status='published' WHERE TRUE${genreTaste} GROUP BY c.id ORDER BY plays DESC,c.id LIMIT 12`,genreValues)
  ]);
  const page=tracks.rows.slice(0,input.limit),last=page.at(-1);
  const next=tracks.rows.length>input.limit&&last?Buffer.from(JSON.stringify({filter:input.filter,id:String(last.id),plays:String(last.plays),at:last.cursor_at})).toString('base64url'):null;
  return {tracks:page.map(({cursor_at,...track})=>track),genres:genres.rows,artists:artists.rows,next_cursor:next};
}
module.exports={parseDiscovery,discover};
