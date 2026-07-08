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
