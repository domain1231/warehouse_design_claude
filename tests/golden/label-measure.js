// 기준본 대조용 글자 폭 함수. 표는 tools/label-metrics.mjs가 생성한 label-metrics.js.
import { LABEL_METRICS } from './label-metrics.js';
/** 표 기반 글자 폭(글자 폭 + 글자 쌍 보정, 한글 음절은 크기별 측정값). */
export function tableMeasure(text, font) {
  const { adv, kern, hangul } = LABEL_METRICS;
  let units = 0, px = 0, prev = '';
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      px += hangul[font] ?? font * 0.92;
      prev = '';
      continue;
    }
    units += (adv[ch] ?? 2048) + (kern[prev + ch] ?? 0);
    prev = ch;
  }
  return px + (units * font) / 2048;
}
