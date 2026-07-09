let state = {
  vuln: [],
  isolatedDongSet: new Set(),   // 영향도 "높음" (해당 행정동의 모든 지점이 10km 이내 대체지점 없음)
  hasBranchDongSet: new Set(),  // 은행 지점이 1개 이상 있는 행정동
  tablePage: 0,
  tablePageSize: 40,
  tableFiltered: [],
};

async function loadAll(){
  try{
    state.vuln = await loadXlsx(DATA_PATHS.vuln, 0, 5, 45, '행정동 취약점수 데이터 불러오는 중…');
    const banks = await loadXlsx(DATA_PATHS.banks, 0, 45, 75, '은행 위치 데이터 불러오는 중…');
    const pairs = await loadCsv(DATA_PATHS.pairs, 75, 92, '10km 인접 지점 데이터 불러오는 중…');

    setLoading(95, '사전영향평가(10km 반경) 계산 중…');
    computeImpact(banks, pairs);

    initTable();
    setLoading(100, '완료');
    setTimeout(hideLoading, 250);
  }catch(err){
    console.error(err);
    showLoadError(err.message);
  }
}

/* =========================================================
   1차 필터: 10km 이내 동일회사 대체지점 유무로 영향도 "높음" 판정
   - 그 행정동에 있는 은행 지점이 모두(=전부) 10km 이내 대체지점이 없으면 "높음"
   - 대체지점이 있거나(반경 내 은행 존재) 애초에 지점이 없는 행정동은 2차 판정(취약점수)으로 넘어감
   ========================================================= */
function computeImpact(banks, pairs){
  const hasPairKey = new Set();
  pairs.forEach(r => {
    if (!r['지점A'] || !r['지점B']) return;
    hasPairKey.add(keyOf(r['지점A'], r['주소A']));
    hasPairKey.add(keyOf(r['지점B'], r['주소B']));
  });

  const dongBranchTotal = new Map();   // "시도|시군구|행정동" -> 지점 수
  const dongBranchIsolated = new Map(); // -> 대체지점 없는(고립) 지점 수

  banks.forEach(b => {
    const sido = b[COL.sido], sgg = b[COL.sgg], dong = b[COL.dong];
    if (!sido || !sgg || !dong) return;
    const dongKey = `${sido}|${sgg}|${dong}`;
    state.hasBranchDongSet.add(dongKey);
    dongBranchTotal.set(dongKey, (dongBranchTotal.get(dongKey)||0) + 1);

    const bk = keyOf(b[COL.name], b[COL.addr]);
    if (!hasPairKey.has(bk)){
      dongBranchIsolated.set(dongKey, (dongBranchIsolated.get(dongKey)||0) + 1);
    }
  });

  dongBranchTotal.forEach((total, dongKey) => {
    const isolated = dongBranchIsolated.get(dongKey) || 0;
    if (isolated === total) state.isolatedDongSet.add(dongKey); // 모든 지점이 10km 이내 대체지점 없음
  });
}

function impactLevel(v){
  const dongKey = `${v[VCOL.sido]}|${v[VCOL.sgg]}|${v[VCOL.dong]}`;
  if (state.isolatedDongSet.has(dongKey)) return '높음';
  const score = Number(v[VCOL.score]);
  if (isNaN(score)) return '보통';
  return score < 10 ? '낮음' : '보통';
}

function impactColor(level){
  if (level === '높음') return { bg:'#FAE1DC', fg:'#B23423' };
  if (level === '보통') return { bg:'#FBF3DE', fg:'#9A7318' };
  return { bg:'#E6F3EC', fg:'#2E7D5B' };
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
  document.getElementById('t-impact').addEventListener('change', () => { state.tablePage = 0; applyTableFilter(); });
  document.getElementById('t-sort').addEventListener('change', () => { state.tablePage = 0; applyTableFilter(); });
  document.getElementById('p-prev').addEventListener('click', () => { state.tablePage--; renderTablePage(); });
  document.getElementById('p-next').addEventListener('click', () => { state.tablePage++; renderTablePage(); });
}

function applyTableFilter(){
  const q = document.getElementById('t-search').value.trim().toLowerCase();
  const sido = document.getElementById('t-sido').value;
  const impact = document.getElementById('t-impact').value;
  const sortKey = document.getElementById('t-sort').value;

  let rows = state.vuln.filter(v => {
    if (sido && v[VCOL.sido] !== sido) return false;
    if (impact && impactLevel(v) !== impact) return false;
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
    const level = impactLevel(v);
    const ic = impactColor(level);
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
      <td><span class="score-pill" style="background:${ic.bg};color:${ic.fg}">${level}</span></td>
    </tr>`;
  }).join('');

  document.getElementById('p-info').textContent = `${state.tablePage+1} / ${totalPages} 페이지`;
  document.getElementById('p-prev').disabled = state.tablePage === 0;
  document.getElementById('p-next').disabled = state.tablePage >= totalPages-1;
}

loadAll();
