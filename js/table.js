let state = {
  vuln: [],
  tablePage: 0,
  tablePageSize: 40,
  tableFiltered: [],
};

async function loadAll(){
  try{
    state.vuln = await loadXlsx(DATA_PATHS.vuln, 0, 5, 90, '행정동 취약점수 데이터 불러오는 중…');
    setLoading(95, '테이블 준비 중…');
    initTable();
    setLoading(100, '완료');
    setTimeout(hideLoading, 250);
  }catch(err){
    console.error(err);
    showLoadError(err.message);
  }
}

function scoreColor(score){
  if (score == null || isNaN(score)) return { bg:'#EFF3F8', fg:'#5B6B7C' };
  if (score < 5)  return { bg:'#E6F3EC', fg:'#2E7D5B' };
  if (score < 10) return { bg:'#FBF3DE', fg:'#9A7318' };
  if (score < 15) return { bg:'#FCE9DA', fg:'#B85A20' };
  return { bg:'#FAE1DC', fg:'#B23423' };
}

function initTable(){
  const tSel = document.getElementById('t-sido');
  [...new Set(state.vuln.map(v => v[VCOL.sido]).filter(Boolean))].sort().forEach(s => {
    const opt = document.createElement('option');
    opt.value = s; opt.textContent = s;
    tSel.appendChild(opt);
  });

  applyTableFilter();
  document.getElementById('t-search').addEventListener('input', () => { state.tablePage = 0; applyTableFilter(); });
  document.getElementById('t-sido').addEventListener('change', () => { state.tablePage = 0; applyTableFilter(); });
  document.getElementById('t-sort').addEventListener('change', () => { state.tablePage = 0; applyTableFilter(); });
  document.getElementById('p-prev').addEventListener('click', () => { state.tablePage--; renderTablePage(); });
  document.getElementById('p-next').addEventListener('click', () => { state.tablePage++; renderTablePage(); });
}

function applyTableFilter(){
  const q = document.getElementById('t-search').value.trim().toLowerCase();
  const sido = document.getElementById('t-sido').value;
  const sortKey = document.getElementById('t-sort').value;

  let rows = state.vuln.filter(v => {
    if (sido && v[VCOL.sido] !== sido) return false;
    if (!q) return true;
    const hay = `${v[VCOL.sido]} ${v[VCOL.sgg]} ${v[VCOL.dong]}`.toLowerCase();
    return hay.includes(q);
  });

  const sorters = {
    'score-desc': (a,z) => (z[VCOL.score]||0) - (a[VCOL.score]||0),
    'score-asc':  (a,z) => (a[VCOL.score]||0) - (z[VCOL.score]||0),
    'pop-desc':   (a,z) => (z[VCOL.pop]||0) - (a[VCOL.pop]||0),
    'elder-desc': (a,z) => (z[VCOL.elderP]||0) - (a[VCOL.elderP]||0),
  };
  rows = rows.sort(sorters[sortKey] || sorters['score-desc']);

  state.tableFiltered = rows;
  document.getElementById('table-count').textContent = rows.length.toLocaleString() + '개 행정동';
  renderTablePage();
}

function renderTablePage(){
  const rows = state.tableFiltered;
  const totalPages = Math.max(1, Math.ceil(rows.length / state.tablePageSize));
  state.tablePage = Math.min(Math.max(0, state.tablePage), totalPages-1);

  const start = state.tablePage * state.tablePageSize;
  const pageRows = rows.slice(start, start + state.tablePageSize);

  const tbody = document.getElementById('vuln-tbody');
  tbody.innerHTML = pageRows.map(v => {
    const score = Number(v[VCOL.score]);
    const sc = scoreColor(score);
    return `<tr>
      <td>${escapeHtml(v[VCOL.sido])}</td>
      <td>${escapeHtml(v[VCOL.sgg])}</td>
      <td>${escapeHtml(v[VCOL.dong])}</td>
      <td class="num">${Number(v[VCOL.pop]||0).toLocaleString()}</td>
      <td class="num">${v[VCOL.elderP]!=='' ? (Number(v[VCOL.elderP])*100).toFixed(1)+'%' : '–'}</td>
      <td class="num">${v[VCOL.disP]!=='' ? (Number(v[VCOL.disP])*100).toFixed(1)+'%' : '–'}</td>
      <td class="num">${v[VCOL.welP]!=='' ? (Number(v[VCOL.welP])*100).toFixed(1)+'%' : '–'}</td>
      <td class="num">${v[VCOL.farm]!=='' ? (Number(v[VCOL.farm])*100).toFixed(2)+'%' : '–'}</td>
      <td class="num"><span class="score-pill" style="background:${sc.bg};color:${sc.fg}">${isNaN(score)?'–':score.toFixed(2)}</span></td>
    </tr>`;
  }).join('');

  document.getElementById('p-info').textContent = `${state.tablePage+1} / ${totalPages} 페이지`;
  document.getElementById('p-prev').disabled = state.tablePage === 0;
  document.getElementById('p-next').disabled = state.tablePage >= totalPages-1;
}

loadAll();
