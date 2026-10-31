import './listening-preferences.js';
const {families,normalize,belongs}=globalThis.LAEListeningPreferences;
const key='lae_listening_preferences_v1';
let memory;
export function listeningPreferences(){if(memory!==undefined)return memory;try{const raw=localStorage.getItem(key);return memory=raw?normalize(JSON.parse(raw)):null;}catch{return memory=null;}}
export function listeningQuery(){const p=listeningPreferences();return p?.selections.length?JSON.stringify(p):'';}
export function listeningLabel(){const p=listeningPreferences();return p?.selections.length?p.selections.map(s=>families.find(f=>f.id===s.family).name+(s.family==='gospel'&&s.genres.length?' · '+s.genres.map(g=>g==='worship'?'Worship':'Praise').join(' & '):s.genres.length?' · '+s.genres.join(', '):'')).join(' / '):'All music';}
export function welcomeListening({genres=[],onSave,e,force=false}){
 if(!force&&listeningPreferences()!==null)return;
 if(document.getElementById('listening-welcome'))return;
 const previous=listeningPreferences(),dialog=document.createElement('dialog');dialog.id='listening-welcome';dialog.className='listening-welcome';
 dialog.setAttribute('aria-labelledby','listening-welcome-title');
 dialog.innerHTML=`<form><span class="eyebrow">WELCOME TO LAE-MUSIC</span><h2 id="listening-welcome-title">Which music suits you best?</h2><p>Choose one or more music families. We’ll show matching songs in discovery. You can change this anytime.</p>${families.map(f=>{const options=f.id==='gospel'?[{value:'worship',name:'Worship'},{value:'praise',name:'Praise'}]:genres.filter(g=>belongs(g.genre,f.id)).map(g=>({value:g.genre,name:g.genre}));return `<section class="listening-family"><label><input type="checkbox" name="family" value="${f.id}"> ${e(f.name)}</label><fieldset data-family="${f.id}" hidden disabled><legend>${e(f.name)} categories</legend><label><input type="radio" name="scope-${f.id}" value="all" checked> All ${e(f.name)}</label>${options.length?`<label><input type="radio" name="scope-${f.id}" value="selected"> Choose categories</label><div data-categories>${options.map(o=>`<label><input type="checkbox" name="genre-${f.id}" value="${e(o.value)}"> ${e(o.name)}</label>`).join('')}</div>`:'<p>More specific categories will appear as artists publish them.</p>'}</fieldset></section>`;}).join('')}<p class="form-error" role="alert"></p><div class="form-actions"><button class="button" type="submit">Show my music</button><button class="button secondary" type="button" data-all>Explore all music</button></div><p class="muted">Saved in this browser. No account required. Songs without a specific category appear only in the broader family.</p></form>`;
 document.body.append(dialog);const form=dialog.querySelector('form');
 for(const f of families){const check=form.querySelector(`[name=family][value=${f.id}]`),fields=form.querySelector(`[data-family=${f.id}]`),selection=previous?.selections.find(s=>s.family===f.id);
 const sync=()=>{fields.hidden=!check.checked;fields.disabled=!check.checked;const selected=fields.querySelector(`[name=scope-${f.id}]:checked`)?.value==='selected';fields.querySelectorAll(`[name=genre-${f.id}]`).forEach(c=>{c.disabled=!selected;});};
 if(selection){check.checked=true;const scope=selection.genres.length?'selected':'all';const radio=fields.querySelector(`[name=scope-${f.id}][value=${scope}]`);if(radio)radio.checked=true;fields.querySelectorAll(`[name=genre-${f.id}]`).forEach(c=>c.checked=selection.genres.includes(c.value));}
 check.onchange=sync;fields.onchange=sync;sync();}
 const save=p=>{memory=normalize(p);try{localStorage.setItem(key,JSON.stringify(memory));}catch{/* In-memory preferences still apply when browser storage is unavailable. */}dialog.close();onSave();};
 form.onsubmit=event=>{event.preventDefault();const selections=[];for(const c of form.querySelectorAll('[name=family]:checked')){const selected=form.querySelector(`[name=scope-${c.value}]:checked`)?.value==='selected',genres=selected?[...form.querySelectorAll(`[name=genre-${c.value}]:checked`)].map(x=>x.value):[];if(selected&&!genres.length){form.querySelector('[role=alert]').textContent='Choose at least one category, or select All for this music family.';return;}selections.push({family:c.value,genres});}if(!selections.length){form.querySelector('[role=alert]').textContent='Choose a music family, or select Explore all music.';return;}save({version:1,selections});};
 form.querySelector('[data-all]').onclick=()=>save({version:1,selections:[]});
 dialog.addEventListener('cancel',event=>{event.preventDefault();save(previous||{version:1,selections:[]});});
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
}
