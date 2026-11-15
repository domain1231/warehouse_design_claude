// 랙 상세 인포그래픽(기준본 65 S.items·S.height·S.filtered·S.infoSvg·S.renderInfo, 40 EX.fields). DOM 없음.
// 선반·자재 위치는 Excel 원본 계층만 쓴다. 선반 수·빈 선반·현재고는 추정하지 않는다.
import { ratio } from './constraints.js';
import { formatNumber as fmt } from '../core/format.js';
import { esc } from '../cad/scene.js';

/** Excel 원본 열(키, 표시 이름). 자재 상세·CSV 내보내기 순서. */
export const EXCEL_FIELD_LABELS = Object.freeze([
  ['rowNo', 'No.'], ['location', '로케이션'], ['itemCode', '품목코드'], ['itemName', '품목명'], ['specification', '규격'],
  ['reorderPoint', 'ROP'], ['maxStock', 'MAX Stock'], ['averageInbound3M', '3개월 평균 입고수량'], ['shelfLevel', 'Rack 단수'], ['mixedItemCount', '혼적수'],
  ['rackWidth', 'Rack 가로 (mm)'], ['rackDepth', 'Rack 세로 (mm)'], ['rackHeight', 'Rack 높이 (mm)'], ['shelfHeight', 'Rack 단 높이 (mm)'], ['materialHeight', '자재높이 (mm)'],
  ['heightUtilization', '용적률(%)'], ['rackUtilizationSource', '랙 용적률(%)'], ['sourceUsedArea', '사용 면적(m2)'], ['sourceRemainingSpace', '유휴 공간'], ['note', '비고'],
]);

/** SVG 이름공간(네트워크 요청이 아님. 내려받는 SVG 파일에 필요). */
export const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const SPEC_MESSAGE = '도면상의 랙 규격이 Excel 원본 규격과 다릅니다. 실제 설비 변경 여부를 확인하십시오.';

export const rackItems = (o) => (o?.excel?.shelves || []).flatMap((s) => s.items);
/** 자재 높이 ÷ 선반 높이(%). 값이 없으면 null(현재고·부피 비율이 아님). */
export const heightRatio = (i) => (Number.isFinite(i.materialHeight) && i.shelfHeight > 0 ? (i.materialHeight / i.shelfHeight) * 100 : null);

/** 선반 필터·검색을 적용한 선반 목록(자재는 위치 번호순). info = { shelf: '' | '<level>', search } */
export function filteredShelves(o, info) {
  const q = (info.search ?? '').toLocaleLowerCase();
  return (o?.excel?.shelves || []).filter((s) => !info.shelf || String(s.level) === info.shelf).map((s) => ({
    ...s,
    items: [...s.items].sort((a, b) => a.position - b.position).filter((i) => !q || [i.itemCode, i.itemName, i.location].some((v) => String(v || '').toLocaleLowerCase().includes(q))),
  }));
}

/** 원본 규격과 다를 때 안내 문구(기준본 60 S.warning·S.specMessage). */
export function specWarning(o) {
  return o.originalSpec?.origin === 'excel' ? SPEC_MESSAGE : '도면상의 랙 규격이 등록 당시 설계 규격과 다릅니다. 실제 설비 치수는 미확인입니다.';
}

/**
 * 선반별 논리적 자재 위치 SVG(내려받기 가능). shelfOrder: 'bottom'(아래→위) | 'top'.
 * info = { shelf, item, search }
 */
