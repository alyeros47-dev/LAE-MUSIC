'use strict';
// Read-only HTTP probes. Never submits generation, payments, registration or database writes.
async function checkPreview(value) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      !(url.protocol === 'https:' || url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)))
    throw Error('Use an HTTPS origin (or loopback HTTP), without credentials, a path or query.');
  const checks = [];
  async function probe(path, inspect) {
    try {
      const r = await fetch(new URL(path,url), {redirect:'error',signal:AbortSignal.timeout(20000)});
      const body = await r.text();
      const ok = inspect(r,body);
      checks.push({path,passed:ok,status:r.status});
    } catch { checks.push({path,passed:false,status:'unavailable'}); }
  }
  for (const p of ['/','/studio','/join','/premium','/offline','/admin/console'])
    await probe(p,(r,s)=>r.status===200 && /text\/html/.test(r.headers.get('content-type')||'') && /LAE-MUSIC/i.test(s));
  await probe('/health',r=>r.status===200);
  await probe('/web/app.js',(r,s)=>r.status===200 && s.includes('studio'));
  await probe('/api/platform/financial-policy',(r,s)=>{
    const p=JSON.parse(s);return r.status===200 && p.complaint_days===7 && p.settlement_days===7 && p.live_operations_enabled===false;
  });
  await probe('/api/platform/premium/plans',(r,s)=>{
    const p=JSON.parse(s);return r.status===200 && p.base_currency==='USD' && JSON.stringify(p.plans.map(x=>x.amount_minor))==='[8,23,60,121,588]';
  });
  await probe('/api/platform/discover',r=>r.status===200);
  await probe('/api/platform/admin/report?section=payments',r=>r.status===401);
  const passed=checks.every(x=>x.passed);
  return {status:passed?'available_for_review':'blocked',production_ready:false,checks,
    scope:'HTTP availability, approved terms/prices, catalog access and anonymous admin denial only. No real generation, audio playback, payment or email verification.'};
}
module.exports={checkPreview};
if(require.main===module)checkPreview(process.argv[2]).then(r=>{console.log(JSON.stringify(r,null,2));process.exitCode=r.status==='available_for_review'?0:2;}).catch(()=>{console.error('Usage: node scripts/check-preview.cjs https://YOUR-REVIEW-SITE.onrender.com');process.exitCode=1;});
