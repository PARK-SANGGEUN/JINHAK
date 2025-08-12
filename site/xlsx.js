(function(){
  const params = new URL(location).searchParams;
  const src   = params.get('src');
  const sheet = params.get('sheet') || '';
  const cell  = params.get('cell')  || '';
  const q     = params.get('q')     || '';

  const esc = s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const terms = (q||'').split(/[,\s]+/g).map(s=>s.trim()).filter(Boolean);
  const hasTerm = (v)=> terms.length && String(v??'').toLowerCase().includes(terms[0].toLowerCase());

  function colToIdx(col){ let n=0; for(let i=0;i<col.length;i++) n=n*26+(col.charCodeAt(i)-64); return n-1; }
  function splitAddr(addr){ const m=String(addr||'').match(/^([A-Z]+)(\d+)$/i); return m?{c:colToIdx(m[1].toUpperCase()), r:parseInt(m[2],10)-1}:null; }
  function windowAround(t, sR,eR,sC,eC){ return { r0:Math.max(sR,t.r-15), r1:Math.min(eR,t.r+15), c0:Math.max(sC,t.c-10), c1:Math.min(eC,t.c+10) }; }

  if(!src){ document.getElementById('grid').innerHTML='<div class="muted" style="padding:8px">파일 경로가 없습니다.</div>'; return; }

  fetch(src).then(r=>r.arrayBuffer()).then(ab=>{
    const wb = XLSX.read(ab,{type:'array'});
    let wsName = sheet || wb.SheetNames[0];
    if(!wb.SheetNames.includes(wsName)) wsName = wb.SheetNames[0];
    const ws = wb.Sheets[wsName];
    const range = XLSX.utils.decode_range(ws['!ref']||'A1:A1');

    let win = { r0:range.s.r, r1:Math.min(range.s.r+40,range.e.r), c0:range.s.c, c1:Math.min(range.s.c+20,range.e.c) };
    let target = null;
    if(cell){ const a=splitAddr(cell); if(a){ target=a; win = windowAround(a,range.s.r,range.e.r,range.s.c,range.e.c); } }

    const grid = document.getElementById('grid');
    const table = document.createElement('table');

    const thead=document.createElement('thead'); const trh=document.createElement('tr');
    const blank=document.createElement('th'); blank.className='rowhead'; trh.appendChild(blank);
    for(let c=win.c0;c<=win.c1;c++){ const th=document.createElement('th'); th.textContent=XLSX.utils.encode_col(c); trh.appendChild(th); }
    thead.appendChild(trh); table.appendChild(thead);

    const tbody=document.createElement('tbody');
    for(let r=win.r0;r<=win.r1;r++){
      const tr=document.createElement('tr');
      const rh=document.createElement('td'); rh.className='rowhead'; rh.textContent=(r+1); tr.appendChild(rh);
      for(let c=win.c0;c<=win.c1;c++){
        const td=document.createElement('td');
        const addr=XLSX.utils.encode_cell({r,c}); const cellObj=ws[addr];
        const v=(cellObj && (cellObj.w ?? cellObj.v)) ?? '';
        td.textContent=v;
        if(target && r===target.r && c===target.c) td.classList.add('target');
        else if(hasTerm(v)) td.classList.add('hit');
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    grid.innerHTML=''; grid.appendChild(table);

    if(target){
      const rIndex=target.r-win.r0; const cIndex=target.c-win.c0+1;
      const t = grid.querySelector(`tbody tr:nth-child(${rIndex+1}) td:nth-child(${cIndex+1})`);
      if(t) t.scrollIntoView({block:'center', inline:'center'});
    }
  }).catch(err=>{
    document.getElementById('grid').innerHTML = `<div class="muted" style="padding:8px">오류: ${String(err)}</div>`;
  });
})();
