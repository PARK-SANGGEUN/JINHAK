// 간단 검색: index.json을 불러와서 제목/본문에서 필터링
const q = document.getElementById('q');          // index.html의 검색 입력창 id="q"
const list = document.getElementById('results'); // 결과 표시 <ul>

let DATA = [];

function highlight(text, query){
  if(!query) return text;
  const esc = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(${esc})`, 'gi'), '<mark>$1</mark>');
}

function render(items, query){
  list.innerHTML = '';
  if(items.length === 0){
    const li = document.createElement('li');
    li.className = 'card';
    li.textContent = '검색 결과가 없습니다.';
    list.appendChild(li);
    return;
  }
  for(const it of items){
    const li = document.createElement('li');
    li.className = 'card';
    li.innerHTML = `
      <div class="meta"><span class="badge">${it.fileType.toUpperCase()}</span> ${it.file}</div>
      <div class="title"><a href="${it.link}" target="_blank" rel="noopener">${it.title}</a></div>
      <div class="snippet">${highlight(it.snippet, query)}</div>
    `;
    list.appendChild(li);
  }
}

async function loadIndex(){
  try{
    const res = await fetch('index.json', { cache: 'no-store' }); // /JINHAK/index.json
    DATA = await res.json();
  }catch(e){
    console.error('index.json 로드 실패', e);
    DATA = [];
  }
}

function doSearch(query){
  if(!query){ render([], ''); return; }
  const ql = query.toLowerCase();
  const hit = DATA.filter(d =>
    (d.title||'').toLowerCase().includes(ql) ||
    (d.snippet||'').toLowerCase().includes(ql) ||
    (d.content||'').toLowerCase().includes(ql)
  );
  render(hit.slice(0, 200), query);
}

q.addEventListener('input', (e)=> doSearch(e.target.value.trim()));

loadIndex().then(()=>{
  // 주소에 ?q= 키워드로 진입해도 동작
  const init = new URL(location).searchParams.get('q') || '';
  if(init){ q.value = init; doSearch(init); }
});
