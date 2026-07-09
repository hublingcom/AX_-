/* =========================================================
   설정
   ========================================================= */
const DATA = {
  banks: 'data/지역별은행_더미데이터_전체.xlsx',
  vuln:  'data/행정동_통합비율_취약점수_최종.xlsx',
  pairs: 'data/결과_10km_쌍목록.csv',
};

// 은행 더미데이터 실제 컬럼명 (엑셀 헤더 그대로)
const COL = {
  name: '은행명', addr: '주소', road: '도로명주소', lon: '경도', lat: '위도',
  sido: '시도', sgg: '시군구(매칭)', dong: '행정동(매칭)',
  pop: '행정동 인구', elder: '고령인구비율', type: '지점유형',
  channel: '서비스채널(대표)', visitors: '일평균 이용객(대표)',
  lambda: '시간당 고객도착률 λ(대표)', svc: '평균 서비스시간(대표,분)',
  mu: '서비스율 μ(대표,명/시간)', wait: '평균 대기시간(대표,분,Sakasegawa)',
  c: '창구수 c(더미,관측보정)', rho: '가동률 ρ(창구)',
};

// 취약점수 xlsx 컬럼명
const VCOL = {
  sido:'시도', sgg:'시군구', dong:'행정동', pop:'총인구수',
  farm:'농어업인비율(시도기준)', elderN:'고령인구수', elderP:'고령인구비율',
  disN:'장애인수', disP:'장애인비율', welN:'수급권자수', welP:'수급권자비율',
  score:'취약점수(A)',
};

let state = {
  banks: [],
  vuln: [],
  pairsByKey: new Map(),   // "지점명|주소" -> [{other, dist}]
  bankByKey: new Map(),    // "지점명|주소" -> bank row (for coord lookup)
  sidoList: [],
  map: null,
  cluster: null,
  markerLayer: {},         // key -> leaflet marker (for line-drawing lookups)
  linkLines: [],
  activeMarker: null,
  tablePage: 0,
  tablePageSize: 40,
  tableFiltered: [],
};

/* =========================================================
   로딩 UI 헬퍼
   ========================================================= */
function setLoading(pct, text){
  const bar = document.getElementById('loading-bar');
  const txt = document.getElementById('loading-text');
  if (bar) bar.style.width = pct + '%';
  if (text) txt.textContent = text;
}
function hideLoading(){
  document.getElementById('loading-overlay').classList.add('hidden');
}

/* =========================================================
   데이터 로딩
   ========================================================= */
async function fetchArrayBuffer(url, onProgress){
  const res = await fetch(url);
  if (!res.ok) throw new Error('파일을 불러오지 못했습니다: ' + url);
  const total = +res.headers.get('Content-Length') || 0;
  const reader = res.body.getReader();
  let received = 0;
  const chunks = [];
  while(true){
    const {done, value} = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total && onProgress) onProgress(received/total);
  }
  const buf = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks){ buf.set(c, offset); offset += c.length; }
  return buf.buffer;
}

async function loadXlsx(url, sheetIndex, progressFrom, progressTo, label){
  const buf = await fetchArrayBuffer(url, p => {
    setLoading(progressFrom + p*(progressTo-progressFrom), label);
  });
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[sheetIndex]];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

function loadCsv(url, progressFrom, progressTo, label){
  return new Promise((resolve, reject) => {
    setLoading(progressFrom, label);
    Papa.parse(url, {
      download: true,
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => {
        setLoading(progressTo, label);
        resolve(results.data);
      },
      error: reject,
    });
  });
}

async function loadAll(){
  try{
    state.banks = await loadXlsx(DATA.banks, 0, 5, 45, '은행 위치 데이터 불러오는 중…');
    state.vuln  = await loadXlsx(DATA.vuln,  0, 45, 60, '행정동 취약점수 데이터 불러오는 중…');
    const pairsRaw = await loadCsv(DATA.pairs, 60, 90, '10km 인접 지점 데이터 불러오는 중…');

    setLoading(92, '색인 생성 중…');
    indexBanks();
    indexPairs(pairsRaw);

    setLoading(96, '지도 그리는 중…');
    initMap();
    initFilters();
    renderMarkers();

    setLoading(98, '취약점수 테이블 준비 중…');
    initTable();

    setLoading(100, '완료');
    setTimeout(hideLoading, 300);
  }catch(err){
    console.error(err);
    setLoading(100, '데이터 로드 실패: ' + err.message + ' (data/ 경로와 파일명을 확인하세요)');
  }
}

function keyOf(name, addr){ return (name||'').trim() + '|' + (addr||'').trim(); }

function indexBanks(){
  state.banks.forEach(b => {
    b._lat = parseFloat(b[COL.lat]);
    b._lon = parseFloat(b[COL.lon]);
    b._wait = parseFloat(b[COL.wait]);
    if (isNaN(b._wait)) b._wait = null;
    state.bankByKey.set(keyOf(b[COL.name], b[COL.addr]), b);
  });
  state.sidoList = [...new Set(state.banks.map(b => b[COL.sido]).filter(Boolean))].sort();
}

