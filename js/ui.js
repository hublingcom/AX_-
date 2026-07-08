
/* ======================================================================
   ui.js — 레이아웃/탭/은행 강조컬러/슬라이더 툴팁 전용 UI 로직
   계산·차트 데이터 로직(main.js, reference-calculator.js, calc.js, data/*.js)은
   전혀 건드리지 않는다. 이미 그 파일들이 채워주는 기존 DOM 값을 읽어와
   시각적으로 재배치·강조하는 것만 담당한다.
   ====================================================================== */

/* ---- 1. 탭 전환 ---- */
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

function activateTab(name) {
  tabButtons.forEach(function (btn) {
    btn.classList.toggle('active', btn.dataset.tab === name);
  });
  tabPanels.forEach(function (panel) {
    panel.classList.toggle('active', panel.id === 'tabPanel-' + name);
  });
  // 탭이 숨겨진 동안 생성된 Chart.js 캔버스는 크기가 0으로 굳어버리므로,
  // 탭이 보이는 시점에 다시 resize()를 호출해 실제 컨테이너 크기에 맞춘다.
  requestAnimationFrame(function () {
    if (name === 'sim' && typeof mainChart !== 'undefined' && mainChart) {
      mainChart.resize();
    }
    if (name === 'custom') {
      if (typeof profitChart !== 'undefined' && profitChart) profitChart.resize();
      if (typeof waitChart !== 'undefined' && waitChart) waitChart.resize();
      if (typeof breakdownChart !== 'undefined' && breakdownChart) breakdownChart.resize();
    }
  });
}

tabButtons.forEach(function (btn) {
  btn.addEventListener('click', function () { activateTab(btn.dataset.tab); });
});

/* ---- 2. 은행별 강조 컬러 (사이드 패널 상단 보더) ---- */
const BANK_COLORS = {
  all: '#1F3B57',
  woori: '#004A9F',
  shinhan: '#E25B2A',
  hana: '#008A5E'
};

function applyBankColor(bankKey) {
  document.documentElement.style.setProperty('--bank-color', BANK_COLORS[bankKey] || BANK_COLORS.all);
}

const bankSelectEl = document.getElementById('bankSelect');
if (bankSelectEl) {
  applyBankColor(bankSelectEl.value);
  bankSelectEl.addEventListener('change', function () { applyBankColor(bankSelectEl.value); });
}

/* ---- 3. n 슬라이더 값 툴팁 ---- */
const nSliderEl = document.getElementById('nSlider');
const nSliderTooltipEl = document.getElementById('nSliderTooltip');

function updateSliderTooltip() {
  if (!nSliderEl || !nSliderTooltipEl) return;
  const min = Number(nSliderEl.min);
  const max = Number(nSliderEl.max);
  const val = Number(nSliderEl.value);
  const percent = (val - min) / (max - min);
  const thumbWidth = 16;
  const trackWidth = nSliderEl.offsetWidth;
  const offset = thumbWidth / 2 + percent * Math.max(0, trackWidth - thumbWidth);
  nSliderTooltipEl.style.left = offset + 'px';
  nSliderTooltipEl.textContent = val + '대';
}

if (nSliderEl) {
  nSliderEl.addEventListener('input', updateSliderTooltip);
  window.addEventListener('resize', updateSliderTooltip);
  updateSliderTooltip();
}

/* ---- 4. Hero 카드 값 미러링 ----
   main.js가 recommendBox / netOut / wqOut에 써주는 값을 그대로 읽어와
   Hero 카드의 heroN / heroNet / heroWq에 복사한다. 계산은 하지 않고
   텍스트를 옮기고 부호에 따라 색상 클래스만 토글한다. */
const heroNEl = document.getElementById('heroN');
const heroNetEl = document.getElementById('heroNet');
const heroWqEl = document.getElementById('heroWq');
const recommendBoxEl = document.getElementById('recommendBox');
const netOutEl = document.getElementById('netOut');
const wqOutEl = document.getElementById('wqOut');

