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
