// JSON 값 비교(DOM 없음). JSON.stringify(a) === JSON.stringify(b)와 같은 판정(키 순서 포함, undefined 속성 무시)을
// 문자열을 만들지 않고 구조로 한다. 같은 객체를 공유하는 부분은 즉시 같다고 본다(D-096 성능).

/** JSON으로 썼을 때 같은 값인지(키 순서 포함). */
export function deepSame(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return typeof a === 'number' && typeof b === 'number' && Number.isNaN(a) && Number.isNaN(b);
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepSame(a[i], b[i])) return false;
    return true;
  }
  const ka = Object.keys(a).filter((k) => a[k] !== undefined), kb = Object.keys(b).filter((k) => b[k] !== undefined);
  if (ka.length !== kb.length) return false;
  for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i] || !deepSame(a[ka[i]], b[kb[i]])) return false;
  return true;
}
