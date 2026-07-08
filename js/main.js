/* ======================================================================
   5. 메인 시뮬레이터 UI (25개 구 · 은행 선택 시뮬레이터)
   ====================================================================== */
const regionSel = document.getElementById('regionSelect');
regions.forEach(function (r, i) {
  const opt = document.createElement('option');
  opt.value = i; opt.textContent = r.name;
  if (r.name === '동작구') opt.selected = true;
  regionSel.appendChild(opt);
});

let mainChart;

function renderMain() {
  const region = regions[regionSel.value];
  const bankKey = document.getElementById('bankSelect').value;
  const n = parseInt(document.getElementById('nSlider').value, 10);
  const capex = parseInt(document.getElementById('capexSlider').value, 10) * 10000;
  const ratio = parseInt(document.getElementById('ratioSelect').value, 10);
  document.getElementById('nOut').textContent = n;
  document.getElementById('capexOut').textContent = (capex / 10000).toLocaleString('ko-KR') + '만원';

  const params = buildParams(region, bankKey);
  const warnBox = document.getElementById('bankWarn');

  if (!params.valid) {
    warnBox.style.display = 'block';
    warnBox.textContent = region.name + '에는 ' + BANKS[bankKey].label + ' 지점이 없습니다. 다른 구나 은행을 선택하세요.';
    document.getElementById('regionInfo').innerHTML = '';
    document.getElementById('wqOut').textContent = '-';
    document.getElementById('rhoOut').textContent = '-';
    document.getElementById('netOut').textContent = '-';
    document.getElementById('recommendBox').textContent = '';
    if (mainChart) { mainChart.destroy(); mainChart = null; }
    return;
  }
  warnBox.style.display = 'none';

  document.getElementById('regionInfo').innerHTML =
    '<span>은행: ' + BANKS[bankKey].label + '</span>' +
    (bankKey !== 'all' ? '<span>이 구의 지점수: ' + params.branchCount + '개</span>' : '<span>인구 ' + region.population.toLocaleString('ko-KR') + '명</span>') +
    '<span>λ ' + params.lambdaPerHour.toFixed(1) + '명/h</span>' +
    '<span>추정 창구인력 ' + params.baseTellers + '명</span>';

  const nStar = findNStar(params.lambdaPerHour, params.muPerMin, params.ca2, params.cs2, 25);
  const current = computeForN(n, params.lambdaPerHour, params.muPerMin, params.baseTellers, params.ca2, params.cs2, capex, ratio, nStar);

  document.getElementById('wqOut').textContent = current.Wq === Infinity ? '포화' : current.Wq.toFixed(1) + '분';
  document.getElementById('rhoOut').textContent = (current.rho * 100).toFixed(0) + '%';
  document.getElementById('netOut').textContent = current.Wq === Infinity ? '계산불가' : Math.round(current.netBenefit / 10000).toLocaleString('ko-KR') + '만원';

  const nMax = 15;
  const nRange = [];
  for (let i = 2; i <= nMax; i++) nRange.push(i);
  const results = nRange.map(function (nn) { return computeForN(nn, params.lambdaPerHour, params.muPerMin, params.baseTellers, params.ca2, params.cs2, capex, ratio, nStar); });
  let bestIdx = 0;
  results.forEach(function (r, i) { if (r.Wq !== Infinity && r.netBenefit > results[bestIdx].netBenefit) bestIdx = i; });
  const bestN = nRange[bestIdx];
  const bestNet = results[bestIdx].netBenefit;

  document.getElementById('recommendBox').innerHTML =
    '<strong>' + region.name + ' · ' + BANKS[bankKey].label + '</strong>의 추천 설치대수는 <strong>' + bestN + '대</strong> ' +
    '(SLA ' + SLA_MIN + '분 충족 최소대수 n*=' + nStar + '대, 연간 순편익 ' + Math.round(bestNet / 10000).toLocaleString('ko-KR') + '만원)';

  const pointColors = nRange.map(function (nn) { return nn === bestN ? '#0f6e56' : '#378ADD'; });
  const pointRadii = nRange.map(function (nn) { return nn === n ? 7 : (nn === bestN ? 6 : 3); });
  const netData = results.map(function (r) { return Math.round(r.netBenefit / 10000); });

  if (mainChart) {
    mainChart.data.datasets[0].data = netData;
    mainChart.data.datasets[0].pointBackgroundColor = pointColors;
    mainChart.data.datasets[0].pointRadius = pointRadii;
    mainChart.update();
  } else {
    mainChart = new Chart(document.getElementById('chart'), {
      type: 'line',
      data: {
        labels: nRange.map(function (v) { return v + '대'; }),
        datasets: [{
          label: '연간 순편익(만원)', data: netData,
          borderColor: '#378ADD', backgroundColor: 'rgba(55,138,221,0.1)',
          pointBackgroundColor: pointColors, pointRadius: pointRadii,
          borderWidth: 2, fill: true, tension: 0.25
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { ticks: { callback: function (v) { return v.toLocaleString('ko-KR') + '만'; } } } }
      }
    });
  }

  document.getElementById('sensSummary').innerHTML =
    '지금 설정(설치비 ' + (capex / 10000).toLocaleString('ko-KR') + '만원, 감축비율 ' + ratio + '대당 1명, ' + BANKS[bankKey].label + ') 기준 추천 대수는 ' +
    bestN + '대입니다. 은행·구·설치비·감축비율을 바꿔가며 결과가 얼마나 안정적인지 확인해보세요.';
}

regionSel.addEventListener('change', renderMain);
document.getElementById('bankSelect').addEventListener('change', renderMain);
document.getElementById('nSlider').addEventListener('input', renderMain);
document.getElementById('capexSlider').addEventListener('input', renderMain);
document.getElementById('ratioSelect').addEventListener('change', renderMain);
renderMain();
