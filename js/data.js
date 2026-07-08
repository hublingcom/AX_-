/* ======================================================================
   1. 실측 앵커 상수 — 은행별 (동작구 3개 은행 현장관찰 기반)
   ====================================================================== */
const BANKS = {
  all: {
    label: "전체 은행 평균",
    muGeneral: 10.17, muElderly: 13.10, scv: 0.917, ca2: 1.212,
    anchorBranches: 35, anchorTellers: 6.67, anchorLambda: 18.51, anchorPop: 385000
  },
  woori: {
    label: "우리은행",
    muGeneral: 6.87, muElderly: 6.73, scv: 0.632, ca2: 1.239,
    anchorBranches: 9, anchorTellers: 2, anchorLambda: 18.78
  },
  shinhan: {
    label: "신한은행",
    muGeneral: 14.3, muElderly: 20.95, scv: 1.055, ca2: 0.924,
    anchorBranches: 2, anchorTellers: 13, anchorLambda: 19.4
  },
  hana: {
    label: "하나은행",
    muGeneral: 9.10, muElderly: 13.42, scv: 1.050, ca2: 1.411,
    anchorBranches: 7, anchorTellers: 5, anchorLambda: 17.35
  }
};
const ANCHOR_ELDERLY_RATIO = 0.522;

/* ======================================================================
   2. 비용·정책 파라미터 (가정치)
   ====================================================================== */
const SLA_MIN = 7.5;
const OPERATING_HOURS = 7;
const TELLER_WAGE_ANNUAL = 115000000;
const KIOSK_OPEX_MONTHLY = 150000;
const KIOSK_DEPRECIATION_YEARS = 5;
const COMPLIANCE_COST_PER_UNIT = 2000000;
const LOSS_PER_ABANDON = 20000;
const ABANDON_CENTER_MIN = 15;
const ABANDON_SLOPE = 3.3;

/* ======================================================================
   3. 25개 구 데이터: 인구(전체은행 모드용) + 은행별 지점수
   ====================================================================== */
const regions = [
  { name: "송파구", population: 657000, elderlyRatio: 0.161, branches: { all: 136, woori: 22, shinhan: 26, hana: 15 } },
  { name: "강남구", population: 559000, elderlyRatio: 0.156, branches: { all: 148, woori: 22, shinhan: 30, hana: 23 } },
  { name: "강서구", population: 555000, elderlyRatio: 0.175, branches: { all: 50,  woori: 21, shinhan: 3,  hana: 7 } },
  { name: "강동구", population: 504000, elderlyRatio: 0.165, branches: { all: 78,  woori: 20, shinhan: 3,  hana: 20 } },
  { name: "관악구", population: 498000, elderlyRatio: 0.170, branches: { all: 60,  woori: 5,  shinhan: 11, hana: 6 } },
  { name: "노원구", population: 488000, elderlyRatio: 0.210, branches: { all: 30,  woori: 4,  shinhan: 7,  hana: 6 } },
  { name: "은평구", population: 458000, elderlyRatio: 0.195, branches: { all: 39,  woori: 3,  shinhan: 10, hana: 2 } },
  { name: "성북구", population: 438000, elderlyRatio: 0.190, branches: { all: 44,  woori: 10, shinhan: 3,  hana: 2 } },
  { name: "양천구", population: 426000, elderlyRatio: 0.170, branches: { all: 62,  woori: 10, shinhan: 11, hana: 8 } },
  { name: "서초구", population: 420000, elderlyRatio: 0.157, branches: { all: 121, woori: 18, shinhan: 21, hana: 17 } },
  { name: "구로구", population: 406000, elderlyRatio: 0.190, branches: { all: 48,  woori: 4,  shinhan: 3,  hana: 5 } },
  { name: "영등포구", population: 394000, elderlyRatio: 0.180, branches: { all: 107, woori: 17, shinhan: 28, hana: 11 } },
  { name: "동작구", population: 385000, elderlyRatio: 0.170, branches: { all: 35,  woori: 9,  shinhan: 2,  hana: 7 } },
  { name: "중랑구", population: 384000, elderlyRatio: 0.200, branches: { all: 38,  woori: 15, shinhan: 3,  hana: 4 } },
  { name: "동대문구", population: 373000, elderlyRatio: 0.200, branches: { all: 64,  woori: 13, shinhan: 13, hana: 13 } },
  { name: "마포구", population: 369000, elderlyRatio: 0.155, branches: { all: 50,  woori: 7,  shinhan: 3,  hana: 9 } },
  { name: "광진구", population: 349000, elderlyRatio: 0.164, branches: { all: 30,  woori: 6,  shinhan: 6,  hana: 6 } },
  { name: "서대문구", population: 317000, elderlyRatio: 0.185, branches: { all: 67,  woori: 15, shinhan: 18, hana: 4 } },
  { name: "도봉구", population: 302000, elderlyRatio: 0.222, branches: { all: 35,  woori: 1,  shinhan: 16, hana: 3 } },
  { name: "강북구", population: 286000, elderlyRatio: 0.232, branches: { all: 22,  woori: 6,  shinhan: 2,  hana: 6 } },
  { name: "성동구", population: 283000, elderlyRatio: 0.170, branches: { all: 45,  woori: 5,  shinhan: 6,  hana: 6 } },
  { name: "금천구", population: 236000, elderlyRatio: 0.190, branches: { all: 44,  woori: 8,  shinhan: 6,  hana: 9 } },
  { name: "용산구", population: 213000, elderlyRatio: 0.190, branches: { all: 51,  woori: 8,  shinhan: 8,  hana: 9 } },
  { name: "종로구", population: 148000, elderlyRatio: 0.210, branches: { all: 91,  woori: 13, shinhan: 11, hana: 13 } },
  { name: "중구",   population: 128000, elderlyRatio: 0.207, branches: { all: 141, woori: 23, shinhan: 31, hana: 15 } }
];

