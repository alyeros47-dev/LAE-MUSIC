// Customer/business-verification copy comes from the approved public profile.
export async function businessPage(view,url,{api,e,heading,buttonLink}){
 const business=await api('/api/platform/business');
 const about=['/about','/about-us','/business'].includes(url.pathname),how=url.pathname==='/how-it-works',faq=url.pathname==='/faq';
 const title=about?'About LAE-MUSIC':how?'How LAE-MUSIC works':faq?'Frequently asked questions':'Studio-only publishing policy';
 let body=heading('CREATE. PUBLISH. STREAM.',title,business.business_description);
 if(about)body+=`<section class="panel">${business.business_details.map(p=>`<p>${e(p)}</p>`).join('')}</section>`;
 if(how||about)body+=`<section class="panel"><h2>Create and publish with our Studio</h2><ol>${business.how_it_works.map(p=>`<li>${e(p)}</li>`).join('')}</ol></section>`;
 body+=`<section class="panel"><h2>Our launch publishing policy</h2><p>${e(business.publishing_notice)}</p><p>${e(business.own_lyrics_notice)}</p></section>`;
 if(faq)body+=`<section class="panel"><h2>Your questions answered</h2>${business.faqs.map(f=>`<details><summary>${e(f.question)}</summary><p>${e(f.answer)}</p></details>`).join('')}</section>`;
 body+=`<section class="panel"><h2>Artist packages</h2><ul>${Object.values(business.packages).map(p=>`<li>${e(p.name)} — $${e(p.usd)}</li>`).join('')}</ul><p>${e(business.allowances_notice)}</p>${buttonLink('/start','Review artist packages',true)}</section>`;
 body+=`<section class="panel"><h2>Rights, moderation and creator revenue</h2><p>${e(business.rights_notice)}</p><p>Eligible streaming activity may generate creator revenue under the platform's applicable terms. Earnings are not guaranteed.</p></section>`;
 body+=`<nav class="row-actions" aria-label="Business information">${buttonLink('/about','About us',true)}${buttonLink('/how-it-works','How it works',true)}${buttonLink('/publishing-policy','Publishing policy',true)}${buttonLink('/faq','FAQs',true)}</nav>`;
 view.set(body);
}
