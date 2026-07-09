let state = {
  banks: [],
  sidoMap: new Map(),     // 시도 -> Set(시군구)
  sggMap: new Map(),      // "시도|시군구" -> Set(행정동)
  dongMap: new Map(),     // "시도|시군구|행정동" -> bank rows
};

const CA2 = 1.0;
const CS2 = 0.671;          // 현장관찰 실측 기반, 프로젝트 전체와 동일 상수
const COST_PER_UNIT_INIT = 2500;  // 만원, ITM 대당 초기투자(가정)
const COST_PER_UNIT_MONTHLY = 30; // 만원, ITM 대당 월 운영비(가정)
const MONTHLY_BUSINESS_HOURS = 7 * 22; // 영업시간 7h × 월 영업일 22일(가정)

async function loadAll(){
  try{
    state.banks = await loadXlsx(DATA_PATHS.banks, 0, 10, 90, '은행 데이터 불러오는 중…');
    setLoading(94, '지역/지점 색인 생성 중…');
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
    if (!state.dongMap.has(dongKey)) state.dongMap.set(dongKey, []);
    state.dongMap.get(dongKey).push(b);
  });
}

function initSelectors(){
  const sidoSel = document.getElementById('s-sido');
  const sggSel = document.getElementById('s-sgg');
  const dongSel = document.getElementById('s-dong');
  const branchSel = document.getElementById('s-branch');

  [...state.sidoMap.keys()].sort().forEach(s => {
    const opt = document.createElement('option');
    opt.value = s; opt.textContent = s;
    sidoSel.appendChild(opt);
  });

  sidoSel.addEventListener('change', () => {
    sggSel.innerHTML = ''; dongSel.innerHTML = ''; branchSel.innerHTML = '';
    dongSel.disabled = true; branchSel.disabled = true;
    const sido = sidoSel.value;
    if (!sido){ sggSel.disabled = true; sggSel.innerHTML = '<option value="">시도를 먼저 선택하세요</option>'; return; }
    sggSel.disabled = false;
    sggSel.innerHTML = '<option value="">선택하세요</option>';
    [...state.sidoMap.get(sido)].sort().forEach(g => {
      const opt = document.createElement('option'); opt.value = g; opt.textContent = g; sggSel.appendChild(opt);
    });
    dongSel.innerHTML = '<option value="">시군구를 먼저 선택하세요</option>';
    branchSel.innerHTML = '<option value="">행정동을 먼저 선택하세요</option>';
  });

  sggSel.addEventListener('change', () => {
    dongSel.innerHTML = ''; branchSel.innerHTML = '';
    branchSel.disabled = true;
    const sido = sidoSel.value, sgg = sggSel.value;
    if (!sgg){ dongSel.disabled = true; dongSel.innerHTML = '<option value="">시군구를 먼저 선택하세요</option>'; return; }
    dongSel.disabled = false;
    dongSel.innerHTML = '<option value="">선택하세요</option>';
    [...state.sggMap.get(sido+'|'+sgg)].sort().forEach(d => {
      const opt = document.createElement('option'); opt.value = d; opt.textContent = d; dongSel.appendChild(opt);
    });
    branchSel.innerHTML = '<option value="">행정동을 먼저 선택하세요</option>';
  });

  dongSel.addEventListener('change', () => {
    branchSel.innerHTML = '';
    const sido = sidoSel.value, sgg = sggSel.value, dong = dongSel.value;
    if (!dong){ branchSel.disabled = true; branchSel.innerHTML = '<option value="">행정동을 먼저 선택하세요</option>'; return; }
    branchSel.disabled = false;
    branchSel.innerHTML = '<option value="">선택하세요</option>';
    const rows = state.dongMap.get(`${sido}|${sgg}|${dong}`) || [];
    rows.forEach((b, i) => {
      const opt = document.createElement('option');
      opt.value = i; opt.textContent = `${b[COL.name]}${b[COL.type]==='ATM전용' ? ' (ATM전용)' : ''}`;
      branchSel.appendChild(opt);
    });
  });

  branchSel.addEventListener('change', () => {
    const sido = sidoSel.value, sgg = sggSel.value, dong = dongSel.value;
    const idx = branchSel.value;
    if (idx === '') return;
    const bank = state.dongMap.get(`${sido}|${sgg}|${dong}`)[idx];
    onBranchSelected(bank);
  });

  ['v-lambda','v-svc','v-sla'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => { updateSliderLabels(); recompute(); });
  });
}

function updateSliderLabels(){
  document.getElementById('v-lambda-out').textContent = document.getElementById('v-lambda').value;
  document.getElementById('v-svc-out').textContent = document.getElementById('v-svc').value;
  document.getElementById('v-sla-out').textContent = document.getElementById('v-sla').value;
}

/* =========================================================
   지점 선택 -> 슬라이더 실측값으로 프리필
   ========================================================= */
