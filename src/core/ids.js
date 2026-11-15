// Object ID 생성기.
// 기준본(v2.4.1)은 crypto.randomUUID를 직접 호출해 실행마다 ID가 달라진다.
// 재구축에서는 생성기를 주입 가능하게 만들어, 테스트·Golden Master 비교에서
// 시드를 고정하면 같은 입력이 같은 ID를 만들도록 한다.
// ID는 내부 연결용이며 Excel Key(건물+로케이션)나 표시 코드와 혼용하지 않는다.

export function createIdGenerator({ seed } = {}) {
  if (seed !== undefined) {
    if (typeof seed !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(seed)) {
      throw new TypeError('ID 시드는 1~32자의 영문·숫자·_·- 문자열이어야 합니다.');
    }
    let counter = 0;
    return () => `t-${seed}-${(++counter).toString(36).padStart(6, '0')}`;
  }
  const uuid = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
  if (uuid) return () => uuid();
  // crypto.randomUUID가 없는 환경(일부 file:// 또는 구형 브라우저)의 대체 경로
  let fallbackCounter = 0;
  return () =>
    `id-${Date.now().toString(36)}-${(++fallbackCounter).toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
