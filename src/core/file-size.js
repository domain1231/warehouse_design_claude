// E3(D-088): 파일 크기 문구. 종류·실제 크기·상한을 MB(십진, 1MB = 1,000,000바이트)와
// Windows 탐색기 기준 KB(1KB = 1,024바이트, 올림 — 탐색기 '크기' 열과 같은 값)로 함께 보여주고 해결 방법 한 줄을 붙인다. DOM 없음.

const mbNum = (n) => { const v = n / 1e6; return Number.isInteger(v) ? String(v) : v.toFixed(1); };
/** 탐색기 '크기' 열과 같은 KB 표기(예: 13,058KB). */
export const explorerKb = (n) => Math.ceil(n / 1024).toLocaleString('en-US') + 'KB';
/** 예: 13.4MB(탐색기 13,058KB) */
export const sizeText = (n) => `${mbNum(n)}MB(탐색기 ${explorerKb(n)})`;

export const SIZE_HINTS = Object.freeze({
  project: '앱에서 작은 JSON으로 저장하면(저장소 관리 → JSON 저장 형식) 약 절반 크기가 되고, 이력(배치·Excel 스냅샷, 자동 배치 이력)을 정리하면 더 줄어듭니다.',
  image: '해상도를 낮추거나 JPEG로 저장해 4MB 이하로 줄인 뒤 다시 넣으세요.',
  inventory: '기간을 나눠 여러 파일로 불러오세요.',
  workbook: '필요한 시트·행만 남긴 사본으로 저장해 크기를 줄이세요.',
});

/** 예: '프로젝트 JSON 25.1MB(탐색기 24,512KB) · 상한 24MB(탐색기 23,438KB) 초과 — <해결 방법>' */
export function tooLargeText(kind, bytes, limit, hint) {
  return `${kind} ${sizeText(bytes)} · 상한 ${sizeText(limit)} 초과 — ${hint}`;
}
