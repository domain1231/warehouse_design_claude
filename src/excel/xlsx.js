// XLSX·CSV 읽기(외부 라이브러리 없음, D-017). 기준본은 SheetJS(XLSX.read + sheet_to_json raw, defval null, blankrows)를 썼다.
// 여기서는 같은 결과(원시 값 행렬)를 만드는 최소 구현만 둔다: ZIP 중앙 디렉터리 → deflate-raw 해제 → 워크북·공유 문자열·시트 XML.
// 수식은 계산하지 않고 저장된 결과값(<v>)을 쓴다. 날짜는 Excel 일련번호(숫자) 그대로 둔다(raw).
// 브라우저와 Node(18+) 모두 DecompressionStream을 쓴다. DOM이 필요 없다.

import { tooLargeText, SIZE_HINTS } from '../core/file-size.js';
export const MAX_FILE_BYTES = 12e6;
export const SHEET_ROWS = 20010; // 기준본 sheetRows

export class WorkbookError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WorkbookError';
  }
}

// ── ZIP ───────────────────────────────────────────────────────────────

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** ZIP 항목 목록 { name → () => Promise<Uint8Array> }. 암호화·ZIP64는 지원하지 않는다. */
export function readZip(buffer) {
  const u8 = new Uint8Array(buffer);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 22 - 0xffff); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new WorkbookError('정상적인 XLSX 압축 파일이 아닙니다. 암호화 파일은 지원하지 않습니다.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const entries = new Map();
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new WorkbookError('XLSX 압축 목록이 손상되었습니다.');
    const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true), nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (flags & 1) throw new WorkbookError('암호화된 XLSX 파일은 지원하지 않습니다.');
    entries.set(name, async () => {
      if (dv.getUint32(local, true) !== 0x04034b50) throw new WorkbookError('XLSX 압축 항목이 손상되었습니다.');
      const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
      const data = u8.subarray(start, start + csize);
      if (method === 0) return data;
      if (method === 8) return inflateRaw(data);
      throw new WorkbookError('지원하지 않는 XLSX 압축 방식입니다.');
    });
  }
  return entries;
}

// ── XML(필요한 부분만) ────────────────────────────────────────────────

/** XML 엔터티와 Excel의 _xHHHH_ 이스케이프를 푼다. */
export function unescapeXml(s) {
  return s
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => {
      if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e.toLowerCase()];
    })
    .replace(/_x([0-9A-Fa-f]{4})_/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
}
const attr = (tag, name) => {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(tag);
  return m ? unescapeXml(m[1] ?? m[2]) : null;
};
/** <si>·<is> 안의 글자: 서식 조각(<r><t>)을 이어 붙이고 발음 표시(<rPh>)는 뺀다. */
function richText(xml) {
  const body = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let out = '';
  for (const m of body.matchAll(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g)) out += m[1] === undefined ? '' : unescapeXml(m[1]);
  return out;
}

/** A1 주소 → { r, c } (0부터). */
export function decodeCell(a) {
  const m = /^([A-Z]+)(\d+)$/.exec(a);
  if (!m) return null;
  let c = 0;
  for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
  return { r: Number(m[2]) - 1, c: c - 1 };
}
/** 열 번호(0부터) → 문자. */
export function encodeCol(c) {
  let s = '';
  for (c += 1; c > 0; c = Math.floor((c - 1) / 26)) s = String.fromCharCode(65 + ((c - 1) % 26)) + s;
  return s;
}

function parseSheet(xml, shared) {
  const cells = new Map(), formulas = new Map(), sharedF = new Map(); // formulas: 수식이 든 칸 주소 → 수식 글자(C7 Summary 대조용, 공유 수식은 원본 글자)
  let maxR = -1, maxC = -1;
  const dim = /<dimension\b[^>]*ref="([A-Z]+\d+)(?::([A-Z]+\d+))?"/.exec(xml);
  if (dim) {
    const e = decodeCell(dim[2] || dim[1]);
    if (e) { maxR = e.r; maxC = e.c; }
  }
  let autoRow = -1;
  for (const row of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rAttr = attr(`<row ${row[1]}>`, 'r');
    const r = rAttr ? Number(rAttr) - 1 : autoRow + 1;
    autoRow = r;
    if (r >= SHEET_ROWS) break;
    if (!row[2]) continue;
    let autoCol = -1;
    for (const c of row[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const head = `<c ${c[1]}>`;
      const ref = attr(head, 'r');
      const pos = ref ? decodeCell(ref) : { r, c: autoCol + 1 };
      autoCol = pos.c;
      const t = attr(head, 't') || 'n';
      const inner = c[2] || '';
      const vm = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner);
      const raw = vm ? unescapeXml(vm[1]) : null;
      let v;
      if (t === 'inlineStr') v = richText(/<is\b[^>]*>([\s\S]*?)<\/is>/.exec(inner)?.[1] ?? '');
      else if (raw === null) continue; // 서식만 있는 빈 칸
      else if (t === 's') v = shared[Number(raw)] ?? '';
      else if (t === 'str') v = raw;
      else if (t === 'b') v = raw === '1' || raw === 'true';
      else if (t === 'e') continue; // 오류 값(#N/A 등)은 기준본 sheet_to_json처럼 빈 칸으로 본다
      else if (t === 'd') v = raw;
      else v = Number(raw);
      cells.set(`${encodeCol(pos.c)}${pos.r + 1}`, v);
      const fm = /<f\b([^>]*?)(?:\/>|>([\s\S]*?)<\/f>)/.exec(inner);
      if (fm) {
        const si = attr(`<f ${fm[1]}>`, 'si'), ft = fm[2] ? unescapeXml(fm[2]) : '';
        if (si !== null && ft) sharedF.set(si, ft);
        formulas.set(`${encodeCol(pos.c)}${pos.r + 1}`, ft || (si !== null ? sharedF.get(si) : '') || '');
      }
      if (pos.r > maxR) maxR = pos.r;
      if (pos.c > maxC) maxC = pos.c;
    }
  }
  if (maxR >= SHEET_ROWS) maxR = SHEET_ROWS - 1;
  return { cells, formulas, ref: { e: { r: Math.max(0, maxR), c: Math.max(0, maxC) } } };
}

