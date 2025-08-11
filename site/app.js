// 엄격 검색: 모든 키워드가 실제로 포함된 레코드만 표시 (AND, 연속글자 일치)
// PDF는 p.N, XLSX는 [시트!셀], PPTX는 slide N 표시 + 클릭 시 해당 위치/미리보기로 이동

const q = document.getElementById('q');
const list = document.getElementById('results');
let DATA = [];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function highlight(text, terms){
  if(!terms.length) return text;
  let out = text ?? '';
  const sorted = [...terms].sort((a,b)=>b.length-a.length);
  for(const t of sorted){
    const re = new RegExp(esc(t), 'gi');      // 공백 무시 안 함(연속 글자만)
    out = out.replace(re, m => `<mark>${m}</mark>`);
  }
  return out;
}

function render(rows, terms, query){
  list.innerHTML = '';
  if(!rows.length){
    const li = document.createElement('li');
    li.className = 'card';
    li.textContent = '검색 결과가 없습니다.';
    list.appendChild(li);
    return;
  }
  for(const d of rows){
    const metaExtra =
      (d.fileType === 'pdf'  && d.page ) ? ` · p.${d.page}` :
      (d.fileType === 'xlsx' && d.cell ) ? ` · ${d.sheet}!${d.cell}` :
      (d.fileType === 'pptx' && d.slide) ? ` · slide ${d.slide}` : '';
    const raw = (d.snippet || d.content || '').replace(/\s+/g,' ').slice(0, 220);
    const href = d.link + (d.link.includes('?') ? '&' : '?') + 'q=' + encodeURIComponent(query || '');
    const li = document.createElement('li');
    li.className = 'card';
    li.innerHTML = `
      <div class="meta"><span class="badge">${(d.fileType||'DOC').toUpperCase()}</span> ${d.file||''}${metaExtra}</div>
      <div class="title"><a href="${href}" target="_blank" rel="noopener">${d.title}</a></div>
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

function termsOf(q){
  return q.split(/[,\s]+/g).map(s=>s.trim()).filter(Boolean);
}

function countMatches(hay, term){
  const re = new RegExp(esc(term), 'gi');
  const m = hay.match(re);
  return m ? m.length : 0;
}

// ★ 핵심: 모든 키워드가 '그 레코드' 안에 실제 포함되어 있어야 통과
function search(query){
  const terms = termsOf(query);
  if(!terms.length){ render([], terms, query); return; }

  const rows = [];
  for(const d of DATA){
    const hay = `${d.title||''} ${d.snippet||''} ${d.content||''}`.toLowerCase();

    // 모든 키워드가 포함(AND) — 연속글자 기준
    const okAll = terms.every(t => hay.includes(t.toLowerCase()));
    if(!okAll) continue;

    // 점수: 등장 횟수 합 (정렬용)
    const score = terms.reduce((s,t)=> s + countMatches(hay, t.toLowerCase()), 0);
    rows.push({ ...d, __score: score });
  }
  rows.sort((a,b)=> b.__score - a.__score);
  render(rows.slice(0, 300), terms, query);
}

q.addEventListener('input', e => search(e.target.value.trim()));

load().then(()=>{
  const init = new URL(location).searchParams.get('q') || '';
  if(init){ q.value = init; search(init); }
});
