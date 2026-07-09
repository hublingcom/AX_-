let state = {
  banks: [],
  sidoMap: new Map(),          // 시도 -> Set(시군구)
  sggMap: new Map(),           // "시도|시군구" -> Set(행정동)
  dongMeta: new Map(),         // "시도|시군구|행정동" -> { pop, elder }
  dongBranches: new Map(),     // "시도|시군구|행정동" -> bank rows (그 동에 실제 있는 지점들, μ 추정/비용산정용)
};

const CA2 = 1.0;
const CS2 = 0.671;             // 현장관찰 실측 기반, 프로젝트 전체와 동일 상수
const BASE_RATE = 0.006837;    // 현장관찰 캘리브레이션 기본이용률
const ELDER_BIAS = 2.371;      // 현장관찰 캘리브레이션 고령편향
const FALLBACK_MU_COUNTER = 7.5;
const FALLBACK_MU_ATM = 40;

async function loadAll(){
  try{
    state.banks = await loadXlsx(DATA_PATHS.banks, 0, 10, 90, '은행 데이터 불러오는 중…');
    setLoading(94, '지역 색인 생성 중…');
    indexData();
    initSelectors();
    setLoading(100, '완료');
    setTimeout(hideLoading, 250);
  }catch(err){
    console.error(err);
    showLoadError(err.message);
  }
}

function indexData(){
  state.banks.forEach(b => {
    const sido = b[COL.sido], sgg = b[COL.sgg], dong = b[COL.dong];
    if (!sido || !sgg || !dong) return;

    if (!state.sidoMap.has(sido)) state.sidoMap.set(sido, new Set());
    state.sidoMap.get(sido).add(sgg);

    const sggKey = sido + '|' + sgg;
    if (!state.sggMap.has(sggKey)) state.sggMap.set(sggKey, new Set());
    state.sggMap.get(sggKey).add(dong);

    const dongKey = sggKey + '|' + dong;
    if (!state.dongMeta.has(dongKey)){
      state.dongMeta.set(dongKey, { pop: Number(b[COL.pop])||0, elder: Number(b[COL.elder])||0 });
    }
    if (!state.dongBranches.has(dongKey)) state.dongBranches.set(dongKey, []);
    state.dongBranches.get(dongKey).push(b);
  });
}

function initSelectors(){
  const sidoSel = document.getElementById('s-sido');
  const sggSel = document.getElementById('s-sgg');
  const dongSel = document.getElementById('s-dong');

  [...state.sidoMap.keys()].sort().forEach(s => {
    const opt = document.createElement('option');
    opt.value = s; opt.textContent = s;
    sidoSel.appendChild(opt);
  });

  sidoSel.addEventListener('change', () => {
    sggSel.innerHTML = '';
    dongSel.innerHTML = '<option value="">시군구를 먼저 선택하세요</option>';
    dongSel.disabled = true;
    const sido = sidoSel.value;
    if (!sido){ sggSel.disabled = true; sggSel.innerHTML = '<option value="">시도를 먼저 선택하세요</option>'; return; }
    sggSel.disabled = false;
    sggSel.innerHTML = '<option value="">선택하세요</option>';
    [...state.sidoMap.get(sido)].sort().forEach(g => {
      const opt = document.createElement('option');
      opt.value = g; opt.textContent = g;
      sggSel.appendChild(opt);
    });
  });

  sggSel.addEventListener('change', () => {
    dongSel.innerHTML = '';
    const sido = sidoSel.value, sgg = sggSel.value;
    if (!sgg){ dongSel.disabled = true; dongSel.innerHTML = '<option value="">시군구를 먼저 선택하세요</option>'; return; }
    dongSel.disabled = false;
    dongSel.innerHTML = '<option value="">선택하세요</option>';
    [...state.sggMap.get(sido + '|' + sgg)].sort().forEach(d => {
      const opt = document.createElement('option');
      opt.value = d; opt.textContent = d;
      dongSel.appendChild(opt);
    });
  });

  document.getElementById('s-run').addEventListener('click', runSimulation);
}

/* =========================================================
   Sakasegawa(G/G/c) 근사식 — 프로젝트 전체와 동일한 공식·상수 사용
   ========================================================= */
function sakasegawaWqMinutes(lambda, mu, c){
  if (c <= 0 || mu <= 0) return { wq: Infinity, rho: Infinity };
  const rho = lambda / (c * mu);
  if (rho >= 0.99) return { wq: Infinity, rho };
  const expTerm = Math.sqrt(2*(c+1)) - 1;
  const Cc = Math.pow(rho, expTerm) / (c * (1 - rho));
  const wqHours = Cc * (CA2 + CS2) / 2 * (1/mu);
  return { wq: wqHours * 60, rho };
}

function elderFactor(p){ return 1 + p*(ELDER_BIAS - 1); }

/* =========================================================
   시뮬레이션 실행
   ========================================================= */
