// UI 목록 수집기(Phase 9b-0, D-032). 기준본 v2.4.1과 재구축 화면의 컨트롤·섹션 제목을 같은 규칙으로 모은다.
// 키: id가 있으면 '#id', 없으면 '섹션 경로 › 태그 › 글자'. 숫자는 '#'으로 바꿔 샘플 값·개수 차이를 무시한다.
// 상태 목록(랙 1개·2개·통로·기둥 선택)은 선택 없음 화면보다 새로 보이는 컨트롤만 기록한다.

/** 브라우저 안에서 실행한다. all=true면 닫힌 대화상자·접힌 영역을 포함한 전체 DOM, false면 보이는 것만. */
export function collectUi(all) {
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const digits = (s) => s.replace(/\d+(?:\.\d+)?/g, '#');
  const visible = (el) => {
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden';
  };
  const where = (el) => {
    const path = [];
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      if (n.matches('dialog')) path.unshift('대화상자:' + clean(n.querySelector('h1,h2,h3')?.textContent || n.id).slice(0, 40));
      else if (n.matches('section,details,aside,header,nav,fieldset')) {
        const h = n.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > summary, :scope > legend, :scope > header h2, :scope > header h3, :scope > div > h2, :scope > div > h3');
        if (h && h !== el) path.unshift(clean(h.textContent).slice(0, 40));
      }
    }
    return digits(path.join(' › '));
  };
  const label = (el) => clean(el.labels?.[0]?.textContent || el.getAttribute('aria-label') || el.closest('label')?.textContent || el.title || el.placeholder || '');
  const text = (el) => clean(el.tagName === 'SELECT' ? [...el.options].map((o) => o.text).join(' | ') : el.tagName === 'INPUT' ? '' : el.textContent);
  const items = new Map();
  for (const el of document.querySelectorAll('button, input, select, textarea, summary, a[href], h1, h2, h3, legend')) {
    if (!all && !visible(el)) continue;
    if (el.type === 'hidden') continue;
    const tag = el.tagName.toLowerCase() + (el.tagName === 'INPUT' ? ':' + el.type : '');
    const t = digits((text(el) || label(el)).slice(0, 80));
    const key = el.id ? '#' + el.id : `${where(el)} › ${tag} › ${t}`;
    if (!items.has(key)) items.set(key, { key, tag, text: t, label: digits(label(el).slice(0, 80)), where: where(el) });
  }
  return [...items.values()];
}

export const SELECTION_STATES = ['rack1', 'rack2', 'aisle', 'column'];

/** 상태별로 새로 보이는 컨트롤. select(page, state)는 화면별 선택 함수. */
export async function collectStates(page, select, clear) {
  await clear(page);
  await page.waitForTimeout(300);
  const base = new Set((await page.evaluate(collectUi, false)).map((r) => r.key));
  const out = {};
  for (const st of SELECTION_STATES) {
    await select(page, st);
    await page.waitForTimeout(400);
    out[st] = (await page.evaluate(collectUi, false)).filter((r) => !base.has(r.key));
    await clear(page);
    await page.waitForTimeout(200);
  }
  return out;
}
