/**
 * 글자 크기.
 *
 * 값은 문서 뿌리의 `data-text` 에 박히고, 토큰(`shared/styles/tokens.css`)이 그것을 보고
 * `--t-scale` 을 바꾼다. 화면 코드는 크기를 몰라도 된다.
 *
 * **동기로 읽는다.** 토스 브릿지 저장소는 비동기라 한 틱 뒤에 값이 오고, 그 사이 화면이
 * 기본 크기로 한 번 그려졌다가 커진다. 글자가 눈앞에서 튀는 것은 이 설정을 필요로 하는
 * 사람에게 특히 나쁘다. localStorage 는 WebView 에서도 동기라 첫 페인트 전에 정해진다.
 *
 * 저장이 막힌 기기에서는 그 세션만 기억한다. 못 저장했다고 화면이 안 커지면 안 된다.
 */

const KEY = 'buddha.textSize.v1';

/** 네 단. 값 자체가 `data-text` 속성값이고 CSS 가 그 이름으로 받는다 */
export const TEXT_SIZES = ['s', 'm', 'l', 'xl'] as const;

export type TextSize = (typeof TEXT_SIZES)[number];

export const TEXT_SIZE_LABEL: Record<TextSize, string> = {
  s: '작게',
  m: '보통',
  l: '크게',
  xl: '아주 크게',
};

function isTextSize(raw: unknown): raw is TextSize {
  return typeof raw === 'string' && (TEXT_SIZES as readonly string[]).includes(raw);
}

/** 저장이 막혔을 때 이 세션만 기억하는 자리 */
let inMemory: TextSize | null = null;

export function readTextSize(): TextSize {
  if (inMemory != null) return inMemory;
  try {
    const raw = localStorage.getItem(KEY);
    if (isTextSize(raw)) return raw;
  } catch {
    // 저장소가 막혔다. 보통 크기로 본다
  }
  return 'm';
}

/**
 * 고른 크기를 문서에 적용한다.
 *
 * 보통이면 속성을 지운다. 값이 없는 것이 기본이라, 지워 두면 나중에 기본 배율을 바꿔도
 * 예전에 「보통」을 고른 사람이 옛 배율에 묶이지 않는다.
 */
export function applyTextSize(size: TextSize): void {
  const root = document.documentElement;
  if (size === 'm') root.removeAttribute('data-text');
  else root.setAttribute('data-text', size);
}

export function writeTextSize(size: TextSize): void {
  inMemory = size;
  applyTextSize(size);
  try {
    localStorage.setItem(KEY, size);
  } catch {
    // 이 세션 동안은 위의 inMemory 가 들고 있는다
  }
}

/** 앱이 뜨자마자 한 번. 첫 페인트 전에 크기를 정한다 */
export function initTextSize(): TextSize {
  const size = readTextSize();
  applyTextSize(size);
  return size;
}
