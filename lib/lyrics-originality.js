'use strict';
const crypto=require('node:crypto');
const {fail}=require('./transactions');
// Owner-proposed message categories, kept separate from all Music DNA profiles.
const TYPES=Object.freeze([
 ['deep-worship','Deep Worship','Communicate reverence and closeness to God through the specific devotion described.'],
 ['praise-celebration','Praise and Celebration','Celebrate God through the particular reason for praise in the brief.'],
 ['thanksgiving','Thanksgiving','Express gratitude for the specific gifts, people or circumstances described.'],
 ['personal-testimony','Personal Testimony','Tell the requested personal faith experience; do not invent life events.'],
 ['prayer-supplication','Prayer and Supplication','Address the specific prayer or petition with humility, not a guaranteed outcome.'],
 ['repentance-forgiveness','Repentance and Forgiveness','Explore the requested repentance, mercy or forgiveness without inventing wrongdoing.'],
 ['salvation-new-life','Salvation and New Life','Express the requested Christian renewal or salvation message.'],
 ['healing-restoration','Healing and Restoration','Express the requested hope for healing or restoration without promising cures.'],
 ['deliverance-victory','Deliverance and Spiritual Victory','Express faith and spiritual resilience without inventing enemies or guaranteed deliverance.'],
 ['faith-trust','Faith and Trust','Develop the requested meaning of faith and trust in God.'],
 ['hope-encouragement','Hope and Encouragement','Encourage through the actual context described without assuming hardship.'],
 ['love-grace',"God's Love and Grace",'Explore the requested experience of divine love or grace.'],
 ['spirit-revival','Holy Spirit and Revival','Express the requested Christian spiritual renewal without fabricated revelation.'],
 ['prophetic-declaration','Prophetic Declaration','Use faith-grounded declarations, not personal predictions or guaranteed individual outcomes.'],
 ['scripture-inspired','Scripture-Inspired Songs','Use the requested Scripture themes accurately; do not invent Bible quotations or verse references.'],
 ['evangelism-gospel','Evangelism and Gospel Message','Communicate the requested Christian Gospel message respectfully.'],
 ['dedication-surrender','Dedication and Surrender','Express the requested commitment or surrender to God.'],
].map(([id,name,guidance])=>Object.freeze({id,name,guidance})));
function catalogue(){return TYPES.map(x=>({...x,review_status:'proposed_for_owner_review'}));}
const strategies={
 opening:['Begin with a concrete detail drawn from the brief','Begin with an intimate address grounded in the brief','Begin with the central question or conviction in the brief','Begin with a contrast already present in the brief'],
 development:['Develop distinct facets of the central message','Move from specific observation to its personal significance','Use a developing image drawn from the supplied experience','Use meaningful question and response without inventing events'],
 hook:['Use a concise complete thought with a fresh cadence','Use a changing response around one meaningful core phrase','Use parallel lines that develop rather than restate the thought','Use a short motif answered by a fuller original line'],
 imagery:['Use precise language grounded in the supplied details','Use restrained metaphor consistent with the actual message','Use direct natural language and specific relationships','Use sensory detail only when supported by the brief'],
};
function prepare(body,{artistId,requestKey}={}){
 const id=body.lyricsType??'';
 if(typeof id!=='string'||(id&&!TYPES.some(t=>t.id===id)))throw fail(400,'Choose an available Lyrics Type, or leave it on Follow my description.');
 const hash=crypto.createHash('sha256').update(JSON.stringify(['lyrics-message-v1',String(artistId||''),String(requestKey||''),id])).digest();
 const variation={};let i=0;for(const [k,values] of Object.entries(strategies))variation[k]=values[hash[i++]%values.length];
 const phraseInput=String(body.nativeLyrics||'').slice(0,1500),idea=String(body.idea||'').slice(0,1200);
 const quoted=[...idea.matchAll(/[“"]([^”"\n]{3,300})[”"]/gu)].map(x=>x[1]);
 return {revision:'lyrics-message-v1',type:TYPES.find(t=>t.id===id)||null,lyrical_interpretation_id:hash.toString('hex'),variation,allow_vocables:/\b(wordless|vocables|scat|non-lexical)\b/iu.test(idea),protected_phrases:[...phraseInput.split(/\r?\n/u),...quoted].filter(Boolean)};
}
const INSTRUCTIONS=` LYRICAL MESSAGE AND ORIGINALITY: The customer description is the source of the unique message, experience and story. Lyrics Type is an optional communication emphasis, NOT a musical genre or arrangement preset. With no Lyrics Type, follow the description freely. If a type and description differ, develop only aspects consistent with the customer's actual message; do not invent biographical facts. Music DNA alone governs rhythm, groove, tempo, instruments and production identity, with only its permitted mood/energy adjustments. A worship, prayer or Scripture message does NOT authorize church keyboards, organ, pads, choir or generic worship backing absent from the selected DNA. The creative_brief lyrical_interpretation_id is not the Music DNA variation_id; keep the required Music DNA output metadata unchanged. Apply creative_brief only to the words; never use it to replace DNA instruments, groove or constraints. Do not mechanically repeat a familiar song template. Make the narrative development, vocabulary, imagery, opening, hook cadence and chorus expression specific to this brief. The variation suggestions are optional creative starting points; discard any that invent facts or conflict with the topic or DNA's singable form. Never default to walking on a road, buying food, hunger, poverty, suffering or miracles unless the customer's topic makes them appropriate. Do not routinely insert stock Yoruba, Pidgin or Gospel catchphrases merely to signal a culture. Write meaningful idiomatic Yoruba, Igbo, Hausa, Nigerian Pidgin, English and any selected combination, not random syllables, invented translations, caricature or decorative local words. Privately review every local-language phrase for meaning and natural usage; if uncertain, use accurate simpler expressions or the customer's exact supplied phrases, never fabricate African-sounding words. Honor the selected languages and exact supplied wording. Never claim linguistic correctness merely by echoing language codes. Refrains, deliberate worship repetition, vocables specifically requested and quoted customer phrases are permitted. Keep verse development fresh even when a refrain repeats. Regeneration should reinterpret the same real message substantially, not change only a title or a few words. Use English structural section labels such as [Verse], [Chorus], [Bridge] or [Refrain] so lyrics remain editable; do not sing those labels. Before returning, privately compare verses, hooks and images for accidental recycling, check language meaning and topic fidelity, and revise once within THIS response. Return the existing JSON contract only. No uniqueness or native-fluency guarantee is implied.`;
function normalized(text){return String(text||'').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/gu,' ').trim();}
function sections(text){const result={narrative:[],refrain:[],has_narrative_label:false};let kind='narrative';for(const raw of String(text||'').split(/\r?\n/u)){const line=raw.trim();if(!line)continue;if(/^\[[^\]]+\]$/.test(line)){if(/verse|bridge|spoken/iu.test(line))result.has_narrative_label=true;kind=/chorus|refrain|hook|vamp|chant|outro/iu.test(line)?'refrain':'narrative';continue;}result[kind].push(normalized(line));}return result;}
function tokens(lines,context){const phrases=(context?.protected_phrases||[]).map(normalized).filter(Boolean);return [...new Set(lines)].map(line=>{for(const p of phrases)line=line.split(p).join(' ');return line;}).join(' ').split(/\s+/u).filter(Boolean);}
function shingles(words){const set=new Set();for(let i=0;i+5<=words.length;i++)set.add(words.slice(i,i+5).join(' '));return set;}
function overlap(a,b){if(a.size<12||b.size<12)return false;let shared=0;for(const x of a)if(b.has(x))shared++;return shared>=12&&shared/a.size>=0.72&&shared/b.size>=0.60;}
function tooSimilar(text,previous,context){const a=sections(text),b=sections(previous);for(const kind of ['narrative','refrain']){const aw=tokens(a[kind],context),bw=tokens(b[kind],context);const minimum=kind==='refrain'?30:24;if(aw.length>=minimum&&bw.length>=minimum&&overlap(shingles(aw),shingles(bw)))return true;}return false;}
function validate(text,context){
 if(typeof text!=='string'||!text.trim())throw Object.assign(fail(400,'Generated lyrics must be meaningful text.'),{code:'LYRICS_LANGUAGE_QUALITY'});
 const parts=sections(text),protectedLines=new Set((context?.protected_phrases||[]).map(normalized));
 const lines=parts.narrative.filter(x=>x.split(' ').length>=5&&!protectedLines.has(x));
 if(parts.has_narrative_label&&lines.length>=8&&new Set(lines).size/lines.length<0.35)throw Object.assign(fail(409,'Generated verses repeat excessively. The lyrics credit will be restored.'),{code:'LYRICS_REPETITION'});
 const protectedWords=new Set(tokens(context?.protected_phrases||[],null));
 for(const word of tokens(parts.narrative,null))if(!context?.allow_vocables&&word.length>=18&&!protectedWords.has(word)&&/^(\p{L}{1,3})\1{5,}$/u.test(word))throw Object.assign(fail(400,'The generated verse contains excessive repeated syllables. The lyrics credit will be restored.'),{code:'LYRICS_LANGUAGE_QUALITY'});
}
async function checkRecent(db,text,context){
 validate(text,context);
 // Short shared transaction lock closes cross-account concurrent near-copy races.
 await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',['lyrics-originality-v1']);
 // Reuse the private library already stored for the product; no new corpus,
 // raw-text log, external comparison service or other-customer prompt content.
 const recent=await db.query("SELECT lyrics FROM generation_records WHERE model<>'musicapi-sonic' AND created_at>NOW()-INTERVAL '30 days' ORDER BY id DESC LIMIT 128");
 if(recent.rows.some(row=>tooSimilar(text,row.lyrics,context)))throw Object.assign(fail(409,'Generated lyrics were too similar to a recent output. The lyrics credit will be restored; request a fresh interpretation.'),{code:'LYRICS_REPETITION'});
}
module.exports={TYPES,catalogue,prepare,INSTRUCTIONS,sections,tooSimilar,validate,checkRecent};
