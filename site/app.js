/* 기능 요약
 - 클릭 시 "해당 항목 아래"에 미리보기 펼침/접힘 (PDF 캔버스, XLSX iframe)
 - 클릭한 항목은 .active 스타일로 강조
 - 랭킹 강화: AND + 빈도 가중(파일>제목>스니펫>본문) + 정확 문구/순서 보너스
 - 속도 개선: 입력 디바운스, 상위 N 페이지만 표시(더 보기), PDF 렌더 캐시, DOM batch
*/

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

//// DOM ////
const qEl = document.getElementById('q');
const listEl = document.getElementById('results');
const typeChipsEl = document.getElementById('typeChips');
const totalBadge = document.getElementById('totalBadge');
const countsText = document.getElementById('countsText');
const moreBtn = document.getElementById('moreBtn');

const xlsxGroup = document.getElementById('xlsxGroup');
const sheetSelect = document.getElementById('sheetSelect');
const pdfGroup = document.getElementById('pdfGroup');
const pdfMin = document.getElementById('pdfMin');
const pdfMax = document.getElementById('pdfMax');

const modeFilesBtn = document.getElementById('modeFiles');
const modeAllBtn   = document.getElementById('modeAll');

//// 상태 ////
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

//// 검색/점수 ////
function scoreDoc(d, terms){
  const file  = (d._fileL || (d._fileL = (d.file||'').toLowerCase()));
  const title = (d._titleL|| (d._titleL= (d.title||'').toLowerCase()));
  const snip  = (d._snipL || (d._snipL = (d.snippet||'').toLowerCase()));
  const cont  = (d._contL || (d._contL = (d.content||'').toLowerCase()));

  const q = (terms||[]).map(t=>t.toLowerCase()).filter(Boolean);
  if(!q.length) return -1;

  const inFiles = file;
  const inTitlePlus = file + ' ' + title;
  const inBody = snip + ' ' + cont;

  // AND 필터
  const ok = q.every(t => (searchMode==='files')
    ? inFiles.includes(t)
    : (inTitlePlus.includes(t) || inBody.includes(t))
  );
  if(!ok) return -1;

  // 빈도 가중치
  let s = 0;
  for(const t of q){
    if(searchMode==='files'){
      s += countMatches(inFiles, t) * 3;
    }else{
      s += countMatches(inFiles, t)     * 4;
      s += countMatches(inTitlePlus, t) * 3;
      s += countMatches(snip, t)        * 2;
      s += countMatches(cont, t)        * 1;
    }
  }

  // 정확 문구 + 순서 보너스
  const phrase = q.join(' ');
  if(phrase){
    if (inFiles.includes(phrase)) s += 50;
    else if (searchMode==='all' && (inTitlePlus.includes(phrase) || inBody.includes(phrase))) s += 50;
  }
  if(q.length >= 2){
    const ordered = new RegExp(q.map(esc).join('.*'), 'i');
    if (ordered.test(inFiles)) s += 20;
    else if (searchMode==='all' && (ordered.test(inTitlePlus) || ordered.test(inBody))) s += 20;
  }
  return s;
}

//// 로드 ////
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
  modeFilesBtn.classList.toggle('active', searchMode==='files');
  modeAllBtn.classList.toggle('active',   searchMode==='all');

  // 초기 검색어
  const init = new URL(location).searchParams.get('q') || '';
  if(init){ qEl.value = init; runSearch(init); }
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

//// 필터 + 페이지네이션 ////
let PAGE = 1;
const PER_PAGE = 30;       // 1회 렌더 개수 (속도 ↑)
let CURRENT = [];          // 정렬/필터 적용 전체
moreBtn.addEventListener('click', ()=>{
  PAGE++;
  render(CURRENT, termsOf(qEl.value.trim()), qEl.value.trim(), {append:true});
});

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