/** CSV 문자열 → 셀(모두 문자열, raw). 빈 칸은 값 없음. 따옴표·줄바꿈 포함 칸 지원. */
function parseCsv(text) {
  const cells = new Map();
  let r = 0, c = 0, s = '', quoted = false, any = false, maxR = 0, maxC = 0;
  const put = () => {
    if (s !== '' || any) cells.set(`${encodeCol(c)}${r + 1}`, s);
    if (s !== '' || any) { maxR = Math.max(maxR, r); maxC = Math.max(maxC, c); }
    s = '';
    any = false;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { s += '"'; i++; } else quoted = false;
      } else s += ch;
    } else if (ch === '"') { quoted = true; any = true; }
    else if (ch === ',') { put(); c++; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      put(); r++; c = 0;
      if (r >= SHEET_ROWS) break;
    } else s += ch;
  }
  if (s !== '' || any || c > 0) put();
  return { cells, ref: { e: { r: maxR, c: maxC } } };
}

/**
 * 파일 읽기(기준본 EX.readFile 검사 포함). name·bytes를 받아 { sheetNames, sheets: { name → { cells, ref } } }.
 * @param {string} name 파일 이름(.xlsx / .csv)
 * @param {ArrayBuffer|Uint8Array} buffer
 */
export async function readWorkbook(name, buffer) {
  if (!/\.(xlsx|csv)$/i.test(name)) throw new WorkbookError('XLSX 또는 UTF-8 CSV 파일을 선택하세요.');
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (u8.byteLength > MAX_FILE_BYTES) throw new WorkbookError(tooLargeText(/\.csv$/i.test(name) ? 'CSV 파일' : 'Excel 파일', u8.byteLength, MAX_FILE_BYTES, SIZE_HINTS.workbook)); // E3(D-088)
  if (/\.csv$/i.test(name)) {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(u8);
    return { sheetNames: ['Sheet1'], sheets: { Sheet1: parseCsv(text) } };
  }
  if (u8.length < 4 || u8[0] !== 80 || u8[1] !== 75 || u8[2] !== 3 || u8[3] !== 4) throw new WorkbookError('정상적인 XLSX 압축 파일이 아닙니다. 암호화 파일은 지원하지 않습니다.');
  const zip = readZip(u8);
  const text = async (path) => {
    const get = zip.get(path);
    return get ? new TextDecoder().decode(await get()) : null;
  };
  const wb = await text('xl/workbook.xml');
  if (!wb) throw new WorkbookError('워크시트가 없습니다.');
  const rels = (await text('xl/_rels/workbook.xml.rels')) || '';
  const target = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [attr(m[0], 'Id'), attr(m[0], 'Target')]));
  const ssXml = await text('xl/sharedStrings.xml');
  const shared = ssXml ? [...ssXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\s*\/>/g)].map((m) => (m[1] === undefined ? '' : richText(m[1]))) : [];
  const tableRefOf = async (sheetPath) => {
    const dir = sheetPath.replace(/[^/]*$/, ''), file = sheetPath.slice(dir.length);
    const sr = await text(`${dir}_rels/${file}.rels`);
    const t = sr && [...sr.matchAll(/<Relationship\b[^>]*>/g)].map((m) => attr(m[0], 'Target')).find((x) => /tables\/[^/]*\.xml$/.test(x || ''));
    if (!t) return null;
    const tx = await text(t.startsWith('/') ? t.slice(1) : `xl/${t.replace(/^(\.\.\/)+/, '')}`);
    return (tx && attr(/<table\b[^>]*>/.exec(tx)?.[0] ?? '', 'ref')) || null;
  };
  const sheetNames = [], sheets = {};
  for (const m of wb.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const nm = attr(m[0], 'name'), rid = attr(m[0], 'r:id');
    let path = target.get(rid);
    if (!nm || !path) continue;
    path = path.startsWith('/') ? path.slice(1) : `xl/${path.replace(/^\.\//, '')}`;
    const xml = await text(path);
    if (xml === null) continue;
    sheetNames.push(nm);
    sheets[nm] = parseSheet(xml, shared);
    sheets[nm].tableRef = await tableRefOf(path); // 시트의 첫 Excel 표 범위(없으면 null)
  }
  if (!sheetNames.length) throw new WorkbookError('워크시트가 없습니다.');
  return { sheetNames, sheets };
}

/** 시트 → 원시 값 행렬(기준본 sheet_to_json header:1, defval null, raw, blankrows). 2만 행/201열 제한. */
export function sheetMatrix(sheet) {
  const { e } = sheet.ref;
  if (e.r > 2e4 || e.c > 200) throw new WorkbookError('2만 행 / 201열 이내 시트만 지원합니다.');
  const out = [];
  for (let r = 0; r <= e.r; r++) {
    const row = new Array(e.c + 1).fill(null);
    for (let c = 0; c <= e.c; c++) {
      const v = sheet.cells.get(`${encodeCol(c)}${r + 1}`);
      if (v !== undefined) row[c] = v;
    }
    out.push(row);
  }
  return out;
}
