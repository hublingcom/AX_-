/* ======================================================================
   4. 핵심 계산 함수 (Sakasegawa G/G/c 근사식 + SLA 최적화)
   ====================================================================== */
function sakasegawaWq(lambdaPerMin, muPerMin, n, ca2, cs2) {
  const rho = lambdaPerMin / (n * muPerMin);
  if (rho >= 1) return { Wq: Infinity, rho: rho };
  const exponent = Math.sqrt(2 * (n + 1)) - 1;
  const Wq = ((ca2 + cs2) / 2) * (Math.pow(rho, exponent) / (n * (1 - rho))) * (1 / muPerMin);
  return { Wq: Wq, rho: rho };
}

function findNStar(lambdaPerHour, muPerMin, ca2, cs2, nMax) {
  const lambdaPerMin = lambdaPerHour / 60;
  for (let n = 2; n <= nMax; n++) {
    const r = sakasegawaWq(lambdaPerMin, muPerMin, n, ca2, cs2);
    if (r.Wq <= SLA_MIN) return n;
  }
  return nMax;
}

// 핵심: 인력감축은 n이 아니라 effectiveN = min(n, nStar)에 연동
function computeForN(n, lambdaPerHour, muPerMin, baseTellers, ca2, cs2, capex, reductionRatio, nStar) {
  const lambdaPerMin = lambdaPerHour / 60;
  const wqResult = sakasegawaWq(lambdaPerMin, muPerMin, n, ca2, cs2);
  const Wq = wqResult.Wq;
  const rho = wqResult.rho;
  const pAbandon = (Wq === Infinity) ? 1 : 1 / (1 + Math.exp(-(Wq - ABANDON_CENTER_MIN) / ABANDON_SLOPE));

  const effectiveN = Math.min(n, nStar);
  const reducible = Math.floor(effectiveN / reductionRatio);
  const remainingStaff = Math.max(1, baseTellers - Math.min(baseTellers - 1, reducible));
  const tellersSaved = baseTellers - remainingStaff;

  const dailyVisits = Math.round(lambdaPerHour * OPERATING_HOURS);
  const savings = tellersSaved * TELLER_WAGE_ANNUAL;
  const capexAnnual = (capex * n) / KIOSK_DEPRECIATION_YEARS;
  const opexAnnual = KIOSK_OPEX_MONTHLY * 12 * n;
  const complianceCost = COMPLIANCE_COST_PER_UNIT * n;
  const abandonLoss = (Wq === Infinity) ? dailyVisits * 365 * LOSS_PER_ABANDON : dailyVisits * 365 * pAbandon * LOSS_PER_ABANDON;
  const costTotal = capexAnnual + opexAnnual + complianceCost;
  const netBenefit = savings - costTotal - abandonLoss;

  return { Wq: Wq, rho: rho, netBenefit: netBenefit, savings: savings, costTotal: costTotal, abandonLoss: abandonLoss };
}

// 선택된 구 + 은행으로부터 시뮬레이션 파라미터(λ, μ, baseTellers, ca2, cs2)를 구성
function buildParams(region, bankKey) {
  const bank = BANKS[bankKey];
  const meanServiceMin = ANCHOR_ELDERLY_RATIO * bank.muElderly + (1 - ANCHOR_ELDERLY_RATIO) * bank.muGeneral;
  const muPerMin = 1 / meanServiceMin;

  let lambdaPerHour, baseTellers, branchCount;

  if (bankKey === 'all') {
    const visitRate = bank.anchorLambda / bank.anchorPop * 1000;
    lambdaPerHour = visitRate * region.population / 1000;
    branchCount = region.branches.all;
    baseTellers = Math.max(2, Math.round((branchCount / bank.anchorBranches) * bank.anchorTellers));
  } else {
    branchCount = region.branches[bankKey];
    if (branchCount === 0) {
      return { valid: false };
    }
    lambdaPerHour = bank.anchorLambda * (branchCount / bank.anchorBranches);
    baseTellers = Math.max(1, Math.round(bank.anchorTellers * (branchCount / bank.anchorBranches)));
  }

  return { valid: true, lambdaPerHour: lambdaPerHour, muPerMin: muPerMin, baseTellers: baseTellers, ca2: bank.ca2, cs2: bank.scv, branchCount: branchCount };
}
