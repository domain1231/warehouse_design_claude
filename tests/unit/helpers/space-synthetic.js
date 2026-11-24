import assert from 'node:assert/strict';

/** 랙 56개(7랙×7행 + 49랙×6행 = 343행). 높은 행 Q=0.95, 낮은 행 Q=l. l은 평균 용적률이 목표가 되도록 푼다. */
export function synthetic({ F4, low }) {
  const racks = Array.from({ length: 56 }, (_, i) => ({ col: 'ABCDEFGH'[Math.floor(i / 7)], no: (i % 7) + 1, n: i < 7 ? 7 : 6 }));
  const total = racks.reduce((a, r) => a + r.n, 0), high = total - low, h = 0.95;
  // 높은 행을 랙마다 고르게(행 순서대로 돌아가며) 배정
  const k = racks.map(() => 0);
  for (let j = 0, i = 0; j < high; j++, i = (i + 1) % racks.length) { while (k[i] >= racks[i].n) i = (i + 1) % racks.length; k[i]++; }
  const A = racks.reduce((a, r, i) => a + (h * k[i]) / r.n, 0) / racks.length;
  const B = racks.reduce((a, r, i) => a + (r.n - k[i]) / r.n, 0) / racks.length;
  const l = (F4 - A) / B;
  assert.ok(l >= 0 && l < 0.8, `가상 값 범위 l=${l}`);
  const rows = [];
  racks.forEach((r, i) => {
    // 랙 면적 합 54.0436㎡: 52랙 1000×1000mm, 4랙 1000×510.9mm
    const depth = i < 52 ? 1000 : 510.9;
    for (let s = 1; s <= r.n; s++) rows.push({ location: `7F-${r.col}-${r.no}-${s}-1`, shelfHeight: 1000, materialHeight: (s <= k[i] ? h : l) * 1000, rackWidth: 1000, rackDepth: depth, rackHeight: 2000 });
  });
  return rows;
}

/**
 * GT-EMPTY(로드맵 6.5, C10·C8): 706호AF 빈 랙 예시를 재현하는 가상 데이터. 430행 = 적치 44랙 343행 + 빈 랙 12대(I·J·K 각 4대) 87행.
 * 적치 랙: 앞 9랙 7행·나머지 35랙 8행, 앞 33랙에 낮은 행(Q = l) 하나씩, 나머지 행 Q = 0.9 → 평균 용적률 84.81%, 80% 미만 33.
 * 빈 랙: 품목코드 없음·자재높이 0. 규격 I·J 1580×510mm, K 1530×500mm(빈 랙 면적 9.506㎡).
 * before: true면 같은 랙 구성의 BEFORE(모든 랙 적치, I·J·K는 Q = 0.5, 나머지 Q = 0.6).
 */
export function syntheticEmpty({ F4 = 0.8481, low = 33, before = false } = {}) {
  const stocked = Array.from({ length: 44 }, (_, i) => ({ col: 'ABCDEFG'[Math.floor(i / 7)], no: (i % 7) + 1, n: i < 9 ? 7 : 8, w: 1000, d: 1000 }));
  const empty = ['I', 'J', 'K'].flatMap((col) => [1, 2, 3, 4].map((no) => ({ col, no, n: no === 4 ? 8 : 7, w: col === 'K' ? 1530 : 1580, d: col === 'K' ? 500 : 510, empty: true })));
  const h = 0.9, S = stocked.slice(0, low).reduce((a, r) => a + 1 / r.n, 0);
  const l = h - ((h - F4) * stocked.length) / S;
  assert.ok(l >= 0 && l < 0.8, `가상 값 범위 l=${l}`);
  const racks = [...stocked, ...empty].map((r, i) => {
    const rows = [];
    for (let s = 1; s <= r.n; s++) {
      const q = before ? (r.empty ? 0.5 : 0.6) : r.empty ? 0 : i < low && s === 1 ? l : h;
      rows.push({ location: `7F-${r.col}-${r.no}-${s}-1`, itemCode: before || !r.empty ? `P${i}-${s}` : '', shelfHeight: 1000, materialHeight: q * 1000, rackWidth: r.w, rackDepth: r.d, rackHeight: 2000 });
    }
    return { ...r, rows };
  });
  return { racks, rows: racks.flatMap((r) => r.rows) };
}
