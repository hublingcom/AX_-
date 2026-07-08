/* ======================================================================
   6. 보조자료 — 직접 입력 계산기 (전체은행 평균 파라미터 사용)
   ====================================================================== */
function stepValue(id, delta) {
  const el = document.getElementById(id);
  let v = parseFloat(el.value) || 0;
  v = Math.max(0, v + delta);
  el.value = (id === 'customTellers') ? Math.round(v).toString() : v.toFixed(2);
}

function fmtMan(v) {
  const sign = v < 0 ? '-' : '';
  return sign + Math.round(Math.abs(v) / 10000).toLocaleString('ko-KR') + '만 원';
}

let profitChart, waitChart, breakdownChart;
const CUSTOM_CA2 = BANKS.all.ca2;
const CUSTOM_CS2 = BANKS.all.scv;
const CUSTOM_CAPEX = 25000000;
const CUSTOM_RATIO = 2;

function runCustomCalculation() {
  const lambdaPerHour = parseFloat(document.getElementById('customLambda').value) || 1;
  const baseTellers = Math.max(1, parseInt(document.getElementById('customTellers').value, 10) || 1);
  const serviceMin = parseFloat(document.getElementById('customService').value) || 1;
  const muPerMin = 1 / serviceMin;

  const nMax = 20;
  const nStar = findNStar(lambdaPerHour, muPerMin, CUSTOM_CA2, CUSTOM_CS2, nMax);

  const nRange = [];
  for (let n = nStar; n <= nMax; n++) nRange.push(n);
  const results = nRange.map(function (n) { return computeForN(n, lambdaPerHour, muPerMin, baseTellers, CUSTOM_CA2, CUSTOM_CS2, CUSTOM_CAPEX, CUSTOM_RATIO, nStar); });

  let bestIdx = 0;
  results.forEach(function (r, i) { if (r.netBenefit > results[bestIdx].netBenefit) bestIdx = i; });
  const bestN = nRange[bestIdx];
  const bestResult = results[bestIdx];

  document.getElementById('customResultN').textContent = bestN;
  document.getElementById('customResultNet').textContent = fmtMan(bestResult.netBenefit);
  document.getElementById('customResultWq').textContent = bestResult.Wq === Infinity ? '포화' : bestResult.Wq.toFixed(1) + '분';

  renderProfitChart(nRange, results, bestN);
  renderWaitChart(nRange, results);
  renderBreakdownChart(bestResult);

  const scenarioTitle = (document.getElementById('customName').value || '').trim() || '시나리오';
  const exportEnabled = nRange.length > 0;

  lastCustomExport = exportEnabled ? {
    type: 'custom',
    exportedAt: new Date(),
    title: scenarioTitle,
    inputs: {
      lambdaPerHour: lambdaPerHour,
      baseTellers: baseTellers,
      serviceMin: serviceMin,
      muPerMin: muPerMin,
      ca2: CUSTOM_CA2,
      cs2: CUSTOM_CS2,
      capex: CUSTOM_CAPEX,
      ratio: CUSTOM_RATIO
    },
    fixedAssumptions: '전체은행 평균 변동계수, capex 2,500만원, 감축 2대당 1명',
    nStar: nStar,
    bestN: bestN,
    bestIdx: bestIdx,
    bestResult: bestResult,
    nRange: nRange,
    results: results,
    chartInstances: [profitChart, waitChart, breakdownChart],
    chartLabels: ['대수별 예상 이익', '대수별 예상 대기시간', '추천 대수 기준 비용분해']
  } : null;
  setExportButtonState('exportCustomBtn', exportEnabled);
}

function renderProfitChart(nRange, results, bestN) {
  const data = results.map(function (r) { return Math.round(r.netBenefit / 10000); });
  const colors = nRange.map(function (n, i) { return n === bestN ? (data[i] >= 0 ? '#173404' : '#993C1D') : (data[i] >= 0 ? '#639922' : '#F0997B'); });
  if (profitChart) profitChart.destroy();
  profitChart = new Chart(document.getElementById('profitChart'), {
    type: 'bar',
    data: { labels: nRange, datasets: [{ data: data, backgroundColor: colors, borderRadius: 3 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        datalabels: {
          anchor: function (ctx) { return ctx.dataset.data[ctx.dataIndex] >= 0 ? 'end' : 'start'; },
          align: function (ctx) { return ctx.dataset.data[ctx.dataIndex] >= 0 ? 'end' : 'bottom'; },
          color: '#555', font: { size: 10 },
          formatter: function (v) { return v.toLocaleString('ko-KR') + '만'; }
        }
      },
      scales: { x: { title: { display: true, text: '설치 대수' } }, y: { ticks: { callback: function (v) { return v.toLocaleString('ko-KR'); } } } }
    },
    plugins: [ChartDataLabels]
  });
}

function renderWaitChart(nRange, results) {
  const data = results.map(function (r) { return r.Wq === Infinity ? null : Math.round(r.Wq * 10) / 10; });
  const targetLine = nRange.map(function () { return SLA_MIN; });
  if (waitChart) waitChart.destroy();
  waitChart = new Chart(document.getElementById('waitChart'), {
    data: {
      labels: nRange,
      datasets: [
        { type: 'bar', data: data, backgroundColor: '#639922', borderRadius: 3,
          datalabels: { anchor: 'end', align: 'end', color: '#555', font: { size: 10 }, formatter: function (v) { return v + '분'; } } },
        { type: 'line', data: targetLine, borderColor: '#E24B4A', borderDash: [6, 4], borderWidth: 2, pointRadius: 0, fill: false, datalabels: { display: false } }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { title: { display: true, text: '설치 대수' } }, y: { suggestedMax: SLA_MIN + 1 } }
    },
    plugins: [ChartDataLabels]
  });
}

function renderBreakdownChart(bestResult) {
  const labels = ['인건비 절감', '설치·운영비', '고객 이탈 손실'];
  const values = [bestResult.savings, -bestResult.costTotal, -bestResult.abandonLoss];
  const colors = ['#639922', '#E24B4A', '#E24B4A'];
  if (breakdownChart) breakdownChart.destroy();
  breakdownChart = new Chart(document.getElementById('breakdownChart'), {
    type: 'bar',
    data: { labels: labels, datasets: [{ data: values, backgroundColor: colors, borderRadius: 3 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        datalabels: {
          anchor: function (ctx) { return ctx.dataset.data[ctx.dataIndex] >= 0 ? 'end' : 'start'; },
          align: function (ctx) { return ctx.dataset.data[ctx.dataIndex] >= 0 ? 'end' : 'bottom'; },
          color: '#555', font: { size: 11 },
          formatter: function (v) { return fmtMan(v); }
        }
      },
      scales: { y: { ticks: { callback: function (v) { return v.toLocaleString('ko-KR'); } } } }
    },
    plugins: [ChartDataLabels]
  });
}

runCustomCalculation();
