// UI projection only. The existing authenticated backend owns profiles, credits and generation.
const departmentNames={gospel:'Gospel & Christian Music','secular-afrobeats':'Afrobeats & African Music','reggae-caribbean':'Reggae & Caribbean Music','western-international':'Western & International Music'};
export function musicDNAControls(catalogue,e,selection={}) {
  if(catalogue?.status!=='approved'||!catalogue.styles?.length)return '';
  const department=catalogue.departments.find(d=>d.id===selection.departmentId);
  const groups=catalogue.categories.filter(c=>c.department_id===department?.id);
  const group=groups.find(c=>c.id===selection.categoryId);
  const styles=catalogue.styles.filter(s=>s.category_id===group?.id);
  const options=(items,empty)=>`<option value="">${e(empty)}</option>`+items.map(x=>`<option value="${e(x.id)}">${e(x.name)}</option>`).join('');
  return `<section class="panel music-dna-panel" aria-labelledby="music-dna-heading"><h3 id="music-dna-heading">Find your musical identity</h3><p>Christian/Gospel launch: choose one of 14 groups, then one of its five individual styles. Your voice, languages and energy stay independent.</p><div class="dna-navigation"><label>1. Music department<select name="musicDnaDepartment" aria-label="Music department">${options(catalogue.departments.map(d=>({...d,name:departmentNames[d.id]||d.name})),'Choose a department…')}</select></label><label>2. Music group<select name="musicDnaGroup" aria-label="Music group" aria-describedby="music-dna-group-description" ${department?'required':'disabled'}>${options(groups,'Choose a group…')}</select></label><label>3. Individual style<select name="musicDnaStyle" aria-label="Music DNA style" aria-describedby="music-dna-status" ${group?'required':'disabled'}><option value="">Choose an individual style…</option>${group?`<optgroup label="${e(departmentNames[department.id]||department.name)} / ${e(group.name)}">${styles.map(s=>`<option value="${e(s.id)}">${e(s.name)}</option>`).join('')}</optgroup>`:''}</select></label></div><p id="music-dna-group-description"></p>${catalogue.categories.some(c=>c.group_id==='R7')?'<button type="button" class="button secondary small" data-dna-gospel-link hidden>Also explore Reggae Gospel</button>':''}<p id="music-dna-status" role="status"></p><label>4. Voice<select name="voice" aria-label="Lead vocals">${options(catalogue.voices.filter(v=>v.id!=='neutral'),'Follow my description')}</select></label><label>5. Song languages<select name="musicDnaLanguages" aria-label="Music DNA languages" multiple size="6" disabled>${catalogue.languages.map(l=>`<option value="${e(l.id)}">${e(l.name)}</option>`).join('')}</select></label><p>Select up to four languages, or leave all clear to follow your description and supplied words.</p><label>6. Mood &amp; Energy<select name="musicDnaMood" aria-label="Mood & Energy" aria-describedby="music-dna-mood-description" disabled>${options(catalogue.moods||[],'Choose mood & energy…')}</select></label><p id="music-dna-mood-description">Your mood shapes intensity and arrangement within the selected style’s musical limits.</p></section>`;
}
export function bindMusicDNA(form,saved,catalogue){
  const {musicDnaDepartment:department,musicDnaGroup:group,musicDnaStyle:style,musicDnaLanguages:languages,musicDnaMood:mood}=form.elements;
  if(!department||!group||!style||!languages||!mood)return ()=>{};
  const doc=form.ownerDocument;
  const gospelLink=form.querySelector('[data-dna-gospel-link]');
  const reggaeGospel=catalogue.categories.find(c=>c.group_id==='R7'&&c.department_id==='reggae-caribbean');
  const fill=(select,items,placeholder)=>{select.replaceChildren();const option=doc.createElement('option');option.value='';option.textContent=placeholder;select.append(option);for(const item of items){const option=doc.createElement('option');option.value=item.id;option.textContent=item.name;select.append(option);}};
  const groups=()=>catalogue.categories.filter(c=>c.department_id===department.value);
  const populateGroups=()=>{fill(group,groups(),'Choose a group…');group.disabled=!department.value;group.required=!!department.value;};
  const populateStyles=()=>{fill(style,catalogue.styles.filter(s=>s.category_id===group.value),'Choose an individual style…');style.disabled=!group.value;style.required=!!group.value;};
  const update=()=>{
    const selected=catalogue.styles.find(s=>s.id===style.value&&s.department_id===department.value&&s.category_id===group.value);
    if(!selected&&style.value)style.value='';
    const active=!!selected;
    if(gospelLink)gospelLink.hidden=department.value!=='gospel'||!reggaeGospel;
    for(const name of ['musicFamily','musicCountry','musicProfile','genre','beat','language','extraLanguage'])if(form.elements[name])form.elements[name].disabled=active;
    const custom=form.querySelector('[data-studio-custom-direction]');if(custom){custom.hidden=active||catalogue.launch==='gospel-phase-one';if(!active&&['musicFamily','musicCountry','musicProfile','genre','beat','language'].some(name=>form.elements[name]?.value))custom.open=true;}
    languages.disabled=!active;mood.disabled=!active;mood.required=active;
    const category=groups().find(c=>c.id===group.value);
    const examples=catalogue.styles.filter(s=>s.category_id===category?.id);
    form.querySelector('#music-dna-group-description').textContent=category?`${category.name}: ${examples.length} individual styles. Example sound: ${examples[0]?.description||examples[0]?.name||category.name}`:department.value?`${departmentNames[department.value]}: ${groups().length} groups and ${catalogue.styles.filter(s=>s.department_id===department.value).length} individual styles.`:'';
    form.querySelector('#music-dna-status').textContent=selected?[selected.name,selected.description,'Your topic shapes the lyrics; voice and languages stay independent.'].filter(Boolean).join(' — '):department.value?'Choose a group and individual style to continue.':'Choose a Gospel group, or open custom musical direction below.';
    form.querySelector('#music-dna-mood-description').textContent=(catalogue.moods||[]).find(x=>x.id===mood.value)?.description||'Your mood shapes intensity and arrangement within the selected style’s musical limits.';
  };
  const changed=()=>{update();form.dispatchEvent(new Event('input',{bubbles:true}));};
  department.addEventListener('change',()=>{populateGroups();populateStyles();changed();});
  group.addEventListener('change',()=>{populateStyles();changed();});
  style.addEventListener('change',changed);mood.addEventListener('change',changed);
  if(gospelLink)gospelLink.addEventListener('click',()=>{if(!reggaeGospel)return;department.value=reggaeGospel.department_id;populateGroups();group.value=reggaeGospel.id;populateStyles();changed();style.focus();});
  const restored=catalogue.styles.find(s=>s.id===saved?.musicDnaStyle);
  department.value=restored?.department_id||(catalogue.departments.some(d=>d.id===saved?.musicDnaDepartment)?saved.musicDnaDepartment:'');populateGroups();group.value=restored?.category_id||(groups().some(c=>c.id===saved?.musicDnaGroup)?saved.musicDnaGroup:'');populateStyles();style.value=restored?.id||'';
  mood.value=(catalogue.moods||[]).some(m=>m.id===saved?.musicDnaMood)?saved.musicDnaMood:'';
  for(const option of languages.options)option.selected=Array.isArray(saved?.musicDnaLanguages)&&saved.musicDnaLanguages.includes(option.value);
  update();return update;
}
