/**
 * 부처 그림을 고르는 자리. 매핑 정본은 `spec/visual-theme.ts` 다.
 * 화면은 테마 문자열이 아니라 여기서 받은 `{src, backdrop}` 만 쓴다.
 */

import {
  BACKDROP_TOKEN,
  POSE_FILE,
  SCREEN_POSE,
  sceneFor,
  type Backdrop,
  type Pose,
  type VisualTheme,
} from '@spec/visual-theme.ts';

export type { Backdrop, Pose, VisualTheme };
export { sceneFor, SCREEN_POSE };

export interface Scene {
  src: string;
  backdrop: string;
  pose: Pose;
}

function toScene(pose: Pose, backdrop: Backdrop): Scene {
  return { src: `/assets/${POSE_FILE[pose]}.webp`, backdrop: BACKDROP_TOKEN[backdrop], pose };
}

/** 답변 화면 상단. 모르는 테마가 오면 choice 로 간다 */
export function sceneForTheme(theme: string | null | undefined): Scene {
  const s = sceneFor(theme);
  return toScene(s.pose, s.backdrop);
}

/** 답변 화면이 아닌 고정 자리. 위기 화면은 null 이라 그림을 두지 않는다 */
export function sceneForScreen(key: keyof typeof SCREEN_POSE): Scene | null {
  const s = SCREEN_POSE[key];
  if (s == null) return null;
  return toScene(s.pose, s.backdrop);
}
