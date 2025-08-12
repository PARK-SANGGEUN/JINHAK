/* 네이버 스타일:
   - 상단 고정 검색바 + 자동완성
   - 탭(통합/문서) + 정렬(정확도/최신)
   - 좌 리스트 + 우 미리보기
   - 모드: 파일제목 | 파일+본문
   - 페이지네이션(20개씩) + 키보드(↑↓/→/Enter)
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
const searchBtn = document.getElementById('searchBtn');
const resultsEl = document.getElementById('results');
const totalBadge = document.getElementById('totalBadge');
const countsText = document.getElementById('countsText');
const tabsEl = document.getElementById('tabs');
const acEl = document.getElementById('autocomplete');
const previewEl = document.getElementById('preview');
const pvMeta = document.getElementById('pvMeta');
const moreBtn = document.getElementById('moreBtn');
const modeFilesBtn = document.getElementById('modeFiles');
const modeAllBtn   = document.getElementById('modeAll');

//// 상태값 ////
let DATA = [];
const TYPES = ['pdf','xlsx','pptx','hwpx','txt'];
let tab = localStorage.getItem('tab') || 'all'; // all/pdf/xlsx/...
let searchMode = (localStorage.getItem('search_mode')||'files').replace('title','files'); // 호환
let sortMode = localStorage.getItem('sort_mode') || 'score'; // score | recent
let page = 1; const PER_PAGE = 20;
let currentRows = []; // 필터/정렬 후 전체 결과(페이지 적용 전)
let focusIndex = -1;  // 키보드 포커스용

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const termsOf = (q) => (q||'').split(/[,\s]+/g).map(s=>s.trim()).filter(Boolean);

//// 로드 ////
async function load(){
  try{
    const res = await fetch('index.json', { cache: 'no-store' });
    DATA = await res.json();
  }catch(e){
    console.error('index.json 로드 실패', e); DATA=[];
  }
  initAutocomplete();
  restoreUI();
  const initQ = new URL(location).searchParams.get('q') || '';
  if(initQ){ qEl.value = initQ; }
  run();
}

//// 자동완성 ////
function initAutocomplete(){
  // 파일명/표시제목에서 자주 나오는 토큰 상위 N개 만들기(간단)
  const freq = new Map();
  for(const d of DATA){
    const base = `${d.file||''} ${d.title||''}`.toLowerCase();
    for(const w of base.split(/[^a-z0-9가-힣]+/g)){
      if(!w || w.length<2) continue;
      freq.set(w, (freq.get(w)||0)+1);
    }
  }
  const SUGG = Array.from(freq.entries()).sort((a,b)=>b[1]-a[1]).slice(0,200).map(v=>v[0]);
  let sel = -1;

  function render(list){
    if(!list.length){ acEl.style.display='none'; return; }
    acEl.innerHTML = list.map((t,i)=>`<div class="ac-item${i===sel?' active':''}" data-v="${t}">${t}</div>`).join('');
    acEl.style.display='block';
    acEl.querySelectorAll('.ac-item').forEach((el,i)=>{
      el.addEventListener('mousedown', e=>{ // 클릭 시
        qEl.value = el.dataset.v; acEl.style.display='none'; run();
      });
    });
  }
  qEl.addEventListener('input', ()=>{
    const v = qEl.value.trim().toLowerCase();
    sel=-1;
    if(!v){ acEl.style.display='none'; return; }
    const list = SUGG.filter(t=>t.includes(v)).slice(0,10);
    render(list);
  });
  qEl.addEventListener('keydown', (e)=>{
    const items = [...acEl.querySelectorAll('.ac-item')];
    if(e.key==='ArrowDown' && items.length){ sel=(sel+1)%items.length; render(items.map(i=>i.dataset?.v||i.textContent)); e.preventDefault(); }
    else if(e.key==='ArrowUp' && items.length){ sel=(sel-1+items.length)%items.length; render(items.map(i=>i.dataset?.v||i.textContent)); e.preventDefault(); }
    else if(e.key==='Enter' && items.length && sel>-1){ qEl.value = items[sel].dataset.v; acEl.style.display='none'; run(); }
    else if(e.key==='Escape'){ acEl.style.display='none'; }
  });
  document.addEventListener('click', (e)=>{ if(!acEl.contains(e.target) && e.target!==qEl) acEl.style.display='none'; });
}

//// 점수 계산 ////
function countMatches(hay, t){ const re = new RegExp(esc(t),'gi'); const m = hay.match(re); return m?m.length:0; }
function scoreDoc(d, terms){
  const file  = (d.file||'').toLowerCase();
  const title = (d.title||'').toLowerCase();
  const snip  = (d.snippet||'').toLowerCase();
  const cont  = (d.content||'').toLowerCase();

  const inFiles = file;
  const inTitlePlus = `${file} ${title}`;
  const inBody = `${snip} ${cont}`;

  const ok = terms.every(t=>{
    const q=t.toLowerCase();
    return (searchMode==='files') ? inFiles.includes(q) : (inTitlePlus.includes(q) || inBody.includes(q));
  });
  if(!ok) return -1;

  let s=0;
  for(const raw of terms){
    const q = raw.toLowerCase();
    if(searchMode==='files'){
      s += countMatches(inFiles,q)*3;
    }else{
      s += countMatches(inTitlePlus,q)*3 + countMatches(snip,q)*2 + countMatches(cont,q)*1;
    }
  }
  return s;
}

//// 필터/정렬/페이지 ////
function applyFiltersAndSort(rows, terms){
  // 탭 필터
  let r = (tab==='all') ? rows : rows.filter(d=>d.fileType===tab);
  // 정렬
  if(sortMode==='score'){
    r.sort((a,b)=> b.__score - a.__score);
  }else{
    // 최신: d.modified(ISO) 또는 d.mtime(epoch) 우선, 없으면 파일명 역순
    r.sort((a,b)=>{
      const am = a.modified || a.mtime || 0;
      const bm = b.modified || b.mtime || 0;
      if(am && bm) return (bm>am)?1:(bm<am?-1:0);
      return (b.file||'').localeCompare(a.file||'', 'ko');
    });
  }
  return r;
}

function paginate(all, page){
  return all.slice(0, page*PER_PAGE);
}

//// 렌더 ////
function highlight(text, terms){
  if(!terms.length) return text||'';
  let out=text||'';
  const sorted=[...terms].sort((a,b)=>b.length-a.length);
  for(const t of sorted){
    const re=new RegExp(esc(t),'gi');
    out=out.replace(re, m=>`<mark>${m}</mark>`);
  }
  return out;
}

function render(rows, terms, query){
  // 통계
  totalBadge.textContent = rows.length.toString();
  const byType = TYPES.map(t => [t, currentRows.filter(r=>r.fileType===t).length]);
  countsText.textContent = byType.map(([t,c])=>`${t.toUpperCase()}:${c}`).join(' · ');

  // 페이지 반영
  const pageRows = paginate(rows, page);

  // 목록
  resultsEl.innerHTML = '';
  if(!pageRows.length){
    resultsEl.innerHTML = `<li class="item">검색 결과가 없습니다.</li>`;
  }else{
    for(const d of pageRows){
      const displayTitle = d.file || d.title || '';
      const titleHtml = highlight(displayTitle, terms);

      const isXlsx = d.fileType==='xlsx';
      const href = isXlsx
        ? `./xlsx.html?src=${encodeURIComponent(d.link)}&sheet=${encodeURIComponent(d.sheet||'')}&cell=${encodeURIComponent(d.cell||'')}&q=${encodeURIComponent(query||'')}`
        : d.link + (d.link.includes('?')?'&':'?') + 'q=' + encodeURIComponent(query||'');

      // 파일제목 모드: 제목만
      let bodyHtml = '';
      if(searchMode==='all'){
        const metaExtra =
          (d.fileType==='pdf'  && d.page ) ? ` · p.${d.page}` :
          (d.fileType==='xlsx' && d.cell ) ? ` · ${d.sheet}!${d.cell}` :
          (d.fileType==='pptx' && d.slide) ? ` · slide ${d.slide}` : '';
        const raw = (d.snippet||d.content||'').replace(/\s+/g,' ').slice(0,220);
        bodyHtml = `
          <div class="meta"><span class="badge">${(d.fileType||'DOC').toUpperCase()}</span> ${d.file||''}${metaExtra}</div>
          <div class="snippet">${highlight(raw, terms)}</div>`;
      }

      const li = document.createElement('li');
      li.className = 'item';
      li.tabIndex = 0;
      li.dataset.href = href;
      li.dataset.type = d.fileType;
      li.innerHTML = `
        <div class="title"><a href="${href}" target="_blank" rel="noopener">${titleHtml}</a></div>
        ${bodyHtml}
      `;
      li.addEventListener('mouseenter', ()=> showPreview(d, query));
      li.addEventListener('focus', ()=> showPreview(d, query));
      resultsEl.appendChild(li);
    }
  }

  // 더보기 버튼
  moreBtn.style.display = (rows.length > page*PER_PAGE) ? 'inline-block' : 'none';

  // 키보드 포커스 초기화
  focusIndex = -1;
}

//// 미리보기 ////
function showPreview(d, query){
  pvMeta.textContent = `${(d.fileType||'').toUpperCase()} · ${d.file||''}`;
  if(d.fileType==='xlsx'){
    previewEl.innerHTML = `<iframe class="frame" src="./xlsx.html?src=${encodeURIComponent(d.link)}&sheet=${encodeURIComponent(d.sheet||'')}&cell=${encodeURIComponent(d.cell||'')}&q=${encodeURIComponent(query||'')}"></iframe>`;
  }else if(d.fileType==='pdf'){
    // 브라우저 기본 PDF 뷰어 사용
    const page = d.page ? `#page=${d.page}` : '';
    previewEl.innerHTML = `<iframe class="frame" src="${d.link}${page}"></iframe>`;
  }else if(d.fileType==='txt'){
    previewEl.innerHTML = `<iframe class="frame" src="${d.link}"></iframe>`;
  }else{
    // pptx/hwpx 등은 다운로드 안내
    previewEl.innerHTML = `
      <div class="muted">이 형식은 브라우저 미리보기를 지원하지 않습니다.<br/>
      <a class="btn" href="${d.link}" target="_blank" rel="noopener">원본 열기/다운로드</a></div>`;
  }
}

//// 실행 ////
function run(){
  const q = qEl.value.trim();
  const terms = termsOf(q);
  if(!terms.length){
    resultsEl.innerHTML = `<li class="item">검색어를 입력하세요.</li>`;
    totalBadge.textContent='0'; countsText.textContent='';
    previewEl.innerHTML = `<div class="muted">결과 위에 마우스를 올리거나 선택(→)하면 이곳에 미리보기가 표시됩니다.</div>`;
    return;
  }

  // 스코어
  const scored = [];
  for(const d of DATA){
    const s = scoreDoc(d, terms);
    if(s>0) scored.push({...d, __score:s});
  }
  currentRows = applyFiltersAndSort(scored, terms);
  page = 1;
  render(currentRows, terms, q);
}

//// UI 복원 & 이벤트 ////
function restoreUI(){
  // 탭
  [...tabsEl.querySelectorAll('.tab')].forEach(b=>{
    b.classList.toggle('active', b.dataset.tab===tab);
    b.addEventListener('click', ()=>{
      tab = b.dataset.tab;
      localStorage.setItem('tab', tab);
      [...tabsEl.querySelectorAll('.tab')].forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      run();
    });
  });

  // 모드
  modeFilesBtn.classList.toggle('active', searchMode==='files');
  modeAllBtn.classList.toggle('active',   searchMode==='all');
  modeFilesBtn.addEventListener('click', ()=>{ searchMode='files'; localStorage.setItem('search_mode','files'); modeFilesBtn.classList.add('active'); modeAllBtn.classList.remove('active'); run(); });
  modeAllBtn  .addEventListener('click', ()=>{ searchMode='all';   localStorage.setItem('search_mode','all');   modeAllBtn.classList.add('active');   modeFilesBtn.classList.remove('active'); run(); });

  // 정렬
  document.querySelectorAll('.sort-chips .chip').forEach(ch=>{
    ch.classList.toggle('active', ch.dataset.sort===sortMode);
    ch.addEventListener('click', ()=>{
      sortMode = ch.dataset.sort;
      localStorage.setItem('sort_mode', sortMode);
      document.querySelectorAll('.sort-chips .chip').forEach(x=>x.classList.remove('active'));
      ch.classList.add('active'); run();
    });
  });

  // 검색 버튼
  searchBtn.addEventListener('click', run);
  qEl.addEventListener('keydown', (e)=>{
    if(e.key==='Enter'){ run(); }
  });

  // 더보기
  moreBtn.addEventListener('click', ()=>{ page++; render(currentRows, termsOf(qEl.value.trim()), qEl.value.trim()); });

  // 결과 키보드 탐색
  document.addEventListener('keydown', (e)=>{
    const items = [...resultsEl.querySelectorAll('.item')];
    if(!items.length) return;
    if(e.key==='ArrowDown'){ focusIndex = Math.min(items.length-1, focusIndex+1); items[focusIndex].focus(); e.preventDefault(); }
    if(e.key==='ArrowUp'){ focusIndex = Math.max(0, focusIndex-1); items[focusIndex].focus(); e.preventDefault(); }
    if(e.key==='ArrowRight' && focusIndex>-1){
      const a = items[focusIndex].querySelector('a'); if(a){ showPreview(rowFromLi(items[focusIndex]), qEl.value.trim()); }
    }
    if(e.key==='Enter' && focusIndex>-1){
      const href = items[focusIndex].dataset.href; if(href){ window.open(href, '_blank'); }
    }
  });
}

function rowFromLi(li){
  // 간단히 링크로만 미리보기 재구성 필요할 때 사용 (여기서는 preview 시점에 row 이미 있음)
  return null;
}

//// 시작 ////
load();
