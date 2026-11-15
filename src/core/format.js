// 표시용 숫자 형식. 기준본 fmt()와 같다(경고 문구가 기준본과 일치해야 하므로 형식도 같아야 한다).
export function formatNumber(n, digits = 2) {
  return Number.isFinite(n) ? Number(n.toFixed(digits)).toLocaleString('ko-KR', { maximumFractionDigits: digits }) : '—';
}
