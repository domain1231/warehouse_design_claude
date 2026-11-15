// e2e 공용: 선택·체크박스 등으로 레이아웃(툴바 줄바꿈·sizeWork)이 바뀐 뒤 도면 좌표계가 정착할 때까지 기다린다.
/** #plan의 화면 CTM·경계 상자가 연속 3프레임 동일해질 때까지 대기한다(최대 2초). */
export async function waitPlanStable(page) {
  await page.evaluate(() => new Promise((resolve) => {
    const svg = document.querySelector('[data-testid=plan]');
    const key = () => {
      const m = svg.getScreenCTM();
      const r = svg.getBoundingClientRect();
      return [m.a, m.d, m.e, m.f, r.x, r.y, r.width, r.height].map((v) => v.toFixed(3)).join(',');
    };
    const t0 = performance.now();
    let last = key(), same = 0;
    const tick = () => {
      const k = key();
      same = k === last ? same + 1 : 0;
      last = k;
      if (same >= 3 || performance.now() - t0 > 2000) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
}