function runSimulation(){
  const sido = document.getElementById('s-sido').value;
  const sgg = document.getElementById('s-sgg').value;
  const dong = document.getElementById('s-dong').value;
  if (!sido || !sgg || !dong){
    alert('시도·시군구·행정동을 모두 선택해주세요.');
    return;
  }

  const dongKey = `${sido}|${sgg}|${dong}`;
  const meta = state.dongMeta.get(dongKey);
  const branches = (state.dongBranches.get(dongKey) || []);
  const counterBranches = branches.filter(b => b[COL.type] === '영업점(창구+ATM)');

  // 총 수요(λ) = 행정동 인구 기반으로 산출 (지점을 합산하지 않음 — 지점 수만큼 중복계산되는 것을 방지)
  const factor = elderFactor(meta.elder);
  const dailyDemand = meta.pop * BASE_RATE * factor;
  const lambdaTotal = dailyDemand / 7; // 시간당

  // 서비스율(μ)은 그 동에 실제 있는 지점들의 창구/ATM 관측치로 블렌딩 (없으면 기본값)
  let muCSum=0, muCN=0, muASum=0, muAN=0, lamCSum=0, lamASum=0;
  branches.forEach(b => {
    const mc = parseFloat(b[COL.muCounter]), ma = parseFloat(b['ATM 서비스율 μ(명/시간)']);
    const lc = parseFloat(b[COL.lamCounter]), la = parseFloat(b[COL.lamAtm]);
    if (!isNaN(mc)){ muCSum += mc; muCN++; }
    if (!isNaN(ma)){ muASum += ma; muAN++; }
    if (!isNaN(lc)) lamCSum += lc;
    if (!isNaN(la)) lamASum += la;
  });
  const muCAvg = muCN ? muCSum/muCN : FALLBACK_MU_COUNTER;
  const muAAvg = muAN ? muASum/muAN : FALLBACK_MU_ATM;
  const totalLam = lamCSum + lamASum;
  const counterShare = totalLam > 0 ? lamCSum/totalLam : 0.65; // 기본값: 프로젝트 평균 수준
  const atmShare = 1 - counterShare;
  const muRep = 1 / (counterShare/muCAvg + atmShare/muAAvg); // 채널별 서비스시간 가중 조화평균

  const branchCount = counterBranches.length;

  const SLA = parseFloat(document.getElementById('p-sla').value) || 7.5;
  const COST_PER_UNIT = parseFloat(document.getElementById('p-cost').value) || 800;
  const SAVINGS_PER_BRANCH = parseFloat(document.getElementById('p-savings').value) || 8000;
  const WAIT_VALUE = parseFloat(document.getElementById('p-waitvalue').value) || 500;

  const BUSINESS_HOURS = 7;
  const BUSINESS_DAYS = 250;
  // 지점이 없는(신규 설치 검토) 행정동은 절감액이 없으므로 순편익은 순수 대기비용 관점으로만 해석됨
  const baseSavings = branchCount * SAVINGS_PER_BRANCH;

  const nRange = [];
  for (let n=1; n<=15; n++) nRange.push(n);

  const results = nRange.map(n => {
    const { wq, rho } = sakasegawaWqMinutes(lambdaTotal, muRep, n);
    const itmCost = n * COST_PER_UNIT;
    const dailyCustomers = lambdaTotal * BUSINESS_HOURS;
    const annualCustomers = dailyCustomers * BUSINESS_DAYS;
    const waitCostWon = isFinite(wq) ? wq * annualCustomers * WAIT_VALUE : Infinity;
    const waitCostManwon = waitCostWon / 10000;
    const net = baseSavings - itmCost - waitCostManwon;
    return { n, wq, rho, itmCost, waitCostManwon, net };
  });

  let nStar = results.find(r => isFinite(r.wq) && r.wq <= SLA);
  let slaMet = true;
  if (!nStar){ nStar = results[results.length-1]; slaMet = false; }

  renderResult({ sido, sgg, dong, pop: meta.pop, elder: meta.elder, lambdaTotal, muRep, branchCount, results, nStar, slaMet, SLA });
}

/* =========================================================
   결과 렌더링
   ========================================================= */
