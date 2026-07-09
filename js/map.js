/* =========================================================
   상태
   ========================================================= */
let state = {
  banks: [],
  pairsRaw: [],
  pairsByKey: new Map(),
  bankByKey: new Map(),
  sidoList: [],
  map: null,
  cluster: null,
  linkLines: [],
};

/* =========================================================
   데이터 로딩
   ========================================================= */
async function loadAll(){
  try{
    state.banks = await loadXlsx(DATA_PATHS.banks, 0, 10, 60, '은행 위치 데이터 불러오는 중…');
    const pairsRaw = await loadCsv(DATA_PATHS.pairs, 60, 92, '10km 인접 지점 데이터 불러오는 중…');

    setLoading(94, '색인 생성 중…');
    indexBanks();
    indexPairs(pairsRaw);

    setLoading(97, '지도 그리는 중…');
    initMap();
    initFilters();
    renderMarkers();

    setLoading(100, '완료');
    setTimeout(hideLoading, 300);
  }catch(err){
    console.error(err);
    showLoadError(err.message);
  }
}

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
    state.pairsByKey.get(kA).push({ key:kB, name:r['지점B'], addr:r['주소B'], dist:r['거리km'], region:r['지역'] });
    state.pairsByKey.get(kB).push({ key:kA, name:r['지점A'], addr:r['주소A'], dist:r['거리km'], region:r['지역'] });
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
function typeColor(t){ return t === 'ATM전용' ? '#93A1B0' : '#1D4E89'; }

function initMap(){
  state.map = L.map('map', { zoomControl:true, minZoom:6, maxZoom:18 }).setView([36.5, 127.8], 7);

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
  });

  document.getElementById('stat-count').textContent = shown.toLocaleString();
  document.getElementById('stat-wait').textContent = waitN ? (waitSum/waitN).toFixed(1) : '–';
  document.getElementById('stat-atm').textContent = shown ? Math.round(atmN/shown*100) + '%' : '–';

  const pairCount = sido ? state.pairsRaw.filter(r => r['지역'] === sidoShort(sido)).length : state.pairsRaw.length;
  document.getElementById('stat-pairs').textContent = pairCount.toLocaleString();
}

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
    <p class="detail-kicker">${escapeHtml(b[COL.type] || '')}</p>
    <h3 class="detail-title">${escapeHtml(b[COL.name])}</h3>
    <p class="detail-sub">${escapeHtml(b[COL.addr] || '')}</p>
    <div class="detail-metrics">
      <div class="metric"><b>${wait}분</b><span>평균 대기시간</span></div>
      <div class="metric"><b>${lam}</b><span>시간당 도착률 λ</span></div>
      <div class="metric"><b>${svc}분</b><span>평균 서비스시간</span></div>
      <div class="metric"><b>${visitors}명</b><span>일평균 이용객</span></div>
      <div class="metric"><b>${escapeHtml(b[COL.dong] || '–')}</b><span>행정동</span></div>
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
}

loadAll();
