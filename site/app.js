// 최소동작 버전: index.json을 불러와 단순 부분일치(공백 무시)로 필터링
const q = document.getElementById('q');
const list = document.getElementById('results');

let DATA = [];

function render(rows, query){
  list.innerHTML = '';
  if (!rows.length){
    const li = document.createElement('li');
    li.className = 'card';
    li.textContent = '검색 결과가 없습니다.';
    list.appendChild(li);
    return;
  }
  for (const d of rows){
    const li = document.createElement('li');
    li.className = 'card';
    const snippet = (d.snippet || d.content || '').slice(0, 140);
    li.innerHTML = `
      <div class="meta"><span class="badge">${(d.fileType||'DOC').toUpperCase()}</span> ${d.file||''}</div>
      <div class="title"><a href="${d.link}" target="_blank" rel="noopener">${d.title}</a></div>
      <div class="snippet">${snippet}...</div>
    `;
    list.appendChild(li);
  }
}

function normalize(s){
  return (s || '').toLowerCase().replace(/\s+/g, ''); // 공백 제거
}

function search(query){
  const nq = normalize(query);
  if (!nq){ render([], ''); return; }
  const hits = DATA.filter(d => {
    const hay = normalize(`${d.title} ${d.snippet} ${d.content}`);
    return hay.includes(nq);
  });
  render(hits.slice(0, 200), query);
}

async function boot(){
  try{
    const res = await fetch('index.json', { cache: 'no-store' });
    DATA = await res.json();
  }catch(e){
    console.error('index.json 로드 실패', e);
    DATA = [];
  }
  const init = new URL(location).searchParams.get('q') || '';
  if (init){ q.value = init; search(init); }
}

q.addEventListener('input', e => search(e.target.value));
boot();