export function rackInfoSvg(o, { shelfOrder = 'bottom', info = { shelf: '', item: null, search: '' } } = {}) {
  if (!o) return '';
  const shelves = filteredShelves(o, info).slice().sort((a, b) => a.level - b.level);
  if (shelfOrder === 'bottom') shelves.reverse();
  const width = 1020, rowHeight = 158, height = Math.max(320, 195 + shelves.length * rowHeight), q = (info.search ?? '').toLowerCase();
  const r0 = ratio(o);
  let svg = `<svg xmlns="${SVG_NAMESPACE}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="선반별 논리적 자재 배치"><rect width="100%" height="100%" fill="#101b29"/><g font-family="Malgun Gothic,Segoe UI,sans-serif"><text x="25" y="32" font-size="21" fill="#eff5ff">${esc(o.code)} · 선반별 논리적 자재 위치</text><text x="25" y="59" font-size="13" fill="#b9cde5">카드 폭·간격: 논리적 표시 / 막대: 자재높이 ÷ 선반높이 / 현재고 ${r0 === null ? '미확인' : fmt(r0, 1) + '%'}</text><text x="25" y="83" font-size="12" fill="#b9cde5">선반 번호 ${shelfOrder === 'bottom' ? '아래 → 위' : '위 → 아래'} (사용자 설정 · 실물 방향 미확인) · 기준일 ${esc(o.excel?.asOfDate || '미확인')}</text>`;
  if (!shelves.length) svg += '<text x="30" y="170" fill="#c1d1e6" font-size="17">등록된 선반 데이터 없음 · 선반 수와 빈 선반은 추정하지 않습니다.</text>';
  shelves.forEach((s, n) => {
    const y = 105 + n * rowHeight, items = s.items, cardWidth = Math.min(260, 830 / Math.max(1, items.length));
    svg += `<g class="s-shelf" data-shelf="${s.level}"><rect x="20" y="${y}" width="980" height="${rowHeight - 8}" rx="7" fill="${info.shelf === String(s.level) ? '#203c58' : '#162537'}" stroke="#3d5977"/><text x="30" y="${y + 28}" font-size="17" fill="#dcecff">${s.level}번 선반</text><text x="30" y="${y + 52}" font-size="12" fill="#9db3ce">${items.length} 위치</text>`;
    if (!items.length) svg += `<text x="165" y="${y + 70}" fill="#acbdd0" font-size="14">${q ? '검색 일치 자재 없음' : s.emptyConfirmed ? '사용자 확인 빈 선반' : '자재 미등록 · 비어 있는지 미확인'}</text>`;
    items.forEach((i, j) => {
      const x = 155 + j * cardWidth, r = heightRatio(i), color = r === null ? '#7990aa' : r > 100 ? '#fb7c8b' : r >= 90 ? '#f9bc60' : '#66c6b9', sel = info.item === i.location;
      svg += `<g class="s-item ${sel ? 's-selected' : ''}" data-item="${esc(i.location)}"><rect x="${x}" y="${y + 12}" width="${cardWidth - 8}" height="112" rx="6" fill="#20364d" stroke="${sel ? '#72caff' : '#46627e'}"/><text x="${x + 8}" y="${y + 33}" fill="#8fd3ff" font-size="13">${esc(i.position)}번 · ${esc(i.itemCode || '품목코드 미확인')}</text><text x="${x + 8}" y="${y + 54}" fill="#eff5ff" font-size="13">${esc(String(i.itemName || '품목명 미확인').slice(0, Math.max(5, Math.floor(cardWidth / 12))))}</text><text x="${x + 8}" y="${y + 73}" fill="#b1c6dc" font-size="11">${esc(i.location)}</text><rect x="${x + 8}" y="${y + 83}" width="${cardWidth - 26}" height="7" fill="#0e1b29"/><rect x="${x + 8}" y="${y + 83}" width="${((cardWidth - 26) * Math.min(100, Math.max(0, r || 0))) / 100}" height="7" fill="${color}"/><text x="${x + 8}" y="${y + 108}" fill="${color}" font-size="12">높이 ${r === null ? '미확인' : fmt(r, 1) + '%'}${r > 100 ? ' · 초과' : ''}</text></g>`;
    });
    svg += `<text x="160" y="${y + 141}" fill="#9fb4ce" font-size="10">자재 위치 번호순 · 누락 번호는 미등록 / 실측 점유 크기·현재고 추정 안 함</text></g>`;
  });
  svg += `<text x="25" y="${height - 27}" fill="#a6bfd8" font-size="12">높이 활용률: 미확인 회색 / 90% 미만 청록 / 90~100% 주황 / 100% 초과 빨강 · 실제 적재율과 별개</text></g></svg>`;
  return svg;
}

