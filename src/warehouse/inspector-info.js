// 선택 정보 패널의 문구·변환 계산(기준본 20·60·90·50 renderInspector 래퍼). DOM 없음.
import { formatNumber as fmt } from '../core/format.js';

/** 폭 × 깊이 × 높이 문구. 값이 없으면 '미확인'(기준본 S.dims 표시). */
export const dimsText = (s) => (s ? [s.width, s.depth, s.height].map((n) => (n === null || n === undefined ? '미확인' : fmt(n, 3) + 'm')).join(' × ') : '미확인');

/** w-box '위치·배치 검사' 세 줄. row는 scanLayout 행, reviewing은 '검토 중' 표시 여부. */
export function placementLines(o, row, reviewing, excessText) {
  const m = o.placementMeta;
  const manual = m?.manualEdited === null ? '이전 자료 · 미확인' : m?.manualEdited ? '예' : '자동 배치';
  const status = row.issues.length ? (reviewing ? '검토 중' : '미해결') : '해결';
  return [`수동 편집: ${manual} / ${m?.waiting ? '외부 대기' : '일반 위치'}`, excessText(row.excess), `${row.issues.map((i) => i.text).join(' / ') || '위반 없음'} · ${status}`];
}

/** 유효 통로 폭 요약 줄(기준본 M.aisleInspector). c는 aisleClearance 결과. */
export const aisleInfoLines = (c) => [
  `${c.enabled ? '검사 사용' : '경고 사용 안 함'} · 단면 ${c.axis.toUpperCase()}`,
  `확보 ${fmt(c.width, 3)}m / 최소 ${fmt(c.min)}m`,
  `부족 ${fmt(c.shortage, 3)}m / 침범 ${c.obstacles.length}개`,
  c.partial ? '지정 랙만 부분 검사' : '모든 랙·고정물 검사',
  `연결: ${c.connected === null ? '미지정·연결성 미검증' : c.connected ? '지정 문 구역과 접촉' : '지정 문 구역과 미연결'}`,
];

/** 통로 검사 범위 ID → 랙 번호 쉼표 목록. */
export const scopeText = (o, objects) => (o.scopeIds || []).map((id) => objects.find((x) => x.id === id)?.code || id).join(',');

/** 랙 번호 쉼표 목록 → ID 배열. 없는 번호가 있으면 null. 빈 문자열은 전체(빈 배열). */
export function parseScope(text, objects) {
  const racks = objects.filter((o) => o.kind === 'rack');
  const ids = text.split(',').map((s) => s.trim()).filter(Boolean).map((code) => racks.find((r) => r.code === code)?.id);
  return ids.some((id) => !id) ? null : ids;
}
