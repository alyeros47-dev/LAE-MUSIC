// Shared public copy is rendered by the server from the approved platform rules.
export const publicContentPaths=['/about','/about-us','/business','/how-it-works','/affiliate-program','/publishing-policy','/faq'];
const publicSearchPaths=[...publicContentPaths,'/','/index.html','/start','/get-started','/premium'];
let initial;
const pages=new Map();
try{initial=JSON.parse(document.getElementById('public-information-data')?.textContent||'null');}catch{}
function setMeta(attribute,name,value){let node=document.head.querySelector(`meta[${attribute}="${name}"]`);if(!node){node=document.createElement('meta');node.setAttribute(attribute,name);document.head.append(node);}node.content=value;}
function apply(page){
 if(!page?.title||!page?.canonical||!page?.structured_data)return;
 document.title=page.title;setMeta('name','description',page.description);setMeta('name','robots',page.robots);
 let canonical=document.head.querySelector('link[rel="canonical"]');if(!canonical){canonical=document.createElement('link');canonical.rel='canonical';document.head.append(canonical);}canonical.href=page.canonical;
 for(const [name,value]of Object.entries({'og:type':'website','og:site_name':'LAE-MUSIC','og:title':page.title,'og:description':page.description,'og:url':page.canonical,'og:image':page.image}))setMeta('property',name,value);
 // Initial JSON-LD already has an exact CSP hash. Replace its text for navigation;
 // this is structured data, never executable code.
 let schema=document.getElementById('public-information-schema');if(!schema){schema=document.createElement('script');schema.id='public-information-schema';schema.type='application/ld+json';document.head.append(schema);}schema.textContent=JSON.stringify(page.structured_data);
}
function clear(url){
 document.querySelectorAll('link[rel="canonical"],meta[property^="og:"],#public-information-schema').forEach(node=>node.remove());
 setMeta('name','description','LAE-MUSIC is an AI-powered music creation, streaming and creator monetization platform.');
 setMeta('name','robots',['/discover','/artists','/creator-agreement','/listen','/music','/music.html'].includes(url.pathname)?'index,follow':'noindex,follow');
}
async function load(url,api){
 if(initial?.requested_path===url.pathname)return initial;
 if(!pages.has(url.pathname))pages.set(url.pathname,api('/api/platform/business?page='+encodeURIComponent(url.pathname)).catch(error=>{pages.delete(url.pathname);throw error;}));
 return pages.get(url.pathname);
}
export const hasInitialPublicInformation=url=>initial?.requested_path===url.pathname;
export const clearPublicMetadata=clear;
export async function syncPublicMetadata(url,{api,active=()=>true}){
 if(!publicSearchPaths.includes(url.pathname)){clear(url);return;}
 const page=await load(url,api);if(active())apply(page);
}
export async function businessPage(view,url,{api}){
 const page=await load(url,api);
 if(!view.active||view.active()){if(page?.html){apply(page);view.set(page.html);}else throw Error('Public information is temporarily unavailable. Please try again.');}
}
