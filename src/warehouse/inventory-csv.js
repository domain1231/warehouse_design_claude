// 재고 CSV 가져오기(기준본 70 importCsv)와 현재 재고·배치 저장(기준본 30 saveSnapshot). DOM 없음.
// 재고는 실제 입력만 쓴다: 빈 수량·최대 수량은 null(미확인)이며 ROP·MAX·높이 활용률로 채우지 않는다.
import { dateOK, finite } from '../core/project.js';

const ALIASES = Object.freeze({ '날짜': 'date', '랙ID': 'rackId', '랙아이디': 'rackId', '최대수량': 'capacity', '현재수량': 'quantity', '단위': 'unit', '출처': 'source' });
const REQUIRED = ['date', 'rackId', 'capacity', 'quantity', 'unit'];
export const DEFAULT_CSV_SOURCE = 'CSV 사용자 제공';

/** 기준본 csvParse: 따옴표·줄바꿈 칸 지원, 빈 줄 무시. */
export function csvParse(text) {
  text = text.replace(/^﻿/, '');
  const rows = [];
  let row = [], s = '', quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { s += '"'; i++; } else { quoted = false; closed = true; }
      } else s += c;
    } else if (c === '"') {
      if (s || closed) throw new Error('CSV 따옴표 위치 오류');
      quoted = true;
    } else if (c === ',' || c === '\n' || c === '\r') {
      row.push(s);
      s = '';
      closed = false;
      if (c !== ',') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        if (row.some((v) => v !== '')) rows.push(row);
        row = [];
      }
    } else {
      if (closed) throw new Error('CSV 닫는 따옴표 뒤에 잘못된 문자가 있습니다.');
      s += c;
    }
  }
  if (quoted) throw new Error('CSV 따옴표가 닫히지 않았습니다.');
  if (s || row.length || closed) {
    row.push(s);
    if (row.some((v) => v !== '')) rows.push(row);
  }
  return rows;
}

const nullable = (v) => (v === '' ? null : Number(v));

/**
 * 재고 CSV → 새 inventoryHistory(배열) 와 가져온 행 수. 하나라도 오류면 던지고 project는 바꾸지 않는다(전부 아니면 전무).
 * 같은 배치·날짜·랙 기록은 replace일 때만 교체한다. 파일 안의 중복도 차단한다.
 */
export function parseInventoryCsv(text, project, { replace = false } = {}) {
  const rows = csvParse(text);
  const heads = rows.shift()?.map((s) => ALIASES[s.trim()] || s.trim());
  if (!heads || !REQUIRED.every((k) => heads.includes(k))) throw new Error('필수 재고 CSV 머리글 오류');
  const target = project.settings.scenario;
  const known = new Map([...project.scenarios[target].objects, ...project.layoutSnapshots.filter((s) => s.scenario === target).flatMap((s) => s.layout.objects)].map((o) => [o.id, o]));
  const map = new Map(project.inventoryHistory.map((r) => [`${r.scenario}|${r.date}|${r.rackId}`, r]));
  const seen = new Set();
  for (const row of rows) {
    if (row.length !== heads.length) throw new Error('CSV 열 개수 오류');
    const r = Object.fromEntries(heads.map((k, i) => [k, row[i].trim()]));
    if (r.scenario && r.scenario !== target) throw new Error('CSV 배치와 현재 편집안이 다릅니다.');
    if (!dateOK(r.date) || !known.has(r.rackId) || known.get(r.rackId).unit !== r.unit) throw new Error('CSV 날짜·랙 ID·단위 오류');
    const key = `${target}|${r.date}|${r.rackId}`;
    if (seen.has(key) || (map.has(key) && !replace)) throw new Error('중복 기록 · 교체 허용을 확인하세요.');
    seen.add(key);
    const value = { date: r.date, rackId: r.rackId, unit: r.unit, source: r.source || DEFAULT_CSV_SOURCE, scenario: target };
    for (const k of ['quantity', 'capacity']) {
      value[k] = nullable(r[k]);
      if (value[k] !== null) finite(value[k], k, 0, 1e12);
    }
    map.set(key, value);
  }
  return { history: [...map.values()], count: rows.length };
}

/** 가져오기 명령: 미리 검증한 이력으로 교체. */
export const importInventory = (history) => (draft) => { draft.inventoryHistory = history; };

/** 현재 편집안 랙의 같은 날짜 재고 기록(또는 includeLayout일 때 같은 날짜·편집안 배치)이 이미 있는가. */
export function inventorySnapshotExists(p, date, includeLayout) {
  const k = p.settings.scenario, ids = new Set(p.scenarios[k].objects.filter((o) => o.kind === 'rack').map((o) => o.id));
  return p.inventoryHistory.some((s) => s.date === date && ids.has(s.rackId)) || (includeLayout && p.layoutSnapshots.some((s) => s.date === date && s.scenario === k));
}

/** 현재 재고·배치 저장: 현재 편집안 랙마다 재고 기록(같은 날짜·랙은 교체), includeLayout이면 배치 이력도 함께. */
export const saveInventorySnapshot = ({ id, date, source, includeLayout, recordedAt }) => (draft) => {
  const k = draft.settings.scenario, layout = draft.scenarios[k], racks = layout.objects.filter((o) => o.kind === 'rack'), ids = new Set(racks.map((o) => o.id));
  draft.inventoryHistory = draft.inventoryHistory.filter((s) => !(s.date === date && ids.has(s.rackId) && s.scenario === k));
  for (const o of racks) draft.inventoryHistory.push({ date, rackId: o.id, capacity: o.capacity ?? null, quantity: o.quantity ?? null, unit: o.unit, source, scenario: k });
  if (includeLayout) {
    draft.layoutSnapshots = draft.layoutSnapshots.filter((s) => !(s.date === date && s.scenario === k));
    draft.layoutSnapshots.push({ id, name: draft.metadata.name, date, recordedAt, source, scenario: k, layout: structuredClone(layout) });
  }
};
