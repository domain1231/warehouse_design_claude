// 로케이션 코드 형식(D-049). 의존성 없음: project.js·excel/analyze.js가 함께 쓴다.
// 층F-열-랙-선반-위치. 열은 숫자로 시작해도 됨(예: 2A). 랙 번호는 로마 숫자(I~MMMM, 표준 표기)도 같은 번호로 읽는다.
const LOCATION_RE = /^(\d+)F-(\d*[A-Z]+)-(\d+|[IVXLCDM]+)-(\d+)-(\d+)$/;
const ROMAN = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
const TABLE = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
function toRoman(n) { let out = ''; for (const [v, s] of TABLE) while (n >= v) { out += s; n -= v; } return out; }
export function romanToNumber(r) {
  if (!/^[IVXLCDM]+$/.test(r)) return null;
  let n = 0;
  for (let i = 0; i < r.length; i++) { const a = ROMAN[r[i]], b = ROMAN[r[i + 1]] ?? 0; n += a < b ? -a : a; }
  return toRoman(n) === r ? n : null;
}
/** 공백 제거·대문자 후 해석. 형식이 틀리면 null. 랙 번호는 숫자로 정규화한다(II → 2). */
export function parseLocationCode(v) {
  const m = String(v ?? '').replace(/\s/g, '').toUpperCase().match(LOCATION_RE);
  if (!m) return null;
  const rack = /^\d+$/.test(m[3]) ? Number(m[3]) : romanToNumber(m[3]);
  if (rack === null) return null;
  const n = [Number(m[1]), rack, Number(m[4]), Number(m[5])];
  if (n.some((x) => !Number.isSafeInteger(x) || x < 1 || x > 1e5)) return null;
  const col = m[2];
  return { floor: `${n[0]}F`, floorNumber: n[0], column: col, rackNumber: n[1], shelfNumber: n[2], position: n[3], key: `${n[0]}F-${col}-${n[1]}`, shelfKey: `${n[0]}F-${col}-${n[1]}-${n[2]}`, location: `${n[0]}F-${col}-${n[1]}-${n[2]}-${n[3]}` };
}
/** v2.4.1이 읽을 수 있는 열 이름(영문자만)인가. */
export const legacyColumn = (col) => /^[A-Z]+$/.test(col);
