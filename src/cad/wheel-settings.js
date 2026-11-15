// 휠 확대 감도 설정(F-039). 프로젝트와 별도로 이 PC·브라우저에 저장한다(기준본 M.setWheelMode).
// 재구축 키에만 쓰고, 기준본 키는 처음 읽을 때 참고만 한다(D-006: 기준본 키에 쓰지 않음).
import { WHEEL_GAINS, WHEEL_DEFAULT } from './camera.js';

export const WHEEL_KEY = 'warehouse-layout-v2:wheel-sensitivity';
export const LEGACY_WHEEL_KEY = 'warehouse-studio-v1-wheel-sensitivity-v1';
export const WHEEL_LABELS = Object.freeze({ low: '낮음 · 정밀 조작 (기본)', medium: '보통 · 일반 조작', high: '높음 · 빠른 조작' });

const valid = (v) => Object.hasOwn(WHEEL_GAINS, v);

/**
 * 저장된 감도를 읽는다. 값이 없으면 기본(low), 형식이 틀리거나 읽기에 실패하면 기본값과 안내를 돌려준다.
 * @returns {{ mode: string, status: 'default'|'loaded'|'legacy'|'invalid' }}
 */
export function loadWheelMode(storage) {
  try {
    const v = storage.getItem(WHEEL_KEY);
    if (v !== null) return valid(v) ? { mode: v, status: 'loaded' } : { mode: WHEEL_DEFAULT, status: 'invalid' };
    const legacy = storage.getItem(LEGACY_WHEEL_KEY);
    if (legacy !== null && valid(legacy)) return { mode: legacy, status: 'legacy' };
    return { mode: WHEEL_DEFAULT, status: legacy === null ? 'default' : 'invalid' };
  } catch {
    return { mode: WHEEL_DEFAULT, status: 'invalid' };
  }
}

/**
 * 감도를 저장하고 다시 읽어 확인한다. 저장에 실패해도 화면에는 적용한다(saved=false로 알림).
 * @returns {{ mode: string, saved: boolean }}
 */
export function saveWheelMode(storage, value) {
  const mode = valid(value) ? value : WHEEL_DEFAULT;
  try {
    storage.setItem(WHEEL_KEY, mode);
    return { mode, saved: storage.getItem(WHEEL_KEY) === mode };
  } catch {
    return { mode, saved: false };
  }
}

export const WHEEL_STATUS_TEXT = Object.freeze({
  default: '이 PC·브라우저에 저장됩니다. 기본값은 낮음입니다.',
  loaded: '이 PC·브라우저에 저장된 감도를 적용했습니다.',
  legacy: '기준본(v2.4.1)에서 쓰던 감도를 적용했습니다. 바꾸면 새 저장 영역에 저장합니다.',
  invalid: '이전 감도를 읽지 못해 낮음으로 시작합니다. 다시 선택하면 현재 화면에 적용됩니다.',
  saved: '휠 감도를 이 PC·브라우저에 저장하고 확인했습니다.',
  unsaved: '감도는 현재 화면에 적용했지만 저장을 확인하지 못했습니다. 다시 열면 이전 감도로 돌아갈 수 있습니다.',
});