function indexPairs(rows){
  rows.forEach(r => {
    if (!r['지점A'] || !r['지점B']) return;
    const kA = keyOf(r['지점A'], r['주소A']);
    const kB = keyOf(r['지점B'], r['주소B']);
    if (!state.pairsByKey.has(kA)) state.pairsByKey.set(kA, []);
    if (!state.pairsByKey.has(kB)) state.pairsByKey.set(kB, []);
    state.pairsByKey.get(kA).push({ key:kB, name:r['지점B'], addr:r['주소B'], dist:r['거리km'], region:r['지역'], company:r['회사'], type:r['유형'] });
    state.pairsByKey.get(kB).push({ key:kA, name:r['지점A'], addr:r['주소A'], dist:r['거리km'], region:r['지역'], company:r['회사'], type:r['유형'] });
  });
  state.pairsRaw = rows;
}

/* =========================================================
   지도
   ========================================================= */
function waitColor(w){
  if (w == null || isNaN(w)) return '#93A1B0';
  if (w < 3) return '#2E7D5B';
  if (w < 6) return '#8CB84B';
  if (w < 10) return '#E8B23D';
  if (w < 15) return '#DE7A3A';
  return '#C6432E';
}
function typeColor(t){
  return t === 'ATM전용' ? '#93A1B0' : '#1D4E89';
}

function initMap(){
  state.map = L.map('map', { zoomControl:true, minZoom:6, maxZoom:18 })
    .setView([36.5, 127.8], 7);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    subdomains: 'abcd', maxZoom: 19,
  }).addTo(state.map);

  state.cluster = L.markerClusterGroup({
    chunkedLoading: true,
    maxClusterRadius: 50,
    iconCreateFunction: (cluster) => {
      const n = cluster.getChildCount();
      const size = n < 50 ? 34 : n < 300 ? 42 : 52;
      return L.divIcon({
        html: `<div class="marker-cluster-custom" style="width:${size}px;height:${size}px;">${n}</div>`,
        className: '', iconSize: [size, size],
      });
    },
  });
  state.map.addLayer(state.cluster);

  state.map.on('click', (e) => {
    if (e.originalEvent.target.id === 'map') closeDetail();
  });
}

function currentFilters(){
  return {
    sido: document.getElementById('f-sido').value,
    type: document.getElementById('f-type').value,
    colorBy: document.getElementById('f-colorby').value,
  };
}

function renderMarkers(){
  const { sido, type, colorBy } = currentFilters();
  state.cluster.clearLayers();
  state.markerLayer = {};

  let shown = 0, waitSum = 0, waitN = 0, atmN = 0;

  state.banks.forEach(b => {
    if (sido && b[COL.sido] !== sido) return;
    if (type && b[COL.type] !== type) return;
    if (isNaN(b._lat) || isNaN(b._lon)) return;

    shown++;
    if (b._wait != null){ waitSum += b._wait; waitN++; }
    if (b[COL.type] === 'ATM전용') atmN++;

    const color = colorBy === 'type' ? typeColor(b[COL.type]) : waitColor(b._wait);
    const marker = L.circleMarker([b._lat, b._lon], {
      radius: 5, weight: 1, color: '#fff', fillColor: color, fillOpacity: .9,
    });
    marker.on('click', () => openDetail(b));
    state.cluster.addLayer(marker);
    state.markerLayer[keyOf(b[COL.name], b[COL.addr])] = marker;
  });

  document.getElementById('stat-count').textContent = shown.toLocaleString();
  document.getElementById('stat-wait').textContent = waitN ? (waitSum/waitN).toFixed(1) : '–';
  document.getElementById('stat-atm').textContent = shown ? Math.round(atmN/shown*100) + '%' : '–';

  const pairCount = sido ? state.pairsRaw.filter(r => r['지역'] === sidoShort(sido)).length : state.pairsRaw.length;
  document.getElementById('stat-pairs').textContent = pairCount.toLocaleString();
}

// 취약점수/은행 파일은 "서울특별시" 식 전체명, pairs 파일은 "서울" 식 축약명 → 매핑
const SIDO_SHORT = {
  '서울특별시':'서울','부산광역시':'부산','대구광역시':'대구','인천광역시':'인천','광주광역시':'광주',
  '대전광역시':'대전','울산광역시':'울산','세종특별자치시':'세종','경기도':'경기','강원특별자치도':'강원',
  '충청북도':'충북','충청남도':'충남','전북특별자치도':'전북','전라남도':'전남','경상북도':'경북',
  '경상남도':'경남','제주특별자치도':'제주',
};
function sidoShort(full){ return SIDO_SHORT[full] || full; }

/* =========================================================
   상세 패널
   ========================================================= */
