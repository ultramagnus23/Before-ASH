import fs from 'fs';
const a = JSON.parse(fs.readFileSync('seed-quests.json','utf8'));
const b = JSON.parse(fs.readFileSync('seed-quests-batch2.json','utf8'));

const norm = s => s.toLowerCase().replace(/[^a-z0-9 ]/g,'').replace(/\b(the|a|an|your|one|to|of|for|in|on|at|and)\b/g,'').replace(/\s+/g,' ').trim();
const bigrams = s => { const t=norm(s); const g=new Set(); for(let i=0;i<t.length-1;i++) g.add(t.slice(i,i+2)); return g; };
const dice = (x,y) => { const A=bigrams(x),B=bigrams(y); let i=0; for(const g of A) if(B.has(g)) i++; return 2*i/(A.size+B.size); };

const slug = t => norm(t).split(' ').slice(0,7).join('-');
const CODE = {campus_ritual:'CP',academic:'AK',food:'FD',people:'PP',creative:'CR',body_sport:'BD',delhi_ncr:'TR',career_money:'CM',service:'SV',solitude:'AL',night:'NT',legacy:'LG',chaos:'CH',skills:'SK',admin_life:'AD'};

const all=[], dropped=[];
let n=0;
for (const q of [...a.quests, ...b.quests]) {
  const dup = all.find(x => dice(x.title,q.title) > 0.82);
  if (dup) { dropped.push({kept:dup.title, dropped:q.title, score:+dice(dup.title,q.title).toFixed(3)}); continue; }
  n++;
  all.push({ ...q, id:`${CODE[q.category]||'XX'}-${String(1000+n)}`, slug:slug(q.title) });
}

const cats=[...a.categories, ...(b.categories_added||[])];
fs.writeFileSync('seed-quests-full.json', JSON.stringify({
  _meta:{version:'2.0', count:all.length, language:'English only',
    note:'Merged and deduplicated. Items with placeholder:true need real Ashoka names before launch.'},
  categories:cats, quests:all}, null, 1));

const byCat={}; for(const q of all) byCat[q.category]=(byCat[q.category]||0)+1;
console.log('merged:', all.length, '| near-dupes dropped:', dropped.length);
console.log('placeholders needing real names:', all.filter(q=>q.placeholder).length);
console.log('slug collisions:', all.length - new Set(all.map(q=>q.slug)).size);
console.log(byCat);
if(dropped.length) console.log('\ndropped:', dropped);
