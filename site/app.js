// 로그인/테마 + 단일선택 타입칩 + 검색모드(files | all)
// files(파일제목) 모드: 파일명으로만 AND 검색 + 결과에 "파일명만" 표시
// all(파일+본문)  모드: 파일명+본문 AND 검색 + 스니펫 표시

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

const modeFilesBtn = document.getElementById('modeFiles');
const modeAllBtn   = document.getElementById('modeAll');

let DATA = [];
const TYPES = ['pdf','xlsx','pptx','hwpx','txt'];
let selectedType = localStorage.getItem('selected_type') || 'all';

// 이전 저장값 호환: 'title'을 'files'로 승격
let savedMode = localStorage.getItem('search_mode');
if(savedMode === 'title') savedMode = 'files';
let searchMode = savedMode || 'files'; // 'files' | 'all'

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
  const file  = (d.file ||'').toLowerCase();           // 파일명
  const title = (d.title||'').toLowerCase();           // 표시제목(보조)
  const snip  = (d.snippet||'').toLowerCase();
  const cont  = (d.content||'').toLowerCase();

  const inFiles = file;                                 // 파일제목 모드: 파일명만
  const inTitlePlus = `${file} ${title}`;               // all 모드에서 제목 가중
  const inBody  = `${snip} ${cont}`;                    // 본문

  // AND 포함 조건
  const okAll = terms.every(q=>{
    const t = q.toLowerCase();
    return (searchMode==='files')
      ? inFiles.includes(t)
      : inTitlePlus.includes(t) || inBody.includes(t);
  });
  if(!okAll) return -1;

  // 가중치
  let s=0;
  for(const raw of terms){
    const t = raw.toLowerCase();
    if(searchMode==='files'){
      s += countMatches(inFiles, t) * 3;                // 파일명만
    }else{
      s += countMatches(inTitlePlus, t) * 3;            // 제목(파일명+표시제목)
      s += countMatches(snip, t) * 2 + countMatches(cont, t) * 1;
    }
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
    // 파일제목만 보여주기 위해 displayTitle은 "파일명만"
    const displayTitle = d.file || '';                  // 파일명만 사용
    const titleHtml = highlight(displayTitle, terms);
    const href = d.link + (d.link.includes('?') ? '&' : '?') + 'q=' + encodeURIComponent(query || '');

    const li = document.createElement('li');
    li.className = 'card';

    if(searchMode === 'files'){
      // 파일제목 모드: 오직 파일명 링크만 표시 (메타/스니펫 없음)
      li.innerHTML = `<div class="title"><a href="${href}" target="_blank" rel="noopener">${titleHtml}</a></div>`;
    } else {
      // 파일+본문 모드: 스니펫 포함
      const metaExtra =
        (d.fileType==='pdf'  && d.page ) ? ` · p.${d.page}` :
        (d.fileType==='xlsx' && d.cell ) ? ` · ${d.sheet}!${d.cell}` :
        (d.fileType==='pptx' && d.slide) ? ` · slide ${d.slide}` : '';
      const rawSnippet = (d.snippet || d.content || '').replace(/\s+/g,' ').slice(0, 220);
      const snippetHtml = highlight(rawSnippet, terms);
      li.innerHTML = `
        <div class="meta"><span class="badge">${(d.fileType||'DOC').toUpperCase()}</span> ${displayTitle}${metaExtra}</div>
        <div class="title"><a href="${href}" target="_blank" rel="noopener">${titleHtml}</a></div>
        <div class="snippet">${snippetHtml}</div>
      `;
    }
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
      [...typeChipsEl.querySelectorAll('.chip')].forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      syncFilterVisibility();
      runSearch(qEl.value.trim());
    });
    typeChipsEl.appendChild(btn);
  };
  make('all','전체', Object.values(countsAll).reduce((a,b)=>a+b,0));
  make('pdf','PDF',   countsAll.pdf);
  make('xlsx','XLSX', countsAll.xlsx);
  make('pptx','PPTX', countsAll.pptx);
  make('hwpx','HWPX', countsAll.hwpx);
  make('txt','TXT',   countsAll.txt);
}

function syncFilterVisibility(){
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

  const sheets = Array.from(new Set(
    DATA.filter(d=>d.fileType==='xlsx' && d.sheet).map(d=>d.sheet)
  )).sort((a,b)=>a.localeCompare(b,'ko'));
  sheetSelect.innerHTML = `<option value="">전체</option>` + sheets.map(s=>`<option value="${s}">${s}</option>`).join('');

  buildTypeChips();
  syncFilterVisibility();

  modeFilesBtn.classList.toggle('active', searchMode==='files');
  modeAllBtn.classList.toggle('active',   searchMode==='all');
}

function applyFilters(rows){
  if(selectedType!=='all') rows = rows.filter(r => r.fileType===selectedType);
  const sheet = sheetSelect.value;
  if(selectedType==='xlsx' && sheet) rows = rows.filter(r => r.sheet===sheet);
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

modeFilesBtn?.addEventListener('click', ()=>{
  searchMode = 'files'; localStorage.setItem('search_mode','files');
  modeFilesBtn.classList.add('active'); modeAllBtn.classList.remove('active');
  runSearch(qEl.value.trim());
});
modeAllBtn?.addEventListener('click', ()=>{
  searchMode = 'all'; localStorage.setItem('search_mode','all');
  modeAllBtn.classList.add('active'); modeFilesBtn.classList.remove('active');
  runSearch(qEl.value.trim());
});

//// 시작 ////
load().then(()=>{
  const init = new URL(location).searchParams.get('q') || '';
  if(init){ qEl.value = init; runSearch(init); }
  // 타입칩 active 복구
  [...typeChipsEl.children].forEach(el=>el.classList.remove('active'));
  const want = (selectedType==='all' ? '전체' : selectedType.toUpperCase());
  const cur = [...typeChipsEl.children].find(el => (el.textContent||'').trim().startsWith(want));
  if(cur) cur.classList.add('active');
  if(isAuthed()) qEl?.focus();
});
