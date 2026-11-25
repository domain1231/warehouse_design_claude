// E1(D-086): 프로젝트 파일 크기 상한 하나와 프로젝트 JSON 파일 쓰기·읽기 규칙. DOM 없음.
// JSON 불러오기·압축 백업(쓰기·읽기)·JSON 저장 경고가 모두 PROJECT_MAX_BYTES를 쓴다(이전: 불러오기 12MB, 압축 백업 24MB로 서로 달랐음).
import { PROJECT_MAX_BYTES, PACK_FORMAT, isZipBytes, unzipProject, unpackPacked } from './zip.js';
import { sizeText, tooLargeText, SIZE_HINTS } from '../core/file-size.js';

export { PROJECT_MAX_BYTES };
export const PROJECT_WARN_BYTES = PROJECT_MAX_BYTES / 2;
export const mb = (n) => (n / 1e6).toFixed(1) + 'MB';
const LIMIT = mb(PROJECT_MAX_BYTES).replace('.0MB', 'MB');
export const CLEANUP_HINT = '이력(배치·Excel 스냅샷, 자동 배치 이력)을 정리한 뒤 저장하세요.';

const bytesOf = (s) => new TextEncoder().encode(s).length;

// E2(D-087): 저장 형식. 'compact' 작은 JSON(들여쓰기 없음, 기본) / 'pretty' 읽기 쉬운 JSON(들여쓰기 2칸, 기준본과 같음). 내용은 같다.
export const JSON_FORMATS = Object.freeze(['compact', 'pretty']);
export const DEFAULT_JSON_FORMAT = 'compact';
export const jsonFormatOf = (v) => (JSON_FORMATS.includes(v) ? v : DEFAULT_JSON_FORMAT);

/** 사용자가 내려받는 프로젝트 JSON 원문. */
export function projectJsonText(project, format = DEFAULT_JSON_FORMAT) {
  return jsonFormatOf(format) === 'pretty' ? JSON.stringify(project, null, 2) : JSON.stringify(project);
}

/** 저장할 JSON 크기 안내. 상한의 50% 초과면 경고, 상한 초과면 다시 열 수 없음을 알린다(저장은 막지 않는다). 해당 없으면 null. */
export function projectSizeNotice(bytes, format = DEFAULT_JSON_FORMAT) {
  const tip = jsonFormatOf(format) === 'pretty' ? ' 저장소 관리의 JSON 저장 형식에서 작은 JSON을 고르면 크기가 약 절반으로 줄어듭니다.' : '';
  if (bytes > PROJECT_MAX_BYTES) return `JSON 파일 ${sizeText(bytes)} · 불러오기 상한 ${sizeText(PROJECT_MAX_BYTES)}를 넘어 앱에서 다시 열 수 없습니다. ${CLEANUP_HINT}${tip}`;
  if (bytes > PROJECT_WARN_BYTES) return `JSON 파일 ${sizeText(bytes)} · 불러오기 상한 ${LIMIT}의 50%를 넘었습니다. ${CLEANUP_HINT}${tip}`;
  return null;
}

/** JSON 원문 크기와 안내를 함께 만든다. */
export function projectFile(project, format = DEFAULT_JSON_FORMAT) {
  const text = projectJsonText(project, format);
  const bytes = bytesOf(text);
  return { text, bytes, notice: projectSizeNotice(bytes, format) };
}

/** 크기 문구용 파일 종류(이름의 확장자로만 판단). */
export const projectKind = (f) => (/\.zip$/i.test(f?.name ?? '') ? '프로젝트 ZIP' : '프로젝트 JSON');

/**
 * 프로젝트 파일(프로젝트 JSON · 압축 백업 JSON {"format":"warehouse-backup-zip-v1"} · project.json이 든 ZIP)을 해석한 값으로 돌려준다.
 * @param f File/Blob, @param io { readText(blob), readBytes(blob) → Uint8Array, parse(text), stage(name) }
 */
export async function readProjectFile(f, { readText, readBytes, parse, stage = () => {} }) {
  // E3(D-088): 종류·크기·상한·해결 방법을 함께 알린다.
  if (f.size > PROJECT_MAX_BYTES) throw new Error(tooLargeText(projectKind(f), f.size, PROJECT_MAX_BYTES, SIZE_HINTS.project));
  if (isZipBytes(await readBytes(f.slice(0, 4)))) {
    const bytes = await readBytes(f);
    stage('해석');
    return parse(await unzipProject(bytes));
  }
  const text = await readText(f);
  stage('해석');
  const parsed = parse(text);
  return parsed?.format === PACK_FORMAT ? parse(await unpackPacked(parsed)) : parsed;
}
