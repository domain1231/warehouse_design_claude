// 랙 목록·검색·필터·범례 문구(기준본 20 match/renderList, 40 EX.searchText/EX.legend, 65 정렬, 80 범례 범위 문구). DOM 없음.
import { ratio } from './constraints.js';
import { formatNumber as fmt } from '../core/format.js';

export const STATE_NAMES = Object.freeze({ empty: '빈 랙', low: '여유', mid: '보통', high: '적재 주의', over: '허용량 초과', unknown: '정보 없음' });

/** Excel 연결 정보 검색 문자열(층·열·로케이션·자재 코드·이름). */
export function excelSearchText(o) {
  const e = o.excel;
  return e ? ` ${e.floor} ${e.column} ${e.key} ${e.shelves.flatMap((s) => s.items.map((i) => `${i.location} ${i.itemCode} ${i.itemName}`)).join(' ')}` : '';
}

/**
 * 목록·도면 흐림 필터(기준본 match). 랙이 아닌 객체는 항상 통과.
 * view: project.panels.view { rackSearch, type, load }
 */
export function matchRack(o, view) {
  if (o.kind !== 'rack') return true;
  const q = (view.rackSearch ?? '').toLowerCase(), t = view.type ?? '', f = view.load ?? 'all', r = ratio(o);
  return (!q || `${o.code} ${o.block}${excelSearchText(o)}`.toLowerCase().includes(q))
    && (!t || o.type === t)
    && (f === 'all' || (f === 'empty' && r === 0) || (f === 'high' && r !== null && r >= 90) || (f === 'over' && r > 100) || (f === 'unknown' && r === null));
}

/** 필터를 통과한 랙과 목록 표시 문자열. 정렬은 기준본처럼 줄 전체 문자열의 한국어 숫자 인식 비교. */
export function rackRows(layout, view) {
  const rows = layout.objects.filter((o) => o.kind === 'rack' && matchRack(o, view)).map((o) => {
    const r = ratio(o);
    const ratioText = r === null ? '미확인' : `${fmt(r, 1)}%`;
    return { id: o.id, object: o, code: o.code, block: o.block, ratioText, unit: o.unit, text: `${o.code} ${o.block}${ratioText} · ${o.unit}` };
  });
  const order = view.rackSort ?? 'original';
  if (order !== 'original') rows.sort((a, b) => a.text.localeCompare(b.text, 'ko', { numeric: true }) * (order === 'codeDesc' ? -1 : 1));
  return rows;
}

export const HEIGHT_POLICY_NOTES = Object.freeze({ weightedMax: '선반별 최대 자재 높이 합 ÷ 선반 높이 합', meanMax: '선반별 최대 자재 높이 비율의 단순 평균', max: '모든 등록 선반의 최대 자재 높이 비율 중 최댓값' });

/** 범례 제목·항목(기준본 40 EX.legend + 80 범위 문구). vizMode: inventory | height | registered | management. */
export function legend(settings) {
  const mode = settings.vizMode ?? 'inventory';
  const title = { inventory: '실제 재고 적재율', height: '높이 활용률', registered: '위치 등록 현황', management: '품목별 관리 정보' }[mode] || '실제 재고 적재율';
  const keys = mode === 'registered' ? ['low', 'unknown'] : mode === 'management' ? ['mid', 'unknown'] : ['empty', 'low', 'mid', 'high', 'over', 'unknown'];
  const range = (k) => ({ empty: '0%', low: `0% 초과 ~ ${fmt(settings.low, 3)}% 미만`, mid: `${fmt(settings.low, 3)}% 이상 ~ ${fmt(settings.high, 3)}% 미만`, high: `${fmt(settings.high, 3)}% 이상 ~ 100% 이하`, over: '100% 초과', unknown: '데이터 없음' })[k];
  const text = (k) => {
    if (mode === 'inventory' || mode === 'height') return `${mode === 'height' ? { empty: '높이 0', low: '여유', mid: '보통', high: '높음', over: '초과', unknown: '미확인' }[k] : STATE_NAMES[k]} (${range(k)})`;
    if (mode === 'registered') return k === 'low' ? '자재 위치 등록' : '등록/실존 미확인';
    return k === 'mid' ? '관리 정보 있음' : '관리 정보 없음';
  };
  return { title, items: keys.map((k) => ({ key: k, color: settings.colors[k], text: text(k) })), note: mode === 'height' ? `집계: ${HEIGHT_POLICY_NOTES[settings.heightPolicy] ?? HEIGHT_POLICY_NOTES.weightedMax} · 동일 선반 자재 높이는 합산하지 않음 · 실재고/부피 비율과 별개` : '' };
}
