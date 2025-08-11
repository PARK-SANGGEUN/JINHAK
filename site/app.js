// === Google/Naver-like client search ===
// - 여러 키워드(공백/쉼표 구분) 동시 매칭
// - 띄어쓰기/기호 무시(문서 내 '강 원 대'도 '강원대'로 매칭)
// - 결과 스니펫: 매칭 주변 90자만 '…'로 잘라 보여줌
// - 모든 키워드 하이라이트

const qEl = document.getElementById('q');
const listEl = document.getElementById('results');

let DOCS = [];

// 유틸: 정규식 메타 문자 이스케이프
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 유틸: "강원대" -> /강\s*원\s*대/ (띄어쓰기 무시)
const loosePattern = (term) => {
  const chars = term.split('').map(esc);
  return new RegExp(chars.join('\\s*'), 'i'); // i: 대소문자 무시
};

// 여러 키워드 생성
function parseQuery(q){
  return q
    .split(/[,\s]+/g)        // 공백/쉼표로 분리
    .map(s => s.trim())
    .filter(Boolean);
}

// 스니펫 만들기: 첫 매치 주변으로 앞뒤 context 글자 자르기
function makeSnippet(text, terms, width = 90){
  if(!text) return '';
  const t = text.replace(/\s+/g, ' '); // 보기 좋게
  // 첫 매치 위치 찾기(띄어쓰기 무시 정규식 사용)
  let mIndex = -1, mLen = 0;
  for(const term of terms){
    const re = loosePattern(term);
    const m = re.exec(t);
    if(m){
      mIndex = m.index;
      mLen = m[0].length;
      break;
    }
  }
  if(mIndex < 0){ // 못 찾으면 앞부분
    return (t.length > width ? t.slice(0, width) + '…' : t);
  }
  const start = Math.max(0, mIndex - Math.floor(width/2));
  const end   = Math.min(t.length, mIndex + mLen + Math.floor(width/2));
  let out = t.slice(start, end);
  if(start > 0) out = '…' + out;
  if(end < t.length) out = out + '…';
  return out;
}

// 하이라이트: 모든 키워드를 띄어쓰기 무시 정규식으로 마킹
function highlight(htmlText, terms){
  if(!terms.length) return htmlText;
  let out = htmlText;
  // 겹치는 마크 방지를 위해 길이 긴 키워드부터
  const sorted = [...terms].sort((a,b)=>b.length-a.length);
  for(const term of sorted){
    const re = new RegExp(loosePattern(term).source, 'gi');
    out = out.replace(re, (m)=>`<mark>${m}</mark>`);
  }
  return out;
}

// 렌더
function render(rows, terms){
  listEl.innerHTML = '';
  if(!rows.length){
    const li = document.createElement('li');
    li.className = 'card';
    li.textContent = '검색 결과가 없습니다.';
    listEl.appendChild(li);
    return;
  }
  for(const d of rows){
    // 스니펫은 원문(content)에서 생성 후 하이라이트
    const rawSnippet = makeSnippet((d.snippet || d.content || ''), terms, 120);
    const marked = highlight(rawSnippet, terms);
    const li = document.createElement('li');
    li.className = 'card';
    li.innerHTML = `
      <div class="meta"><span class="badge">${(d.fileType||'doc').toUpperCase()}</span> ${d.file||''}</div>
      <div class="title"><a href="${d.link}" target="_blank" rel="noopener">${d.title}</a></div>
      <div class="snippet">${marked}</div>
    `;
    listEl.appendChild(li);
  }
}

// 인덱스 로드
async function loadIndex(){
  try{
    const r = await fetch('index.json', { cache: 'no-store' });
    DOCS = await r.json();
  }catch(e){
    console.error('index.json load failed', e);
    DOCS = [];
  }
}

// 검색
function doSearch(query){
  const terms = parseQuery(query);
  if(!terms.length) { render([], terms); return; }

  // 1차: FlexSearch가 있으면 그걸로(빠름)
  // 2차: 단순 필터(띄어쓰기 무시 정규식)로 보강
  let hit = [];

  // FlexSearch Document 인덱스 생성(최초 1회)
  if(!window.__IDX__){
    window.__IDX__ = new FlexSearch.Document({
      document: {
        id: 'id',
        index: ['title','snippet','content','file'],
        store: ['id']
      },
      tokenize: 'forward',
      cache: true
    });
    for(const d of DOCS) window.__IDX__.add(d);
  }

  // 모든 키워드를 OR로 검색 후 합치기
  const idSet = new Set();
  for(const t of terms){
    const groups = window.__IDX__.search(t, { enrich: true });
    for(const g of groups){
      for(const id of g.result) idSet.add(id);
    }
  }
  let viaIndex = DOCS.filter(d => idSet.has(d.id));

  // 보강: 띄어쓰기 무시 정규식으로 본문/제목 매칭
  const regs = terms.map(loosePattern);
  const viaScan = DOCS.filter(d => regs.some(re =>
      re.test(d.title||'') || re.test(d.snippet||'') || re.test(d.content||'')
  ));

  // 합치고 상위 200개만
  const map = new Map();
  [...viaIndex, ...viaScan].forEach(d => map.set(d.id, d));
  hit = Array.from(map.values()).slice(0, 200);

  render(hit, terms);
}

// 이벤트
qEl.addEventListener('input', e => doSearch(e.target.value.trim()));

// 초기화
loadIndex().then(()=>{
  const init = new URL(location).searchParams.get('q') || '';
  if(init){ qEl.value = init; doSearch(init); }
});