//// 렌더 ////
function render(rows, terms, query, opts={append:false}){
  // 페이지 슬라이스
  const total = rows.length;
  const end = PAGE*PER_PAGE;
  const pageRows = rows.slice(opts.append ? (end-PER_PAGE) : 0, end);
  if(!opts.append){ listEl.innerHTML=''; }

  totalBadge.textContent = String(total);
  const byType = TYPES.map(t => [t, rows.filter(r=>r.fileType===t).length]);
  countsText.textContent = byType.map(([t,c])=>`${t.toUpperCase()}:${c}`).join(' · ');
  moreBtn.style.display = (end < total) ? 'inline-block' : 'none';

  // DOM batch
  const frag = document.createDocumentFragment();

  if(!pageRows.length && !opts.append){
    const li = document.createElement('li');
    li.className = 'card';
    li.textContent = '검색 결과가 없습니다.';
    frag.appendChild(li);
  }else{
    for(const d of pageRows){
      const displayTitle = d.file || d.title || '';
      const titleHtml = highlight(displayTitle, terms);
      const href = d.link + (d.link.includes('?') ? '&' : '?') + 'q=' + encodeURIComponent(query || '');

      const li = document.createElement('li');
      li.className = 'card';
      li.tabIndex = 0;

      // 본문(모드별)
      let inner = '';
      if(searchMode==='files'){
        inner = `<div class="title"><a href="${href}" target="_blank" rel="noopener">${titleHtml}</a></div>`;
      }else{
        const metaExtra =
          (d.fileType==='pdf'  && d.page ) ? ` · p.${d.page}` :
          (d.fileType==='xlsx' && d.cell ) ? ` · ${d.sheet}!${d.cell}` :
          (d.fileType==='pptx' && d.slide) ? ` · slide ${d.slide}` : '';
        const rawSnippet = (d.snippet || d.content || '').replace(/\s+/g,' ').slice(0,220);
        const snippetHtml = highlight(rawSnippet, terms);
        inner = `
          <div class="meta"><span class="badge">${(d.fileType||'DOC').toUpperCase()}</span> ${displayTitle}${metaExtra}</div>
          <div class="title"><a href="${href}" target="_blank" rel="noopener">${titleHtml}</a></div>
          <div class="snippet">${snippetHtml}</div>
        `;
      }

      // 인라인 미리보기 컨테이너
      inner += `<div class="inline-preview" data-kind="${d.fileType}"></div>`;
      li.innerHTML = inner;

      // 클릭 시 토글 + 미리보기 로드
      li.addEventListener('click', (e)=>{
        // 링크 자체 클릭은 새 탭(원래 동작) 유지
        if(e.target && e.target.tagName === 'A') return;

        // 다른 열린 미리보기 닫기
        closeAllPreviewsExcept(li);

        li.classList.toggle('active');
        const pane = li.querySelector('.inline-preview');
        const open = pane.classList.toggle('open');
        if(open){
          if(d.fileType==='pdf') loadPdfPreviewInto(pane, d);
          else if(d.fileType==='xlsx') loadXlsxPreviewInto(pane, d, query);
          else pane.innerHTML = `<div class="muted">이 형식은 인라인 미리보기를 지원하지 않습니다. <a class="btn" href="${href}" target="_blank" rel="noopener">원본 열기</a></div>`;
        }
      });

      frag.appendChild(li);
    }
  }

  if(opts.append) listEl.appendChild(frag); else listEl.replaceChildren(frag);
}

function closeAllPreviewsExcept(exceptLi){
  listEl.querySelectorAll('.card').forEach(li=>{
    if(li!==exceptLi){ li.classList.remove('active'); li.querySelector('.inline-preview')?.classList.remove('open'); }
  });
}

//// PDF 미리보기 (inline, 캐싱) ////
const pdfCache = new Map(); // url -> PDFDocumentProxy
async function loadPdfPreviewInto(pane, d){
  pane.innerHTML = `<canvas class="pv-canvas"></canvas><div class="snippet muted" style="margin-top:6px"></div><div style="margin-top:8px"><a class="btn" href="${d.link}${d.page?`#page=${d.page}`:''}" target="_blank" rel="noopener">원본 열기</a></div>`;
  const canvas = pane.querySelector('canvas');
  const ctx = canvas.getContext('2d');

  // 스니펫(이미 index.json에 있는 내용)
  pane.querySelector('.snippet').innerHTML = (d.snippet||'').replace(/\s+/g,' ').slice(0,240);

  try{
    let doc = pdfCache.get(d.link);
    if(!doc){
      doc = await pdfjsLib.getDocument(d.link).promise;
      pdfCache.set(d.link, doc);
    }
    const pageIndex = Math.max(1, Math.min(d.page || 1, doc.numPages));
    const page = await doc.getPage(pageIndex);

    // 컨테이너 폭 기준 스케일
    const base = page.getViewport({ scale: 1.0 });
    const maxW = Math.min(pane.clientWidth, 900);
    const scale = Math.max(0.5, Math.min(1.5, maxW / base.width));
    const vp = page.getViewport({ scale });

    canvas.width = vp.width; canvas.height = vp.height;
    await page.render({ canvasContext: ctx, viewport: vp, intent: 'display' }).promise;
  }catch(e){
    pane.innerHTML = `<div class="muted">PDF 미리보기를 불러오지 못했습니다. <a class="btn" href="${d.link}" target="_blank" rel="noopener">원본 열기</a></div>`;
    console.error(e);
  }
}

//// XLSX 미리보기 (inline iframe: xlsx.html) ////
function loadXlsxPreviewInto(pane, d, query){
  const url = `./xlsx.html?src=${encodeURIComponent(d.link)}&sheet=${encodeURIComponent(d.sheet||'')}&cell=${encodeURIComponent(d.cell||'')}&q=${encodeURIComponent(query||'')}`;
  pane.innerHTML = `<iframe src="${url}" loading="lazy"></iframe>
    <div style="margin-top:8px"><a class="btn" href="${d.link}" target="_blank" rel="noopener">원본 다운로드</a></div>`;
}

//// 실행 ////
function runSearch(query){
  const terms = termsOf(query);
  PAGE = 1;

  if(!terms.length){
    CURRENT = [];
    render(CURRENT, terms, query);
    return;
  }

  // 빠른 스코어링
  const scored = [];
  for(const d of DATA){
    const s = scoreDoc(d, terms);
    if(s>0) scored.push({...d, __score:s});
  }
  scored.sort((a,b)=> b.__score - a.__score);

  CURRENT = applyFilters(scored);
  render(CURRENT, terms, query);
}

//// 이벤트 (디바운스) ////
const debounce = (fn, ms) => { let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), ms); }; };
qEl?.addEventListener('input', debounce(e => runSearch(e.target.value.trim()), 180));
sheetSelect?.addEventListener('change', ()=> runSearch(qEl.value.trim()));
pdfMin?.addEventListener('input',  debounce(()=> runSearch(qEl.value.trim()), 150));
pdfMax?.addEventListener('input',  debounce(()=> runSearch(qEl.value.trim()), 150));

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
load();
