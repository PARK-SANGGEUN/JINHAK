// AND 검색(모든 키워드 포함), 연속글자 일치, 등장횟수로 정렬
// PDF는 p.N 표시 + 해당 페이지로 점프(#page=N)

const q = document.getElementById('q');
const list = document.getElementById('results');
let DATA = [];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function highlight(text, terms){
  if(!terms.length) return text;
  let out = text;
  const sorted = [...terms].sort((a,b)=>b.length-a.length);
  for(const t of sorted){
    const re = new RegExp(esc(t), 'gi');
    out = out.replace(re, m => `<mark>${m}</mark>`);
  }
  return out;
}

function render(rows, terms){
  list.innerHTML = '';
  if(!rows.length){
    const li = document.createElement('li');
    li.className = 'card';
    li.textContent = '검색 결과가 없습니다.';
    list.appendChild(li);
    return;
  }
  for(const d of rows){
    const pageBadge = (d.fileType === 'pdf' && d.page) ? ` · p.${d.page}` : '';
    const li = document.createElement('li');
    li.className = 'card';
    const raw = (d.snippet || d.content || '').replace(/\s+/g,' ').slice(0, 200);
    li.innerHTML = `
      <div class="meta">
        <span class="badge">${(d.fileType||'DOC').toUpperCase()}</span>
        ${d.file || ''}${pageBadge}
      </div>
      <div class="title"><a href="${d.link}" target="_blank" rel="noopener">${d.title}</a></div>
      <div class="snippet">${highlight(raw, terms)}</div>
    `;
    list.appendChild(li);
  }
}

async function load(){
  try{
    const res = await fetch('index.json', { cache: 'no-store' });
    DATA = await res.json();
  }catch(e){
    console.error('index.json 로드 실패', e);
    DATA = [];
  }
}

function parseTerms(q){
  return q.split(/[,\s]+/g).map(s=>s.trim()).filter(Boolean);
}

function countMatches(hay, term){
  const re = new RegExp(esc(term), 'gi');
  const m = hay.match(re);
  return m ? m.length : 0;
}

// AND + 연속글자 일치 + 등장횟수 정렬
function search(query){
  const terms = parseTerms(query);
  if(!terms.length){ render([], terms); return; }

  const rows = [];
  for(const d of DATA){
    const hay = `${d.title||''} ${d.snippet||''} ${d.content||''}`.toLowerCase();
    const ok = terms.every(t => hay.includes(t.toLowerCase()));
    if(!ok) continue;
    const score = terms.reduce((s,t)=> s + countMatches(hay, t.toLowerCase()), 0);
    rows.push({ ...d, __score: score });
  }
  rows.sort((a,b)=> b.__score - a.__score);
  render(rows.slice(0, 200), terms);
}

q.addEventListener('input', e => search(e.target.value.trim()));
load().then(()=>{
  const init = new URL(location).searchParams.get('q') || '';
  if(init){ q.value = init; search(init); }
});