function openDetail(b){
  clearLines();
  const panel = document.getElementById('detail-panel');
  const c = document.getElementById('detail-content');

  const wait = b._wait != null ? b._wait.toFixed(2) : '–';
  const lam = b[COL.lambda] !== '' ? Number(b[COL.lambda]).toFixed(2) : '–';
  const svc = b[COL.svc] !== '' ? Number(b[COL.svc]).toFixed(2) : '–';
  const visitors = b[COL.visitors] !== '' ? Math.round(b[COL.visitors]) : '–';

  const key = keyOf(b[COL.name], b[COL.addr]);
  const nearby = (state.pairsByKey.get(key) || []).slice().sort((a,z) => a.dist - z.dist).slice(0, 12);

  c.innerHTML = `
    <p class="detail-kicker">${b[COL.type] || ''}</p>
    <h3 class="detail-title">${escapeHtml(b[COL.name])}</h3>
    <p class="detail-sub">${escapeHtml(b[COL.addr] || '')}</p>
    <div class="detail-metrics">
      <div class="metric"><b>${wait}분</b><span>평균 대기시간</span></div>
      <div class="metric"><b>${lam}</b><span>시간당 도착률 λ</span></div>
      <div class="metric"><b>${svc}분</b><span>평균 서비스시간</span></div>
      <div class="metric"><b>${visitors}명</b><span>일평균 이용객</span></div>
      <div class="metric"><b>${b[COL.dong] || '–'}</b><span>행정동</span></div>
      <div class="metric"><b>${b[COL.elder] !== '' ? (Number(b[COL.elder])*100).toFixed(1)+'%' : '–'}</b><span>행정동 고령비율</span></div>
    </div>
    <p class="detail-section-title">10km 이내 동일회사 지점 (${nearby.length})</p>
    <div id="nearby-list">
      ${nearby.length ? nearby.map(n => `
        <div class="nearby-item" data-key="${encodeURIComponent(n.key)}">
          <span>${escapeHtml(n.name)}</span>
          <span class="nearby-dist">${n.dist.toFixed(2)}km</span>
        </div>`).join('') : '<p class="nearby-empty">10km 이내 동일회사 지점이 없습니다.</p>'}
    </div>
  `;

  panel.classList.add('is-open');
  state.activeMarker = b;

  c.querySelectorAll('.nearby-item').forEach(el => {
    el.addEventListener('click', () => {
      const k = decodeURIComponent(el.dataset.key);
      const targetBank = state.bankByKey.get(k);
      if (targetBank) {
        state.map.panTo([targetBank._lat, targetBank._lon]);
        openDetail(targetBank);
      }
    });
  });

  if (document.getElementById('f-showpairs').checked) drawLines(b, nearby);
}

function closeDetail(){
  document.getElementById('detail-panel').classList.remove('is-open');
  clearLines();
  state.activeMarker = null;
}

function drawLines(origin, nearby){
  nearby.forEach(n => {
    const target = state.bankByKey.get(n.key);
    if (!target || isNaN(target._lat)) return;
    const line = L.polyline(
      [[origin._lat, origin._lon], [target._lat, target._lon]],
      { color: '#E8A33D', weight: 1.6, opacity: .75, dashArray: '4,5' }
    ).addTo(state.map);
    state.linkLines.push(line);
  });
}
function clearLines(){
  state.linkLines.forEach(l => state.map.removeLayer(l));
  state.linkLines = [];
}

function escapeHtml(s){
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* =========================================================
   필터 초기화
   ========================================================= */
function initFilters(){
  const sidoSel = document.getElementById('f-sido');
  state.sidoList.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s; opt.textContent = s;
    sidoSel.appendChild(opt);
  });

  ['f-sido','f-type','f-colorby'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => { closeDetail(); renderMarkers(); });
  });
  document.getElementById('detail-close').addEventListener('click', closeDetail);

  // 테이블 시도 필터도 같이 채움
  const tSel = document.getElementById('t-sido');
  [...new Set(state.vuln.map(v => v[VCOL.sido]).filter(Boolean))].sort().forEach(s => {
    const opt = document.createElement('option');
    opt.value = s; opt.textContent = s;
    tSel.appendChild(opt);
  });
}

/* =========================================================
   탭 전환
   ========================================================= */
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    const tab = btn.dataset.tab;
    document.getElementById('view-map').hidden = tab !== 'map';
    document.getElementById('view-table').hidden = tab !== 'table';
    if (tab === 'map' && state.map) setTimeout(() => state.map.invalidateSize(), 50);
  });
});

/* =========================================================
   취약점수 테이블
   ========================================================= */
function scoreColor(score){
  if (score == null || isNaN(score)) return { bg:'#EFF3F8', fg:'#5B6B7C' };
  if (score < 5)  return { bg:'#E6F3EC', fg:'#2E7D5B' };
  if (score < 10) return { bg:'#FBF3DE', fg:'#9A7318' };
  if (score < 15) return { bg:'#FCE9DA', fg:'#B85A20' };
  return { bg:'#FAE1DC', fg:'#B23423' };
}

function initTable(){
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

/* =========================================================
   시작
   ========================================================= */
loadAll();
