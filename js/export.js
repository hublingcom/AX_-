/* ======================================================================
   export.js — Excel(.xlsx) 다운로드 (ExcelJS)
   ====================================================================== */

let lastSimExport = null;
let lastCustomExport = null;

/* ---- 스타일 상수 ---- */
const XLS_STYLE = {
  headerBg: 'FF1F3B57',
  headerFont: 'FFFFFFFF',
  recommendBg: 'FFE8F5EE',
  negativeBg: 'FFFCEBEB',
  borderColor: 'FFD9DCE1',
  mutedFont: 'FF888888'
};
const FMT_WON = '#,##0"원"';
const FMT_MAN = '#,##0"만원"';
const FMT_PCT = '0%';
const FMT_DEC2 = '0.00';

function thinBorder() {
  const side = { style: 'thin', color: { argb: XLS_STYLE.borderColor } };
  return { top: side, left: side, bottom: side, right: side };
}

function styleHeaderRow(ws, rowNum, colCount) {
  for (let c = 1; c <= colCount; c++) {
    const cell = ws.getCell(rowNum, c);
    cell.font = { bold: true, color: { argb: XLS_STYLE.headerFont } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLS_STYLE.headerBg } };
    cell.border = thinBorder();
    cell.alignment = { vertical: 'middle' };
  }
}

function styleDataRow(ws, rowNum, colCount, bgArgb) {
  for (let c = 1; c <= colCount; c++) {
    const cell = ws.getCell(rowNum, c);
    cell.border = thinBorder();
    if (bgArgb) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } };
    }
  }
}

function sanitizeFilename(name) {
  return name
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 40) || '시나리오';
}

