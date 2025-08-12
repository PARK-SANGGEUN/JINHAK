// 로그인/테마 + 혼합 결과(타입 섞기) + 가중치 정렬(제목×3, 스니펫×2, 본문×1)
// AND 검색 + 필터(파일형식 멀티 선택, XLSX 시트 선택, PDF 페이지 범위)

//// ===== 로그인/테마 =====
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

//// ===== 검색 데이터/상태 =====
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

let DATA = [];
let TYPES = ['pdf','xlsx','pptx','hwpx','txt']; // 표시 순서
let selectedTypes = new Set(TYPES); // 기본: 모두 선택

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

//// ===== 유틸 =====
function termsOf(q){ return (q||'').split(/[,\s]+/g).map(s=>s.trim()).filter(Boolean); }
function highlight(text, terms){
  if(!terms.length) return text || '';
  let out = text || '';
  const sorted = [...terms].sort((a,b)=>b.length-a.length);
  for(const t of sorted){
    const re = new RegExp(esc(t), 'gi'); // 연속글자 일치
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
  const snip  = (d.snippet||'').toLowerCase();
  const cont  = (d.content||'').toLowerCase();

  // 모든 키워드가 최소 한 번은 들어가야 함(엄격 AND)
  const okAll = terms.every(tt=>{
    tt = tt.toLowerCase();
    return title.includes(tt) || snip.includes(tt) || cont.includes(tt);
  });
  if(!okAll) return -1;

  let s=0;
  for(const t of terms){
    const tt=t.toLowerCase();
    s += countMatches(title, tt)*3 + countMatches(snip, tt)*2 + countMatches(cont, tt)*1;
  }
  return s;
}

//// ===== 렌더 =====
function render(rows, terms, query){
  listEl.innerHTML = '';
  totalBadge.textContent = rows.length.toString();

  // 타입별 카운트 텍스트
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
    listEl.appendChild(li);
  }
}

//// ===== 타입 칩 =====
function buildTypeChips(rows){
  // rows 없을 때도 전체 카운트 계산
  const counts = Object.fromEntries(TYPES.map(t=>[t, 0]));
  for(const d of DATA){ if(d.fileType && d.fileType in counts) counts[d.fileType]++; }

  typeChipsEl.innerHTML = '';
  // All 칩
  const allChip = document.createElement('button');
  allChip.className = 'chip' + (selectedTypes.size===TYPES.length ? ' active' : '');
  allChip.textContent = `전체`;
  allChip.addEventListener('click', ()=>{
    if(selectedTypes.size===TYPES.length){ // 모두 선택 상태면 모두 해제 -> 모두 선택으로 유지
      selectedTypes = new Set(TYPES);
    }else{
      selectedTypes = new Set(TYPES);
    }
    syncFilterVisibility();
    runSearch(qEl.value.trim());
  });
  typeChipsEl.appendChild(allChip);

  // 각 타입 칩
  for(const t of TYPES){
    const btn = document.createElement('button');
    const active = selectedTypes.has(t);
    btn.className = 'chip' + (active ? ' active' : '');
    btn.innerHTML = `${t.toUpperCase()} <span class="badge">${counts[t]}</span>`;
    btn.addEventListener('click', ()=>{
      if(selectedTypes.has(t)) selectedTypes.delete(t); else selectedTypes.add(t);
      // 아무것도 선택 안 되면 전체 선택
      if(selectedTypes.size===0) selectedTypes = new Set(TYPES);
      syncFilterVisibility();
      runSearch(qEl.value.trim());
    });
    typeChipsEl.appendChild(btn);
  }
}

function syncFilterVisibility(){
  // XLSX가 선택되어 있으면 시트 필터 보이기
  const showXlsx = selectedTypes.has('xlsx');
  xlsxGroup.style.display = showXlsx ? '' : 'none';

  // PDF가 선택되어 있으면 페이지 범위 보이기
  const showPdf = selectedTypes.has('pdf');
  pdfGroup.style.display = showPdf ? '' : 'none';
}

//// ===== 로드/검색 =====
async function load(){
  try{
    const res = await fetch('index.json', { cache: 'no-store' });
    DATA = await res.json();
  }catch(e){
    console.error('index.json 로드 실패', e);
    DATA = [];
  }

  // 시트 목록 수집
  const sheets = Array.from(new Set(
    DATA.filter(d=>d.fileType==='xlsx' && d.sheet).map(d=>d.sheet)
  )).sort((a,b)=> a.localeCompare(b, 'ko'));
  sheetSelect.innerHTML = `<option value="">전체</option>` + sheets.map(s=>`<option value="${s}">${s}</option>`).join('');

  buildTypeChips(DATA);
  syncFilterVisibility();
}

function applyFilters(rows){
  // 타입 필터
  rows = rows.filter(r => selectedTypes.has(r.fileType));

  // XLSX 시트 필터
  const sheet = sheetSelect.value;
  if(sheet) rows = rows.filter(r => r.fileType!=='xlsx' || r.sheet===sheet);

  // PDF 페이지 범위
  const min = parseInt(pdfMin.value || ''); const max = parseInt(pdfMax.value || '');
  if(!isNaN(min)) rows = rows.filter(r => r.fileType!=='pdf' || (r.page || 0) >= min);
  if(!isNaN(max)) rows = rows.filter(r => r.fileType!=='pdf' || (r.page || 0) <= max);

  return rows;
}

function runSearch(query){
  const terms = termsOf(query);
  if(!terms.length){ render(applyFilters([]), terms, query); return; }

  // 스코어링
  const scored = [];
  for(const d of DATA){
    const s = scoreDoc(d, terms);
    if(s > 0) scored.push({ ...d, __score: s });
  }
  // 정렬: 점수 내림차순 (등장횟수 총합이 많은 레코드가 위)
  scored.sort((a,b)=> b.__score - a.__score);

  // 필터 적용
  const filtered = applyFilters(scored);

  render(filtered, terms, query);
}

//// ===== 이벤트 =====
qEl?.addEventListener('input', e => runSearch(e.target.value.trim()));
sheetSelect?.addEventListener('change', ()=> runSearch(qEl.value.trim()));
pdfMin?.addEventListener('input',  ()=> runSearch(qEl.value.trim()));
pdfMax?.addEventListener('input',  ()=> runSearch(qEl.value.trim()));

//// ===== 부트 =====
load().then(()=>{
  const init = new URL(location).searchParams.get('q') || '';
  if(init){ qEl.value = init; runSearch(init); }
  if(isAuthed()) qEl?.focus();
});
