/* =========================================================
   공통 설정 (모든 페이지 공용)
   ========================================================= */
const DATA_PATHS = {
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
  lamCounter: '시간당 고객도착률 λ(창구)', lamAtm: '시간당 고객도착률 λ(ATM)',
  muCounter: '서비스율 μ(창구,명/시간)',
};

// 취약점수 xlsx 컬럼명
const VCOL = {
  sido:'시도', sgg:'시군구', dong:'행정동', pop:'총인구수',
  farm:'농어업인비율(시도기준)', elderN:'고령인구수', elderP:'고령인구비율',
  disN:'장애인수', disP:'장애인비율', welN:'수급권자수', welP:'수급권자비율',
  score:'취약점수(A)',
};

const SIDO_SHORT = {
  '서울특별시':'서울','부산광역시':'부산','대구광역시':'대구','인천광역시':'인천','광주광역시':'광주',
  '대전광역시':'대전','울산광역시':'울산','세종특별자치시':'세종','경기도':'경기','강원특별자치도':'강원',
  '충청북도':'충북','충청남도':'충남','전북특별자치도':'전북','전라남도':'전남','경상북도':'경북',
  '경상남도':'경남','제주특별자치도':'제주',
};
function sidoShort(full){ return SIDO_SHORT[full] || full; }

function keyOf(name, addr){ return (name||'').trim() + '|' + (addr||'').trim(); }

function escapeHtml(s){
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* =========================================================
   로딩 UI 헬퍼 (모든 페이지에 #loading-overlay가 있다고 가정)
   ========================================================= */
function setLoading(pct, text){
  const bar = document.getElementById('loading-bar');
  const txt = document.getElementById('loading-text');
  if (bar) bar.style.width = pct + '%';
  if (txt && text) txt.textContent = text;
}
function hideLoading(){
  const el = document.getElementById('loading-overlay');
  if (el) el.classList.add('hidden');
}
function showLoadError(msg){
  setLoading(100, '데이터 로드 실패: ' + msg + ' (data/ 경로와 파일명을 확인하세요)');
}

/* =========================================================
   파일 로딩 (진행률 포함)
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

/* =========================================================
   상단 네비게이션 활성 표시 (파일명 기준)
   ========================================================= */
document.addEventListener('DOMContentLoaded', () => {
  const here = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-link').forEach(a => {
    const target = a.getAttribute('href');
    if (target === here) a.classList.add('is-active');
  });
});