const dimsText = (s) => (s ? [s.width, s.depth, s.height].map((v) => (v === null || v === undefined ? '미확인' : fmt(v, 3) + 'm')).join(' × ') : '미확인');

/** 상세 요약 항목 [이름, 값] (기준본 sInfoSummary). */
export function rackSummary(o) {
  const items = rackItems(o), shelves = o.excel?.shelves || [];
  const r = ratio(o);
  return [
    ['위치', o.excel ? [o.excel.building, o.excel.floor + 'F', o.excel.column + '열', o.excel.rackNumber + '번째 랙'].join(' / ') : 'Excel 연결 없음'],
    ['설계', dimsText({ width: o.width, depth: o.depth, height: o.height ?? null })],
    ['원본', dimsText(o.originalSpec)],
    ['등록 선반', shelves.length],
    ['자재 위치', items.length],
    ['고유 품목', new Set(items.map((i) => i.itemCode).filter(Boolean)).size],
    ['현재 적재율', r === null ? '미확인' : fmt(r, 1) + '%'],
    ['출처', o.excel?.sourceFile || o.originalSpec?.source || '미확인'],
    ['기준일', o.excel?.asOfDate || '미확인'],
  ];
}

/** 선택 자재의 원본 정보 [이름, 값] + 계산 높이 활용률. 빈 값은 '미확인'. */
export function itemDetail(i) {
  const r = heightRatio(i);
  return [
    ...EXCEL_FIELD_LABELS.map(([k, label]) => [label, i[k] === null || i[k] === '' || i[k] === undefined ? '미확인' : String(i[k])]),
    ['계산 높이 활용률', `${r === null ? '미확인' : fmt(r, 2) + '%'} (자재높이 ÷ 선반높이)`],
    ['현재고', '미확인 · ROP/MAX/평균입고와 별개'],
    ['원본 행', String(i.sourceRow ?? '미확인')],
  ];
}

/** CSV 내보내기 행(머리글 포함). */
export function rackCsvRows(o, info) {
  return [
    [...EXCEL_FIELD_LABELS.map((f) => f[1]), '계산 높이 활용률 %', '원본 행', '기준일'],
    ...filteredShelves(o, info).flatMap((s) => s.items).map((i) => [...EXCEL_FIELD_LABELS.map(([k]) => i[k]), heightRatio(i), i.sourceRow, o.excel?.asOfDate || '미확인']),
  ];
}

/** CSV 문자열(BOM, 큰따옴표, CRLF). 기준본 csvEncode. */
export const csvEncode = (rows) => '﻿' + rows.map((r) => r.map((v) => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\r\n');

/** 실제 설비 변경 확인 명령(기준본 65 sPhysical): 현재 설계 치수를 실제 설비로 확인 기록. */
export const PHYSICAL_COMMAND = '실제 설비 변경 사용자 확인';
export const confirmPhysical = (id, time, entryId) => (draft, layout) => {
  const o = layout.objects.find((x) => x.id === id);
  if (!o) return;
  const dims = { width: o.width, depth: o.depth, height: o.height ?? null };
  o.physicalConfirmation = { time, dimensions: dims, source: '사용자 직접 확인' };
  draft.specificationHistory.push({ id: entryId, time, rackId: o.id, code: o.code, scenario: draft.settings.scenario, type: 'physical-confirmed', before: dims, after: dims, source: '사용자 직접 확인' });
  draft.specificationHistory = draft.specificationHistory.slice(-500);
};
