'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs');
const publicInfo=require('../lib/public-information'),{runtime}=require('./runtime.cjs');
const htmlWithoutScripts=s=>s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
const script=(html,id)=>JSON.parse(html.match(new RegExp('<script id="'+id+'"[^>]*>([\\s\\S]*?)<\\/script>'))[1]);
test('all public information is in the first HTML response without login, cookies, JavaScript or a database',async()=>{
 const app=await runtime(),titles=new Set();
 for(const path of publicInfo.PATHS){
  const r=await app.request(path);assert.equal(r.status,200,path);assert.match(r.headers['content-type'],/^text\/html/);assert.equal(r.headers['set-cookie'],undefined);assert.equal(r.headers['x-robots-tag'],undefined);
  const page=script(r.text,'public-information-data');assert.equal(page.canonical,publicInfo.ORIGIN+path);assert.match(r.text,/<meta name="robots" content="index,follow">/);assert(r.text.includes('<title>'+page.title.replace(/&/g,'&amp;')+'</title>'));
  titles.add(page.title);if(path!=='/'){const visible=htmlWithoutScripts(r.text);assert.match(visible,/<h1>[^<]+<\/h1>/);assert(visible.includes('/affiliate-program'));assert(visible.includes('/how-it-works'));assert(visible.includes(page.html),'SSR keeps literal prices and complete public copy');assert(!/(NaN|undefined)/.test(visible));}
  const head=await app.request(path,{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.body.length,0);
 }
 assert.equal(titles.size,publicInfo.PATHS.length);
});
test('public prices, allowances, affiliate eligibility and approved rates match current authoritative rules',()=>{
 const plans=require('../lib/publishing-policy').packages(),artist=publicInfo.page('/how-it-works').html,affiliate=publicInfo.page('/affiliate-program').html,config=require('../lib/affiliate-framework').disclosure();
 for(const p of Object.values(plans)){assert(artist.includes(p.name+' — $'+p.usd+'/year: '+p.studioGenerations+' music generations, up to '+p.uploads+' tracks.'));}
 assert.equal(config.premium_individual_allocations_enabled,true);assert.equal(config.individual_premium_rates.direct,20);assert.equal(config.individual_premium_rates.quarterly_team,10);
 for(const text of ['20% direct','10% quarterly','$0.36','$0.18','$0.90','two referral steps','December 20','December 21–31','Bank payouts are not enabled yet','Artist-package and extra-generation rates remain unapproved'])assert(affiliate.includes(text),text);
 assert(!/15%|25%|historical Premium.*5%|guaranteed income\./.test(affiliate.replace('not guaranteed income.','')));
 const pricing=require('../lib/premium-pricing').catalog();for(const p of pricing.plans)assert(publicInfo.page('/premium').html.includes('$'+(p.usd_minor/100).toFixed(2)+' for '+p.days));
 assert(artist.includes('seven full UTC days'));assert(artist.includes('your allocation is $10'));assert(artist.includes('remain')||artist.includes('stay online'));
 assert(artist.includes('one year'));assert(artist.includes('separate consent'));assert(artist.includes('two separate tracks'));
});
test('existing publishing and full refund terms remain present and no unapproved extra-generation price is advertised',()=>{
 const policy=require('../lib/financial-policy').disclosure(),publishing=publicInfo.page('/publishing-policy').html;
 for(const key of ['complaints','royalties','artist','premium','studio','currency'])assert(publishing.includes(policy[key].replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')));
 assert(publishing.includes('not automatically copyright-free'));assert(publishing.includes('one-use code'));assert(!/\$2(?:\.00)? per|\$1\.80 per|\$1\.50 per/.test(publicInfo.page('/start').html));
});
test('canonical aliases and tracking query strings do not create duplicate information pages or reflect user input',async()=>{
 const app=await runtime();for(const [path,canonical]of [['/about-us','/about'],['/business','/about'],['/get-started','/start']]){const r=await app.request(path+'?ref=99');assert.equal(script(r.text,'public-information-data').canonical,publicInfo.ORIGIN+canonical);}
 const r=await app.request('/affiliate-program?ref=%22%3E%3Cscript%3Eevil%3C/script%3E',{headers:{host:'evil.invalid','user-agent':'Googlebot'}});assert(!r.text.includes('evil.invalid'));assert(!r.text.includes('<script>evil'));assert.equal(script(r.text,'public-information-data').canonical,publicInfo.ORIGIN+'/affiliate-program');
 const regular=await app.request('/affiliate-program');assert.equal(r.text,regular.text,'same public HTML for crawlers and customers');
});
test('robots, sitemap and noindex rules cover canonical public pages without blocking required public rendering',async()=>{
 const app=await runtime(),sitemap=await app.request('/sitemap.xml'),robots=await app.request('/robots.txt');
 assert.equal(sitemap.status,200);assert.match(sitemap.headers['content-type'],/^application\/xml/);assert.match(robots.text,/Sitemap: https:\/\/lae-music.com\/sitemap.xml/);assert(!/Disallow: \/web\/|Disallow: \/api\/\s/.test(robots.text));
 const urls=[...sitemap.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map(x=>x[1]);assert.deepEqual(urls,publicInfo.PATHS.map(p=>publicInfo.ORIGIN+p));assert(!/partners|workspace|ref=|business<|about-us/.test(sitemap.text));
 for(const path of ['/account','/workspace','/studio','/partners','/pay','/admin/console'])assert.match((await app.request(path)).headers['x-robots-tag'],/noindex/);
 for(const path of ['/discover','/artists','/listen','/music','/music.html','/creator-agreement'])assert.equal((await app.request(path)).headers['x-robots-tag'],undefined,path);
 assert.equal((await app.request('/api/platform/business')).headers['x-robots-tag'],'noindex');assert.equal((await app.request('/api/platform/business?page=%2Faffiliate-program')).json().canonical,publicInfo.ORIGIN+'/affiliate-program');assert.equal((await app.request('/api/platform/business?page=%2Faccount')).status,404);
 for(const path of ['/robots.txt','/sitemap.xml']){assert.equal((await app.request(path,{method:'HEAD'})).body.length,0);assert.equal((await app.request(path,{method:'POST'})).status,405);}
});
test('structured data is accurate, readable, safely encoded and covered by exact CSP hashes',async()=>{
 const app=await runtime();for(const path of publicInfo.PATHS){const r=await app.request(path),data=script(r.text,'public-information-schema');assert.equal(data['@context'],'https://schema.org');assert.equal(data['@graph'][0]['@type'],'Organization');assert.equal(data['@graph'][0].name,'LAE-MUSIC');assert.equal(data['@graph'][1]['@type'],'WebSite');assert.equal(data['@graph'][2].url,publicInfo.ORIGIN+path);
 assert(!/reviewRating|aggregateRating|sameAs|telephone/.test(JSON.stringify(data)));assert(!r.headers['content-security-policy'].includes('unsafe-inline'));
 for(const id of ['public-information-schema','public-information-data']){const text=r.text.match(new RegExp('<script id="'+id+'"[^>]*>([\\s\\S]*?)<\\/script>'))[1],hash=crypto.createHash('sha256').update(text).digest('base64');assert(r.headers['content-security-policy'].includes("'sha256-"+hash+"'"));}
 }
});
test('review/staging copies remain noindex and existing business JSON and shell design stay intact',async()=>{
 const app=await runtime({env:{NODE_ENV:'staging'}}),r=await app.request('/about');assert.match(r.headers['x-robots-tag'],/noindex/);assert.equal(script(r.text,'public-information-data').robots,'noindex,follow');assert.match((await app.request('/robots.txt')).text,/Disallow: \/\n/);
 const live=await runtime(),business=(await live.request('/api/platform/business')).json();assert.deepEqual(business,require('../lib/publishing-policy').disclosure());
 const raw=fs.readFileSync('web/index.html','utf8'),rendered=publicInfo.renderShell(raw,new URL(publicInfo.ORIGIN+'/about'),{}).html;
 for(const selector of ['<aside class="sidebar"','<footer class="site-footer"','<audio id="audio"'])assert(rendered.includes(selector));
 assert.equal(rendered.match(/<aside[\s\S]*?<\/aside>/)[0],raw.match(/<aside[\s\S]*?<\/aside>/)[0]);assert.equal(rendered.match(/<footer[\s\S]*?<\/footer>/)[0],raw.match(/<footer[\s\S]*?<\/footer>/)[0]);
});