function renderResult({ sido, sgg, dong, pop, elder, lambdaTotal, muRep, branchCount, results, nStar, slaMet, SLA }){
  document.getElementById('sim-empty').hidden = true;
  const box = document.getElementById('sim-result');
  box.hidden = false;

  const callout = document.getElementById('sim-callout');
  if (slaMet){
    callout.className = 'callout';
    callout.innerHTML = `💡 <b>${escapeHtml(dong)}의 추천 설치대수는 ${nStar.n}대</b>
      (SLA ${SLA}분 충족 최소대수 n*=${nStar.n}대, 연간 순편익 ${Math.round(nStar.net).toLocaleString()}만원)`;
  } else {
    callout.className = 'callout callout-warn';
    callout.innerHTML = `⚠️ <b>${escapeHtml(dong)}은(는) 15대를 설치해도 목표 SLA(${SLA}분)를 충족하지 못합니다.</b>
      최대 검토 범위(15대) 기준 대기시간 ${isFinite(nStar.wq)?nStar.wq.toFixed(2):'∞'}분, 순편익 ${Math.round(nStar.net).toLocaleString()}만원 — 목표 대기시간을 완화하거나 인접 행정동과 묶어 검토하세요.`;
  }

  document.getElementById('sim-summary').innerHTML = `
    <div class="metric"><b>${escapeHtml(sido)} ${escapeHtml(sgg)}</b><span>대상 행정동</span></div>
    <div class="metric"><b>${escapeHtml(dong)}</b><span>행정동명</span></div>
    <div class="metric"><b>${pop.toLocaleString()}명</b><span>행정동 인구</span></div>
    <div class="metric"><b>${(elder*100).toFixed(1)}%</b><span>고령인구비율</span></div>
    <div class="metric"><b>${branchCount}개</b><span>기존 영업점 수</span></div>
    <div class="metric"><b>${lambdaTotal.toFixed(2)}</b><span>추정 시간당 도착률 λ</span></div>
    <div class="metric"><b>${muRep.toFixed(2)}</b><span>대표 서비스율 μ(블렌드)</span></div>
    <div class="metric"><b>${(lambdaTotal*7).toFixed(0)}명</b><span>일평균 이용객(추정)</span></div>
  `;

  drawChart(results, nStar.n);

  const tbody = document.querySelector('#sim-detail-table tbody');
  tbody.innerHTML = results.map(r => `
    <tr class="${r.n===nStar.n ? 'row-highlight':''}">
      <td>${r.n}대</td>
      <td>${isFinite(r.wq) ? r.wq.toFixed(2) : '∞'}</td>
      <td>${isFinite(r.rho) ? r.rho.toFixed(2) : '–'}</td>
      <td>${isFinite(r.net) ? Math.round(r.net).toLocaleString() : '–'}</td>
    </tr>`).join('');
}

/* =========================================================
   SVG 순편익 곡선 차트 (외부 라이브러리 없이 직접 렌더링)
   ========================================================= */
function drawChart(results, highlightN){
  const finite = results.filter(r => isFinite(r.net));
  const values = (finite.length ? finite : results).map(r => isFinite(r.net) ? r.net : 0);
  const minV = Math.min(...values, 0);
  const maxV = Math.max(...values, 0);
  const pad = (maxV - minV) * 0.12 || 1000;
  const yMin = minV - pad, yMax = maxV + pad;

  const W = 620, H = 320, ML = 92, MR = 24, MT = 20, MB = 40;
  const plotW = W - ML - MR, plotH = H - MT - MB;

  const n0 = results[0].n, n1 = results[results.length-1].n;
  const xScale = (n) => ML + (n - n0) / (n1 - n0) * plotW;
  const yScale = (v) => MT + (1 - (v - yMin) / (yMax - yMin)) * plotH;

  const steps = 5;
  const gridLines = [];
  for (let i=0;i<=steps;i++){
    const v = yMin + (yMax-yMin)*i/steps;
    gridLines.push({ v, y: yScale(v) });
  }
  const zeroY = (yMin<=0 && yMax>=0) ? yScale(0) : null;

  const clampedY = (r) => isFinite(r.net) ? yScale(r.net) : yScale(yMin);
  const linePoints = results.map(r => `${xScale(r.n)},${clampedY(r)}`).join(' ');
  const baseY = yScale(0>yMin?0:yMin);
  const areaPoints = `${xScale(n0)},${baseY} ` + linePoints + ` ${xScale(n1)},${baseY}`;

  const dots = results.map(r => {
    const isHi = r.n === highlightN;
    return `<circle cx="${xScale(r.n)}" cy="${clampedY(r)}" r="${isHi?7:3.5}"
      fill="${isHi?'#2E7D5B':'#1D4E89'}" stroke="#fff" stroke-width="${isHi?2:1}" />`;
  }).join('');

  const xLabels = results.map(r => `<text x="${xScale(r.n)}" y="${H-14}" text-anchor="middle" class="chart-axis-label">${r.n}대</text>`).join('');
  const yLabels = gridLines.map(g => `<text x="${ML-10}" y="${g.y+4}" text-anchor="end" class="chart-axis-label">${Math.round(g.v).toLocaleString()}만</text>`).join('');
  const gridSvg = gridLines.map(g => `<line x1="${ML}" y1="${g.y}" x2="${W-MR}" y2="${g.y}" class="chart-grid" />`).join('');
  const zeroLine = zeroY != null ? `<line x1="${ML}" y1="${zeroY}" x2="${W-MR}" y2="${zeroY}" class="chart-zero" />` : '';

  document.getElementById('sim-chart').innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="chart-svg">
      ${gridSvg}
      ${zeroLine}
      <polygon points="${areaPoints}" class="chart-area" />
      <polyline points="${linePoints}" class="chart-line" />
      ${dots}
      ${xLabels}
      ${yLabels}
    </svg>
  `;
}

loadAll();