function syncHero() {
  if (recommendBoxEl && heroNEl) {
    const strongs = recommendBoxEl.querySelectorAll('strong');
    const match = strongs.length >= 2 ? strongs[1].textContent.match(/\d+/) : null;
    heroNEl.textContent = match ? match[0] + '대' : '-';
  }
  if (netOutEl && heroNetEl) {
    const text = netOutEl.textContent;
    heroNetEl.textContent = text;
    heroNetEl.classList.remove('positive', 'negative');
    if (text.trim().charAt(0) === '-') {
      heroNetEl.classList.add('negative');
    } else if (/\d/.test(text)) {
      heroNetEl.classList.add('positive');
    }
  }
  if (wqOutEl && heroWqEl) {
    heroWqEl.textContent = wqOutEl.textContent;
  }
}

[recommendBoxEl, netOutEl, wqOutEl].forEach(function (el) {
  if (!el) return;
  new MutationObserver(syncHero).observe(el, { childList: true, characterData: true, subtree: true });
});
syncHero();

/* ---- 5. 초기 탭 상태 ---- */
activateTab('sim');

/* ---- 6. 정보 아이콘 툴팁 동기화 ----
   main.js가 regionInfo / sensSummary에 innerHTML로 써주는 내용을
   숨겨진(display:none) 원본 요소에서 그대로 읽어와 ℹ 툴팁에 미러링한다.
   요소 자체와 id는 그대로 두고 화면에서만 대체하는 방식이라 main.js는 건드릴 필요가 없다. */
const regionInfoEl = document.getElementById('regionInfo');
const regionInfoTooltipEl = document.getElementById('regionInfoTooltip');
const sensSummaryEl = document.getElementById('sensSummary');
const sensTooltipEl = document.getElementById('sensTooltip');

function mirrorTooltip(sourceEl, tooltipEl) {
  if (!sourceEl || !tooltipEl) return;
  tooltipEl.innerHTML = sourceEl.innerHTML;
}

if (regionInfoEl && regionInfoTooltipEl) {
  mirrorTooltip(regionInfoEl, regionInfoTooltipEl);
  new MutationObserver(function () { mirrorTooltip(regionInfoEl, regionInfoTooltipEl); })
    .observe(regionInfoEl, { childList: true, characterData: true, subtree: true });
}

if (sensSummaryEl && sensTooltipEl) {
  mirrorTooltip(sensSummaryEl, sensTooltipEl);
  new MutationObserver(function () { mirrorTooltip(sensSummaryEl, sensTooltipEl); })
    .observe(sensSummaryEl, { childList: true, characterData: true, subtree: true });
}

/* ---- 7. 창 크기 변경 시 차트 리사이즈 ----
   Chart.js는 캔버스가 처음 생성된 컨테이너 크기에 맞춰지는데, 페이지를 로드한
   뒤 브라우저 창 자체를 줄이는 경우(리사이즈 옵저버가 못 잡는 케이스)에는
   캔버스가 이전 크기에 고정된 채로 남아 가로 스크롤이 생길 수 있다.
   창 resize 이벤트마다 현재 존재하는 모든 차트 인스턴스를 다시 맞춘다
   (숨겨진 탭의 차트를 resize()해도 0크기로 계산될 뿐 문제없고, 이후 해당
   탭을 열 때 activateTab()이 다시 한번 정확한 크기로 맞춰준다). */
function resizeAllCharts() {
  if (typeof mainChart !== 'undefined' && mainChart) mainChart.resize();
  if (typeof profitChart !== 'undefined' && profitChart) profitChart.resize();
  if (typeof waitChart !== 'undefined' && waitChart) waitChart.resize();
  if (typeof breakdownChart !== 'undefined' && breakdownChart) breakdownChart.resize();
}

let resizeDebounceTimer = null;
window.addEventListener('resize', function () {
  if (resizeDebounceTimer) clearTimeout(resizeDebounceTimer);
  resizeDebounceTimer = setTimeout(resizeAllCharts, 150);
});