function onBranchSelected(bank){
  document.getElementById('sim-empty').hidden = true;
  document.getElementById('sim-result').hidden = false;

  const lamCounter = parseFloat(bank[COL.lamCounter]) || 0;
  const lamAtm = parseFloat(bank[COL.lamAtm]) || 0;
  const lamTotal = Math.max(1, Math.round(lamCounter + lamAtm));

  const svcCounter = parseFloat(bank[COL.svc]);
  const svcDefault = !isNaN(svcCounter) ? Math.min(15, Math.max(1, Math.round(svcCounter*2)/2)) : 4;

  const lamSlider = document.getElementById('v-lambda');
  lamSlider.max = Math.max(150, lamTotal + 20);
  lamSlider.value = lamTotal;
  document.getElementById('v-svc').value = svcDefault;
  document.getElementById('v-sla').value = 7;

  updateSliderLabels();
  recompute();
}

/* =========================================================
   Sakasegawa(G/G/c) 근사식 — 프로젝트 전체와 동일한 공식·상수 사용
   ========================================================= */
function sakasegawaWqMinutes(lambda, mu, c){
  if (c <= 0 || mu <= 0) return { wq: Infinity, rho: Infinity, cc: Infinity };
  const rho = lambda / (c * mu);
  if (rho >= 0.99) return { wq: Infinity, rho, cc: Infinity };
  const expTerm = Math.sqrt(2*(c+1)) - 1;
  const Cc = Math.pow(rho, expTerm) / (c * (1 - rho));
  const wqHours = Cc * (CA2 + CS2) / 2 * (1/mu);
  return { wq: wqHours * 60, rho, cc: Cc };
}

/* =========================================================
   슬라이더 값으로 재계산 (실시간)
   ========================================================= */
function recompute(){
  const lambda = parseFloat(document.getElementById('v-lambda').value);
  const svcMin = parseFloat(document.getElementById('v-svc').value);
  const sla = parseFloat(document.getElementById('v-sla').value);
  const mu = 60 / svcMin;

  const nRange = [];
  for (let n=1; n<=12; n++) nRange.push(n);

  const results = nRange.map(n => {
    const { wq, rho, cc } = sakasegawaWqMinutes(lambda, mu, n);
    const monthlyCustomers = lambda * MONTHLY_BUSINESS_HOURS;
    // Cc(사카세가와 근사식의 대기확률 항)를 이용해 "대기가 발생하는 고객 비율"을 근사, 월 대기고객 수 추정
    const waitProb = isFinite(cc) ? Math.min(1, cc) : 1;
    const monthlyWaitingCustomers = isFinite(wq) ? Math.round(monthlyCustomers * waitProb) : null;
    const initCost = n * COST_PER_UNIT_INIT;
    const monthlyCost = n * COST_PER_UNIT_MONTHLY;
    const feasible = isFinite(wq) && rho < 1;
    const meetsSla = feasible && wq <= sla;
    return { n, wq, rho, monthlyWaitingCustomers, initCost, monthlyCost, feasible, meetsSla };
  });

  let picked = results.find(r => r.meetsSla);
  const anyFeasible = results.some(r => r.feasible);
  if (!picked) picked = results[results.length-1];

  renderResult(picked, results, sla);
}

function renderResult(picked, results, sla){
  document.getElementById('rec-n').textContent = picked.n;

  if (picked.meetsSla){
    document.getElementById('rec-desc').textContent = `목표 대기 ${sla}분 이내 최소 대수입니다.`;
  } else if (picked.feasible){
    document.getElementById('rec-desc').textContent = `12대까지 검토했지만 목표 대기(${sla}분)를 충족하는 대수가 없어, 대기시간이 가장 짧은 12대를 표시합니다.`;
  } else {
    document.getElementById('rec-desc').textContent = `12대를 설치해도 수요를 감당하지 못합니다(가동률 100%+). 목표 대기시간을 완화하거나 인접 지점과 통합을 검토하세요.`;
  }
  const waitTxt = isFinite(picked.wq) ? picked.wq.toFixed(1) : '∞';
  const rhoTxt = isFinite(picked.rho) ? Math.round(picked.rho*100) : '100+';
  document.getElementById('rec-sub').textContent = `예상 대기 ${waitTxt}분 · 이용률 ${rhoTxt}%`;

  const tbody = document.querySelector('#sim-detail-table tbody');
  tbody.innerHTML = results.map(r => {
    const isRec = r.n === picked.n && picked.meetsSla;
    const tag = !r.feasible ? '<span class="tag tag-bad">불가</span>' : (isRec ? '<span class="tag tag-good">권고</span>' : '');
    const rhoTxt = r.feasible ? Math.round(r.rho*100)+'%' : '100%+';
    const waitTxt = r.feasible ? r.wq.toFixed(1)+'분' : '폭증';
    const waitCustTxt = r.monthlyWaitingCustomers != null ? r.monthlyWaitingCustomers.toLocaleString()+'명' : '—';
    return `<tr class="${isRec ? 'row-highlight' : ''}">
      <td>${r.n}대 ${tag}</td>
      <td>${rhoTxt}</td>
      <td>${waitTxt}</td>
      <td>${waitCustTxt}</td>
      <td>${r.initCost.toLocaleString()}만원</td>
      <td>${r.monthlyCost.toLocaleString()}만원</td>
    </tr>`;
  }).join('');
}

loadAll();
