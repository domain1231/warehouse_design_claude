// 표시용 숫자 형식. 기준본 fmt()와 같다(경고 문구가 기준본과 일치해야 하므로 형식도 같아야 한다).
/** D-077: 시각 표시. 저장 형식(ISO·UTC)은 그대로 두고 화면에는 한국 시각으로 보인다(헤더 '마지막 확인 저장'과 같은 형식).
 *  해석할 수 없는 값은 원문을 그대로, 값이 없으면 missing을 돌려준다. */
export const formatTime = (v, missing = '미확인') => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : (v ? String(v) : missing));
/** 표시 시각 + 원래 ISO를 title로(추적용). HTML 문자열. */
export const timeHtml = (v, missing, escFn) => (v ? `<span title="${escFn(String(v))}">${escFn(formatTime(v, missing))}</span>` : escFn(missing));

export function formatNumber(n, digits = 2) {
  return Number.isFinite(n) ? Number(n.toFixed(digits)).toLocaleString('ko-KR', { maximumFractionDigits: digits }) : '—';
}
