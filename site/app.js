// 로그인/테마 유지 + 2단 컬럼 검색 렌더 + 가중치 정렬(제목×3, 스니펫×2, 본문×1)
// AND 검색: 모든 키워드가 레코드 안에 실제 포함되어야 결과로 표시

// ===== 로그인/테마 =====
const authEl = document.getElementById('auth');
const loginBtn = document.getElementById('loginBtn');
const loginUser = document.getElementById('loginUser');
const loginPass = document.getElementById('loginPass');
const loginMsg  = document.getElementById('loginMsg');
const logoutBtn = document.getElementById('logoutBtn');
const toggleTheme = document.getElementById('toggleTheme');

function isAuthed(){ return localStorage.getItem('jinhak_auth') === 'ok'; }
function showAuth(v){ authEl.style.display = v ? 'grid' : 'none'; }

function tryLogin(){
  const u = (loginUser?.value || '').trim();
  const p = (loginPass?.value || '').trim();
  if(u === 'teacher' && p === 'teacher'){
    localStorage.setItem('jinhak_auth', 'ok');
    showAuth(false); loginMsg.style.display='none';
    document.getElementById('q')?.focus();
  }else{ loginMsg.style.display='block'; }
}
loginBtn?.addEventListener('click', tryLogin);
loginPass?.addEventListener('keydown', (e)=>{ if(e.key==='Enter') tryLogin(); });
logoutBtn?.addEventListener('click', ()=>{ localStorage.removeItem('jinhak_auth'); showAuth(true); loginUser.focus(); });
if(!isAuthed()) showAuth(true);

toggleTheme?.addEventListener('click', ()=>{
  const root = document.documentElement;
  const dark = root.classList.toggle('dark');
  localStorage.setItem('jinhak_theme', dark ? 'dark' : 'light');
});
(function(){ if(localStorage.getItem('jinhak_theme')==='dark') document.documentElement.classList.add('dark'); })();

// ===== 검색 =====
const q = document.getElementById('q');
const listX = document.getElementById('results-xlsx');
const listE = document.getElementById('results-etc');
let DATA = [];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function highlight(text, terms){
  if(!terms.length) return text;
  let out = text ?? '';
  const sorted = [...terms].sort((a,b)=>b.length-a.length);
  for(const t of sorted){
    const re = new RegExp(esc(t), 'gi'); // 연속 글자 일치
    out = out.replace(re, m => `<mark>${m}</mark>`);
  }
  return out;
}

function renderColumn(el, rows, terms, query){
  el.innerHTML = '';
  if(!rows.length){
    const li = document.createElement('li');
    li.className = 'card';
    li.textContent = '검색 결과가 없습니다.';
    el.appendChild(li);
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
    el.appendChild(li);
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

function termsOf(q){ return q.split(/[,\s]+/g).map(s=>s.trim()).filter(Boolean); }

function weightedScore(d, terms){
  const title = (d.title||'').toLowerCase();
  const snip  = (d.snippet||'').toLowerCase();
  const cont  = (d.content||'').toLowerCase();

  // 모든 키워드가 최소 한 번은 들어가야 함(엄격 AND)
  const okAll = terms.every(t=>{
    const tt=t.toLowerCase();
    return title.includes(tt)||snip.includes(tt)||cont.includes(tt);
  });
  if(!okAll) return -1;

  const count = (hay, t) => {
    const re = new RegExp(esc(t), 'gi');
    const m = hay.match(re); return m ? m.length : 0;
  };

  let s=0;
  for(const t of terms){
    const tt=t.toLowerCase();
    s += count(title, tt)*3 + count(snip, tt)*2 + count(cont, tt)*1;
  }
  return s;
}

function search(query){
  const terms = termsOf(query);
  if(!terms.length){ listX.innerHTML=''; listE.innerHTML=''; return; }

  const scored = [];
  for(const d of DATA){
    const s = weightedScore(d, terms);
    if(s > 0) scored.push({ ...d, __score: s });
  }
  // 정렬: 점수 내림차순
  scored.sort((a,b)=> b.__score - a.__score);

  // 좌/우 분할
  const left  = scored.filter(d => d.fileType === 'xlsx');
  const right = scored.filter(d => d.fileType !== 'xlsx');

  renderColumn(listX, left, terms, query);
  renderColumn(listE, right, terms, query);
}

q?.addEventListener('input', e => search(e.target.value.trim()));

load().then(()=>{
  const init = new URL(location).searchParams.get('q') || '';
  if(init){ q.value = init; search(init); }
  if(isAuthed()) q?.focus();
});
