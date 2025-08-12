// 단일 선택 칩(ALL/PDF/XLSX/PPTX/HWPX/TXT) + 선택된 것만 컬러 & 결과 필터
// 나머지(로그인/다크/검색모드/정렬/시트·페이지 필터)는 기존과 동일

//// 로그인/테마 ////
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
  const dark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('jinhak_theme', dark ? 'dark' : 'light');
});
(function(){ if(localStorage.getItem('jinhak_theme')==='dark') document.documentElement.classList.add('dark'); })();

//// 검색 상태 ////
const qEl = document.getElementById('q');
const listEl = document.getElementById('results');
const typeChipsEl = document.getElementById('typeChips');
const totalBadge = document.getElementById('totalBadge');
const countsText = document.getElementById('countsText');

const xlsxGroup = document.getElementById('xlsxGroup');
const sheetSelect = document.getElementById('sheetSelect');
const pdfGroup = document.getElementById('pdfGroup');
const pdfMin = document.getElementById('pdfMin');
const pdfMax = document.getElementById('pdfMax');

const modeTitleBtn = document.getElementById('modeTitle');
const modeAllBtn   = document.getElementById('modeAll');

let DATA = [];
const TYPES = ['pdf','xlsx','pptx','hwpx','txt'];
let selectedType = localStorage.getItem('selected_type') || 'all'; // <-- 단일 선택, 기본 all
let searchMode   = localStorage.getItem('search_mode')  || 'title'; // 'title'|'all'

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const termsOf = (q) => (q||'').split(/[,\s]+/g).map(s=>s.trim()).filter(Boolean);

function highlight(text, terms){
  if(!terms.length) return text || '';
  let out = text || '';
  const sorted = [...terms].sort((a,b)=>b.length-a.length);
  for(const t of sorted){
    const re = new RegExp(esc(t), 'gi');
    out = out.replace(re, m => `<mark>${m}</mark>`);
  }
  return out;
}
function countMatches(hay, t){
  const re = new RegExp(esc(t), 'gi');
  const m = hay.match(re); return m ? m.length : 0;
}

function scoreDoc(d, terms){
  const title = (d.title||'').toLowerCase();
  const file  = (d.file ||'').toLowerCase();
  const snip  = (d.snippet||'').toLowerCase();
  const cont  = (d.content||'').toLowerCase();

  const inTitle = `${title} ${file}`;
  const inBody  = `${snip} ${cont}`;

  // AND 포함
  const okAll = terms.every(q=>{
    const t = q.toLowerCase();
    return (searchMode==='title') ? inTitle.includes(t) : inTitle.includes(t) || inBody.includes(t);
  });
  if(!okAll) return -1;

  let s=0;
  for(const raw of terms){
    const t = raw.toLowerCase();
    s += countMatches(inTitle,t)*3;
    if(searchMode==='all') s += countMatches(snip,t)*2 + countMatches(cont,t)*1;
  }
  return s;
}

function render(rows, terms, query){
  listEl.innerHTML = '';
  totalBadge.textContent = rows.length.toString();

  const byType = TYPES.map(t => [t, rows.filter(r => r.fileType===t).length]);
  countsText.textContent = byType.map(([t,c]) => `${t.toUpperCase()}: ${c}`).join(' · ');

  if(!rows.length){
    const li = document.createElement('li');
    li.className = 'card';
    li.textContent = '검색 결과가 없습니다.';
    listEl.appendChild(li);
    return;
  }

  for(const d of rows){
    const metaExtra =
      (d.fileType==='pdf'  && d.page ) ? ` · p.${d.page}` :
      (d.fileType==='xlsx' && d.cell ) ? ` · ${d.sheet}!${d.cell}` :
      (d.fileType==='pptx' && d.slide) ? ` · slide ${d.slide}` : '';
    const raw = (d.snippet || d.content || '').replace(/\s+/g,' ').slice(0,220);
    const href = d.link + (d.link.includes('?') ? '&' : '?') + 'q=' + encodeURIComponent(query || '');
    const li = document.createElement('li');
    li.className = 'card';
    li.innerHTML = `
      <div class="meta"><span class="badge">${(d.fileType||'DOC').toUpperCase()}</span> ${d.file||''}${metaExtra}</div>
      <div class="title"><a href="${href}" target="_blank" rel="noopener">${d.title}</a></div>
      <div class="snippet">${highlight(raw, terms)}</div>`;
    listEl.appendChild(li);
  }
}

