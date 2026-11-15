// 기준본(v2.4.1) 저장 형식 `warehouse-backup-zip-v1` 읽기·쓰기.
// 형식: JSON {"format":"warehouse-backup-zip-v1","data":"<base64 zip>"}, zip 안의 project.json(deflate).
// 기준본은 압축하지 않은 프로젝트 JSON 원문도 그대로 저장할 수 있으므로 읽을 때는 둘 다 받는다.
// 재구축본이 쓴 값은 기준본(XLSX.CFB.read 기반 V.unpack)이 읽을 수 있는 표준 zip이어야 한다(되돌림 호환).
// 브라우저·Node 공통: CompressionStream/DecompressionStream('deflate-raw')을 쓴다(외부 의존성 없음).

export const PACK_FORMAT = 'warehouse-backup-zip-v1';
export const ENTRY_NAME = 'project.json';
// 기준본과 같은 상한: base64 12,000,000자, 압축 해제 24,000,000바이트
export const MAX_BASE64_LENGTH = 12e6;
export const MAX_CONTENT_BYTES = 24e6;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function fromBase64(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function transform(bytes, stream, limit) {
  const reader = new Blob([bytes]).stream().pipeThrough(stream).getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (limit !== undefined && total > limit) {
      await reader.cancel();
      throw new Error('압축 백업 내용 오류: 크기 상한 초과');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** 프로젝트 JSON 문자열을 기준본 압축 저장 형식으로 만든다. */
export async function packProject(text) {
  if (typeof text !== 'string') throw new TypeError('프로젝트 JSON 문자열이 필요합니다.');
  const content = new TextEncoder().encode(text);
  if (content.length > MAX_CONTENT_BYTES) throw new Error('프로젝트가 저장 형식 크기 상한을 넘습니다.');
  const compressed = await transform(content, new CompressionStream('deflate-raw'));
  const name = new TextEncoder().encode(ENTRY_NAME);
  const crc = crc32(content);

  // 로컬 파일 헤더(30) + 이름 + 데이터 + 중앙 디렉터리(46) + 이름 + 끝 레코드(22)
  const local = new Uint8Array(30 + name.length);
  const lv = new DataView(local.buffer);
  lv.setUint32(0, 0x04034b50, true);
  lv.setUint16(4, 20, true); // version needed
  lv.setUint16(6, 0x0800, true); // UTF-8 이름
  lv.setUint16(8, 8, true); // deflate
  lv.setUint16(10, 0, true); // 시각: 0 (결정적 출력)
  lv.setUint16(12, 0x21, true); // 날짜: 1980-01-01
  lv.setUint32(14, crc, true);
  lv.setUint32(18, compressed.length, true);
  lv.setUint32(22, content.length, true);
  lv.setUint16(26, name.length, true);
  lv.setUint16(28, 0, true);
  local.set(name, 30);

  const central = new Uint8Array(46 + name.length);
  const cv = new DataView(central.buffer);
  cv.setUint32(0, 0x02014b50, true);
  cv.setUint16(4, 20, true); // version made by
  cv.setUint16(6, 20, true);
  cv.setUint16(8, 0x0800, true);
  cv.setUint16(10, 8, true);
  cv.setUint16(12, 0, true);
  cv.setUint16(14, 0x21, true);
  cv.setUint32(16, crc, true);
  cv.setUint32(20, compressed.length, true);
  cv.setUint32(24, content.length, true);
  cv.setUint16(28, name.length, true);
  cv.setUint32(42, 0, true); // 로컬 헤더 위치
  central.set(name, 46);

  const centralOffset = local.length + compressed.length;
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, 1, true);
  ev.setUint16(10, 1, true);
  ev.setUint32(12, central.length, true);
  ev.setUint32(16, centralOffset, true);

  const zip = new Uint8Array(centralOffset + central.length + end.length);
  zip.set(local, 0);
  zip.set(compressed, local.length);
  zip.set(central, centralOffset);
  zip.set(end, centralOffset + central.length);
  return JSON.stringify({ format: PACK_FORMAT, data: toBase64(zip) });
}

function readEntry(zip) {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('압축 백업 내용 오류: zip 끝 레코드 없음');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (p + 46 > zip.length || view.getUint32(p, true) !== 0x02014b50) throw new Error('압축 백업 내용 오류: 중앙 디렉터리 손상');
    const method = view.getUint16(p + 10, true);
    const crc = view.getUint32(p + 16, true);
    const compressedSize = view.getUint32(p + 20, true);
    const size = view.getUint32(p + 24, true);
    const nameLength = view.getUint16(p + 28, true);
    const extraLength = view.getUint16(p + 30, true);
    const commentLength = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = decoder.decode(zip.subarray(p + 46, p + 46 + nameLength));
    p += 46 + nameLength + extraLength + commentLength;
    // 기준본(CFB.find)은 경로 앞부분을 무시하고 이름으로 찾는다
    if (name !== ENTRY_NAME && !name.endsWith('/' + ENTRY_NAME)) continue;
    if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error('압축 백업 내용 오류: 로컬 헤더 손상');
    const start = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    if (start + compressedSize > zip.length) throw new Error('압축 백업 내용 오류: 데이터 잘림');
    if (size > MAX_CONTENT_BYTES) throw new Error('압축 백업 내용 오류: 크기 상한 초과');
    return { method, crc, size, data: zip.subarray(start, start + compressedSize) };
  }
  throw new Error('압축 백업 내용 오류: project.json 없음');
}

/** 저장 원문을 프로젝트 JSON 문자열로 되돌린다. 압축 형식이 아니면 원문을 그대로 반환한다(기준본 V.unpack과 같은 규칙). */
export async function unpackStored(raw) {
  const parsed = JSON.parse(raw);
  if (parsed?.format !== PACK_FORMAT) return raw;
  if (typeof parsed.data !== 'string' || parsed.data.length > MAX_BASE64_LENGTH) throw new Error('압축 백업 크기 오류');
  const entry = readEntry(fromBase64(parsed.data));
  let content;
  if (entry.method === 0) content = entry.data;
  else if (entry.method === 8) content = await transform(entry.data, new DecompressionStream('deflate-raw'), MAX_CONTENT_BYTES);
  else throw new Error(`압축 백업 내용 오류: 지원하지 않는 압축 방식 ${entry.method}`);
  if (content.length !== entry.size) throw new Error('압축 백업 내용 오류: 크기 불일치');
  if (crc32(content) !== entry.crc) throw new Error('압축 백업 내용 오류: CRC 불일치');
  return new TextDecoder('utf-8', { fatal: true }).decode(content);
}