function formatDateTime(d) {
  const pad = function (n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function wqCellValue(Wq) {
  return Wq === Infinity ? '포화' : Math.round(Wq * 10) / 10;
}

function wqCellNumFmt(Wq) {
  return Wq === Infinity ? null : '0.0"분"';
}

function setExportButtonState(btnId, enabled) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = !enabled;
}

/* STM_ITM_시뮬레이터_결과_[구이름]_[은행명].xlsx 형식으로 동적 생성 */
function buildFilename(payload) {
  const prefix = 'STM_ITM_시뮬레이터_결과';
  if (payload.type === 'sim') {
    return prefix + '_' + sanitizeFilename(payload.regionName) + '_' +
      sanitizeFilename(payload.bankLabel) + '.xlsx';
  }
  return prefix + '_' + sanitizeFilename(payload.title) + '.xlsx';
}

function summaryItem(label, value, numFmt) {
  return { label: label, value: value, numFmt: numFmt || null };
}

function buildSummaryItems(payload) {
  const items = [
    summaryItem('생성 시각', formatDateTime(payload.exportedAt)),
    summaryItem('시뮬레이터 유형', payload.type === 'sim' ? '구별 시뮬레이터' : '직접 계산기'),
    summaryItem('제목', payload.title)
  ];

  if (payload.type === 'sim') {
    const inp = payload.inputs;
    items.push(
      summaryItem('구', payload.regionName),
      summaryItem('은행', payload.bankLabel),
      payload.bankKey === 'all'
        ? summaryItem('인구', payload.population, '#,##0"명"')
        : summaryItem('지점수', payload.branchCount, '#,##0"개"'),
      summaryItem('λ (명/h)', Math.round(inp.lambdaPerHour * 100) / 100, FMT_DEC2),
      summaryItem('추정 창구인력', inp.baseTellers, '0"명"'),
      summaryItem('평균 서비스시간', Math.round(payload.meanServiceMin * 100) / 100, '0.00"분"'),
      summaryItem('ca²', inp.ca2, FMT_DEC2),
      summaryItem('cs²', inp.cs2, FMT_DEC2),
      summaryItem('키오스크 설치비', inp.capex / 10000, FMT_MAN),
      summaryItem('감축비율 (n대당 1명)', inp.ratio, '0"대당 1명"'),
      summaryItem('현재 슬라이더 n', payload.currentN, '0"대"'),
      summaryItem('SLA 목표', SLA_MIN, '0.0"분"'),
      summaryItem('n* (SLA 충족 최소대수)', payload.nStar, '0"대"'),
      summaryItem('추천 설치대수', payload.bestN, '0"대"'),
      summaryItem('추천 n 연간 순편익', Math.round(payload.bestResult.netBenefit / 10000), FMT_MAN),
      summaryItem('추천 n 평균 대기시간', wqCellValue(payload.bestResult.Wq), wqCellNumFmt(payload.bestResult.Wq)),
      summaryItem('현재 n 연간 순편익', Math.round(payload.currentResult.netBenefit / 10000), FMT_MAN),
      summaryItem('현재 n 평균 대기시간', wqCellValue(payload.currentResult.Wq), wqCellNumFmt(payload.currentResult.Wq)),
      summaryItem('현재 n 이용률 (ρ)', payload.currentResult.rho, FMT_PCT),
      summaryItem('대수별 분석 범위', '2~15대')
    );
    if (payload.results.every(function (r) { return r.Wq === Infinity; })) {
      items.push(summaryItem('참고', '전 구간 포화 가능'));
    }
  } else {
    const inp = payload.inputs;
    items.push(
      summaryItem('시나리오 이름', payload.title),
      summaryItem('λ (명/h)', Math.round(inp.lambdaPerHour * 100) / 100, FMT_DEC2),
      summaryItem('창구(직원) 수', inp.baseTellers, '0"명"'),
      summaryItem('고객 1명 처리시간', inp.serviceMin, '0.00"분"'),
      summaryItem('ca²', inp.ca2, FMT_DEC2),
      summaryItem('cs²', inp.cs2, FMT_DEC2),
      summaryItem('키오스크 설치비', inp.capex / 10000, FMT_MAN),
      summaryItem('감축비율 (n대당 1명)', inp.ratio, '0"대당 1명"'),
      summaryItem('고정 가정', payload.fixedAssumptions),
      summaryItem('SLA 목표', SLA_MIN, '0.0"분"'),
      summaryItem('n* (SLA 충족 최소대수)', payload.nStar, '0"대"'),
      summaryItem('추천 설치대수', payload.bestN, '0"대"'),
      summaryItem('추천 n 연간 순편익', Math.round(payload.bestResult.netBenefit / 10000), FMT_MAN),
      summaryItem('추천 n 평균 대기시간', wqCellValue(payload.bestResult.Wq), wqCellNumFmt(payload.bestResult.Wq)),
      summaryItem('대수별 분석 범위', payload.nStar + '~20대')
    );
  }

  items.push(summaryItem('', ''));
  items.push(summaryItem('면책', 'Sakasegawa G/G/c 근사식 기반 시뮬레이션 결과이며 실제 의사결정 전 검증이 필요합니다.'));
  return items;
}

function detailColumns(isSim) {
  const cols = [
    { key: 'n', header: '설치대수', width: 10, numFmt: '0"대"' },
    { key: 'wq', header: '대기시간_분', width: 12, numFmt: null },
    { key: 'rho', header: '이용률', width: 10, numFmt: FMT_PCT },
    { key: 'net', header: '순편익_원', width: 16, numFmt: FMT_WON },
    { key: 'netMan', header: '순편익_만원', width: 14, numFmt: FMT_MAN },
    { key: 'savings', header: '인건비절감_원', width: 16, numFmt: FMT_WON },
    { key: 'cost', header: '비용합계_원', width: 16, numFmt: FMT_WON },
    { key: 'abandon', header: '이탈손실_원', width: 16, numFmt: FMT_WON },
    { key: 'best', header: '추천', width: 8, numFmt: null }
  ];
  if (isSim) cols.push({ key: 'current', header: '현재선택', width: 8, numFmt: null });
  return cols;
}

function buildDetailTable(payload) {
  const isSim = payload.type === 'sim';
  const columns = detailColumns(isSim);
  const rows = payload.nRange.map(function (n, i) {
    const r = payload.results[i];
    const row = {
      n: n,
      wq: wqCellValue(r.Wq),
      wqNumFmt: wqCellNumFmt(r.Wq),
      rho: r.rho,
      net: r.netBenefit,
      netMan: Math.round(r.netBenefit / 10000),
      savings: r.savings,
      cost: r.costTotal,
      abandon: r.abandonLoss,
      best: n === payload.bestN ? 'Y' : '',
      isRecommended: n === payload.bestN,
      isNegative: r.netBenefit < 0
    };
    if (isSim) row.current = n === payload.currentN ? 'Y' : '';
    return row;
  });
  return { columns: columns, rows: rows };
}

function buildBreakdownRows(payload) {
  const br = payload.bestResult;
  return [
    { label: '인건비 절감', amount: br.savings },
    { label: '설치·운영·준수비용', amount: -br.costTotal },
    { label: '고객 이탈 손실', amount: -br.abandonLoss },
    { label: '연간 순편익', amount: br.netBenefit, isTotal: true }
  ];
}

function chartToBase64(chart) {
  if (!chart || !chart.canvas) return null;
  try {
    const dataUrl = chart.toBase64Image('image/png', 1);
    return dataUrl.replace(/^data:image\/png;base64,/, '');
  } catch (e) {
    return null;
  }
}

async function embedCharts(workbook, payload) {
  const ws = workbook.addWorksheet('차트');
  ws.getColumn(1).width = 80;

  const charts = payload.chartInstances || [];
  const labels = payload.chartLabels || [];
  let row = 0;

  for (let i = 0; i < charts.length; i++) {
    const base64 = chartToBase64(charts[i]);
    if (!base64) continue;

    if (labels[i]) {
      ws.getCell(row + 1, 1).value = labels[i];
      ws.getCell(row + 1, 1).font = { bold: true, size: 12, color: { argb: XLS_STYLE.headerBg } };
      row += 1;
    }

    const imageId = workbook.addImage({
      base64: base64,
      extension: 'png'
    });
    ws.addImage(imageId, {
      tl: { col: 0, row: row },
      ext: { width: 640, height: 320 }
    });
    row += 18;
  }

  if (row === 0) {
    ws.getCell(1, 1).value = '차트를 생성할 수 없습니다.';
  }
}

function writeSummarySheet(workbook, payload) {
  const ws = workbook.addWorksheet('요약');
  ws.getColumn(1).width = 26;
  ws.getColumn(2).width = 34;

  ws.getCell(1, 1).value = '항목';
  ws.getCell(1, 2).value = '값';
  styleHeaderRow(ws, 1, 2);

  buildSummaryItems(payload).forEach(function (item, i) {
    const rowNum = i + 2;
    const labelCell = ws.getCell(rowNum, 1);
    const valueCell = ws.getCell(rowNum, 2);
    labelCell.value = item.label;
    valueCell.value = item.value;
    if (item.numFmt) valueCell.numFmt = item.numFmt;
    labelCell.border = thinBorder();
    valueCell.border = thinBorder();
    if (item.label === '면책') {
      labelCell.font = { italic: true, color: { argb: XLS_STYLE.mutedFont } };
      valueCell.font = { italic: true, color: { argb: XLS_STYLE.mutedFont } };
    }
  });
}

function writeDetailSheet(workbook, payload) {
  const ws = workbook.addWorksheet('대수별_결과');
  const detail = buildDetailTable(payload);

  detail.columns.forEach(function (col, i) {
    ws.getColumn(i + 1).width = col.width;
    ws.getCell(1, i + 1).value = col.header;
  });
  styleHeaderRow(ws, 1, detail.columns.length);

  detail.rows.forEach(function (row, i) {
    const rowNum = i + 2;
    detail.columns.forEach(function (col, ci) {
      const cell = ws.getCell(rowNum, ci + 1);
      cell.value = row[col.key];
      const fmt = col.key === 'wq' ? row.wqNumFmt : col.numFmt;
      if (fmt) cell.numFmt = fmt;
    });
    const bg = row.isRecommended ? XLS_STYLE.recommendBg : (row.isNegative ? XLS_STYLE.negativeBg : null);
    styleDataRow(ws, rowNum, detail.columns.length, bg);
  });
}

function writeBreakdownSheet(workbook, payload) {
  const ws = workbook.addWorksheet('비용분해');
  ws.getColumn(1).width = 24;
  ws.getColumn(2).width = 18;

  ws.getCell(1, 1).value = '항목';
  ws.getCell(1, 2).value = '금액_원';
  styleHeaderRow(ws, 1, 2);

  buildBreakdownRows(payload).forEach(function (row, i) {
    const rowNum = i + 2;
    const labelCell = ws.getCell(rowNum, 1);
    const amountCell = ws.getCell(rowNum, 2);
    labelCell.value = row.label;
    amountCell.value = row.amount;
    amountCell.numFmt = FMT_WON;
    if (row.isTotal) {
      labelCell.font = { bold: true };
      amountCell.font = { bold: true };
    }
    const bg = row.isTotal ? (row.amount >= 0 ? XLS_STYLE.recommendBg : XLS_STYLE.negativeBg) : null;
    styleDataRow(ws, rowNum, 2, bg);
  });
}

async function buildWorkbook(payload) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'STM/ITM 시뮬레이터';

  writeSummarySheet(workbook, payload);
  writeDetailSheet(workbook, payload);
  writeBreakdownSheet(workbook, payload);
  await embedCharts(workbook, payload);

  return workbook;
}

async function downloadWorkbook(payload) {
  if (typeof ExcelJS === 'undefined') {
    alert('Excel 라이브러리를 불러오지 못했습니다.');
    return;
  }
  const workbook = await buildWorkbook(payload);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = buildFilename(payload);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function runExport(payload, btnId) {
  if (!payload || !payload.nRange || payload.nRange.length === 0) return;
  const btn = btnId ? document.getElementById(btnId) : null;
  if (btn) btn.disabled = true;
  try {
    await downloadWorkbook(payload);
  } catch (e) {
    console.error(e);
    alert('Excel 파일 생성 중 오류가 발생했습니다.');
  } finally {
    if (btn) {
      setTimeout(function () { setExportButtonState(btnId, true); }, 500);
    }
  }
}

function exportSimResults() {
  runExport(lastSimExport, 'exportSimBtn');
}

function exportCustomResults() {
  runExport(lastCustomExport, 'exportCustomBtn');
}