function buildTypeChips(){
  const countsAll = Object.fromEntries(TYPES.map(t=>[t,0]));
  for(const d of DATA){ if(d.fileType && d.fileType in countsAll) countsAll[d.fileType]++; }

  typeChipsEl.innerHTML = '';

  const make = (key,label,count) => {
    const btn = document.createElement('button');
    btn.className = 'chip' + (selectedType===key ? ' active' : '');
    btn.innerHTML = `${label} <span class="badge">${count}</span>`;
    btn.addEventListener('click', ()=>{
      selectedType = key;
      localStorage.setItem('selected_type', selectedType);
      // UI 토글
      [...typeChipsEl.children].forEach(el=>el.classList.remove('active'));
      btn.classList.add('active');
      syncFilterVisibility();
      runSearch(qEl.value.trim());
    });
    typeChipsEl.appendChild(btn);
  };

  // 전체
  make('all','전체', Object.values(countsAll).reduce((a,b)=>a+b,0));
  // 개별
  make('pdf','PDF', countsAll.pdf);
  make('xlsx','XLSX', countsAll.xlsx);
  make('pptx','PPTX', countsAll.pptx);
  make('hwpx','HWPX', countsAll.hwpx);
  make('txt','TXT', countsAll.txt);
}

function syncFilterVisibility(){
  // 단일선택 기준: xlsx일 때만 시트, pdf일 때만 페이지 범위 표시
  xlsxGroup.style.display = (selectedType==='xlsx') ? '' : 'none';
  pdfGroup.style.display  = (selectedType==='pdf')  ? '' : 'none';
}

async function load(){
  try{
    const res = await fetch('index.json', { cache: 'no-store' });
    DATA = await res.json();
  }catch(e){
    console.error('index.json 로드 실패', e);
    DATA = [];
  }

  // 시트 목록
  const sheets = Array.from(new Set(
    DATA.filter(d=>d.fileType==='xlsx' && d.sheet).map(d=>d.sheet)
  )).sort((a,b)=>a.localeCompare(b,'ko'));
  sheetSelect.innerHTML = `<option value="">전체</option>` + sheets.map(s=>`<option value="${s}">${s}</option>`).join('');

  buildTypeChips();
  syncFilterVisibility();

  // 모드 버튼 초기
  modeTitleBtn.classList.toggle('active', searchMode==='title');
  modeAllBtn.classList.toggle('active',   searchMode==='all');
}

function applyFilters(rows){
  // 타입 단일 필터
  if(selectedType!=='all') rows = rows.filter(r => r.fileType===selectedType);

  // 엑셀 시트(엑셀 선택 시에만 의미)
  const sheet = sheetSelect.value;
  if(selectedType==='xlsx' && sheet) rows = rows.filter(r => r.sheet===sheet);

  // PDF 페이지 범위
  if(selectedType==='pdf'){
    const min = parseInt(pdfMin.value || ''); const max = parseInt(pdfMax.value || '');
    if(!isNaN(min)) rows = rows.filter(r => (r.page||0) >= min);
    if(!isNaN(max)) rows = rows.filter(r => (r.page||0) <= max);
  }
  return rows;
}

function runSearch(query){
  const terms = termsOf(query);
  if(!terms.length){ render(applyFilters([]), terms, query); return; }

  const scored = [];
  for(const d of DATA){
    const s = scoreDoc(d, terms);
    if(s > 0) scored.push({ ...d, __score: s });
  }
  scored.sort((a,b)=> b.__score - a.__score);
  render(applyFilters(scored), terms, query);
}

//// 이벤트 ////
qEl?.addEventListener('input', e => runSearch(e.target.value.trim()));
sheetSelect?.addEventListener('change', ()=> runSearch(qEl.value.trim()));
pdfMin?.addEventListener('input',  ()=> runSearch(qEl.value.trim()));
pdfMax?.addEventListener('input',  ()=> runSearch(qEl.value.trim()));

modeTitleBtn?.addEventListener('click', ()=>{
  searchMode = 'title'; localStorage.setItem('search_mode','title');
  modeTitleBtn.classList.add('active'); modeAllBtn.classList.remove('active');
  runSearch(qEl.value.trim());
});
modeAllBtn?.addEventListener('click', ()=>{
  searchMode = 'all'; localStorage.setItem('search_mode','all');
  modeAllBtn.classList.add('active'); modeTitleBtn.classList.remove('active');
  runSearch(qEl.value.trim());
});

//// 시작 ////
load().then(()=>{
  const init = new URL(location).searchParams.get('q') || '';
  if(init){ qEl.value = init; runSearch(init); }
  // 초기 선택: 전체(또는 저장된 선택)
  [...typeChipsEl.children].forEach(el=>el.classList.remove('active'));
  const first = [...typeChipsEl.children].find(el => el.textContent.trim().startsWith(
    (selectedType==='all'?'전체':selectedType.toUpperCase())
  ));
  if(first) first.classList.add('active');
  if(isAuthed()) qEl?.focus();
});
