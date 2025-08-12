// 로그인/테마 + 단일선택 타입칩 + 검색모드(files | all)
// files(파일제목) : 파일명으로만 AND 검색 + 결과엔 파일명만 표시
// all(파일+본문)  : 파일명+본문 AND 검색 + 스니펫 표시
// ★ scoreDoc(): AND + 빈도 가중 + 정확문구/순서 보너스
// ★ PDF 미리보기: pdf.js로 축소 렌더 + 하이라이트 스니펫

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

const previewEl = document.getElementById('preview');

let DATA = [];
const TYPES = ['pdf','xlsx','pptx','hwpx','txt'];
let selectedType = localStorage.getItem('selected_type') || 'all';
let savedMode = localStorage.getItem('search_mode');
if(savedMode === 'title') savedMode = 'files'; // 호환
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
  const m = (hay||'').match(re); return m ? m.length : 0;
}

//// ★★★ 랭킹 로직(강화) ★★★
function scoreDoc(d, terms){
  const file  = (d.file ||'').toLowerCase();
  const title = (d.title||'').toLowerCase();
  const snip  = (d.snippet||'').toLowerCase();
  const cont  = (d.content||'').toLowerCase();

  const q = (terms||[]).map(t=>t.toLowerCase()).filter(Boolean);
  if(!q.length) return -1;

  // 모드별 검색 대상
  const inFiles = file;                       // 파일제목 모드 대상
  const inTitlePlus = `${file} ${title}`;     // all 모드에서 제목 가중(파일명+표시제목)
  const inBody  = `${snip} ${cont}`;          // 본문

  // 1) AND 필터: 모든 단어 포함
  const ok = q.every(t => (searchMode==='files')
    ? inFiles.includes(t)
    : (inTitlePlus.includes(t) || inBody.includes(t))
  );
  if(!ok) return -1;

  // 2) 빈도 가중치: 파일명>제목>스니펫>본문
  let s = 0;
  for(const t of q){
    if(searchMode==='files'){
      s += countMatches(inFiles, t) * 3;       // 파일명만
    }else{
      s += countMatches(inFiles, t)     * 4;   // 파일명 가장 높게
      s += countMatches(inTitlePlus, t) * 3;   // 제목(표시제목)
      s += countMatches(snip, t)        * 2;   // 스니펫
      s += countMatches(cont, t)        * 1;   // 본문 전체
    }
  }

  // 3) 정확 문구 보너스
  const phrase = q.join(' ');
  if(phrase){
    if (inFiles.includes(phrase)) s += 50;
    else if (searchMode==='all' && (inTitlePlus.includes(phrase) || inBody.includes(phrase))) s += 50;
  }

  // 4) 순서 보너스 (t1.*t2.*t3)
  if(q.length >= 2){
    const ordered = new RegExp(q.map(esc).join('.*'), 'i');
    if (ordered.test(inFiles)) s += 20;
    else if (searchMode==='all' && (ordered.test(inTitlePlus) || ordered.test(inBody))) s += 20;
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
    previewEl.innerHTML = `<div class="muted">PDF 결과에 마우스를 올리거나 클릭하면 여기에 <b>축소 이미지 + 스니펫</b>이 보입니다.</div>`;
    return;
  }

  for(const d of rows){
    const displayTitle = d.file || d.title || '';
    const titleHtml = highlight(displayTitle, terms);
    const href = d.link + (d.link.includes('?') ? '&' : '?') + 'q=' + encodeURIComponent(query || '');

    const li = document.createElement('li');
    li.className = 'card';
    li.tabIndex = 0;

    if(searchMode === 'files'){
      // 파일제목 모드: 파일명만
      li.innerHTML = `<div class="title"><a href="${href}" target="_blank" rel="noopener">${titleHtml}</a></div>`;
    } else {
      // 파일+본문 모드: 메타 + 스니펫
      const metaExtra =
        (d.fileType==='pdf'  && d.page ) ? ` · p.${d.page}` :
        (d.fileType==='xlsx' && d.cell ) ? ` · ${d.sheet}!${d.cell}` :
        (d.fileType==='pptx' && d.slide) ? ` · slide ${d.slide}` : '';
      const rawSnippet = (d.snippet || d.content || '').replace(/\s+/g,' ').slice(0,220);
      const snippetHtml = highlight(rawSnippet, terms);

      li.innerHTML = `
        <div class="meta"><span class="badge">${(d.fileType||'DOC').toUpperCase()}</span> ${displayTitle}${metaExtra}</div>
        <div class="title"><a href="${href}" target="_blank" rel="noopener">${titleHtml}</a></div>
        <div class="snippet">${snippetHtml}</div>
      `;
    }

    // PDF 미리보기 트리거(마우스오버/클릭/포커스)
    li.addEventListener('mouseenter', ()=> { if(d.fileType==='pdf') showPdfPreview(d, terms, query); });
    li.addEventListener('click',      (e)=> { if(d.fileType==='pdf'){ e.preventDefault(); showPdfPreview(d, terms, query); } });
    li.addEventListener('focus',      ()=> { if(d.fileType==='pdf') showPdfPreview(d, terms, query); });

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
    // site/index.json 을 기본으로 시도 (현재 워크플로 기준)
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
  if(!terms.length){
    render(applyFilters([]), terms, query);
    return;
  }

  const scored = [];
  for(const d of DATA){
    const s = scoreDoc(d, terms);
    if(s > 0) scored.push({ ...d, __score: s });
  }
  // 정확도(점수) 기준 내림차순
  scored.sort((a,b)=> b.__score - a.__score);
  render(applyFilters(scored), terms, query);
}

//// PDF 미리보기 ////
async function showPdfPreview(d, terms, query){
  // 스니펫 준비
  const raw = (d.snippet || d.content || '').replace(/\s+/g,' ').slice(0, 240);
  const snippetHtml = highlight(raw, terms);

  // 캔버스 컨테이너
  previewEl.innerHTML = `
    <div class="meta"><span class="badge">PDF</span> ${d.file || ''} ${d.page?`· p.${d.page}`:''}</div>
    <canvas id="pvCanvas" class="pv-canvas"></canvas>
    <div class="snippet">${snippetHtml}</div>
    <div><a class="btn" href="${d.link}${d.page?`#page=${d.page}`:''}" target="_blank" rel="noopener">원본 열기</a></div>
  `;

  try{
    const pdf = await pdfjsLib.getDocument(d.link).promise;
    const pageIndex = Math.max(1, Math.min(d.page || 1, pdf.numPages));
    const page = await pdf.getPage(pageIndex);
    // 컨테이너 폭에 맞춰 축소 렌더
    const viewport = page.getViewport({ scale: 1.0 });
    const canvas = document.getElementById('pvCanvas');
    const ctx = canvas.getContext('2d');
    const maxW = Math.min(canvas.parentElement.clientWidth, 900);
    const scale = maxW / viewport.width;
    const v2 = page.getViewport({ scale });
    canvas.width = v2.width; canvas.height = v2.height;
    await page.render({ canvasContext: ctx, viewport: v2 }).promise;
  }catch(e){
    previewEl.innerHTML = `<div class="card muted">미리보기를 불러오지 못했습니다. <a href="${d.link}" target="_blank" rel="noopener">원본 열기</a></div>`;
    console.error(e);
  }
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
