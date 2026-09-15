/**
 * 부처 그림을 고르는 자리. 매핑 정본은 `spec/visual-theme.ts` 다.
 * 화면은 테마 문자열이 아니라 여기서 받은 `{src, backdrop}` 만 쓴다.
 */

import {
  BACKDROP_TOKEN,
  POSE_FILE,
  SCENE_FILE,
  SCREEN_POSE,
  SCREEN_SCENE,
  sceneFor,
  type Backdrop,
  type Pose,
  type SceneKey,
  type VisualTheme,
} from '@spec/visual-theme.ts';

export type { Backdrop, Pose, SceneKey, VisualTheme };
export { sceneFor, SCREEN_POSE, SCREEN_SCENE };

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

/**
 * 배경까지 그려진 한 장. 큰 자리(답변 상단·오늘의 한마디·진입 카드)가 쓴다.
 * 시간대가 그림에 들어 있어 backdrop 토큰을 함께 깔지 않는다.
 */
export interface Art {
  src: string;
  alt: string;
}

/** 표정은 늘 평온하다. 달라지는 것은 부처가 앉은 자리와 계절이다 */
const SCENE_ALT: Record<SceneKey, string> = {
  dawn_pond: '새벽안개가 낀 연못가에 앉아 있는 부처',
  autumn_maple: '붉은 단풍이 지는 물가에 앉아 있는 부처',
  dusk_water: '노을이 물에 비치는 자리에 앉아 있는 부처',
  day_mountain: '눈 덮인 산줄기를 등지고 앉아 있는 부처',
  stone_path: '돌길이 뒤로 이어지는 자리에 앉아 있는 부처',
  night_moon: '보름달이 뜬 밤 연못가에 앉아 있는 부처',
  compassion: '연꽃을 받쳐 들고 앉아 있는 부처, 어깨에 새 두 마리',
  spring_sprout: '새싹이 돋는 연못가에 앉아 있는 부처',
};

function toArt(key: SceneKey): Art {
  return { src: `/assets/${SCENE_FILE[key]}.webp`, alt: SCENE_ALT[key] };
}

/** 답변 상단. 모르는 테마가 오면 choice 로 간다 */
export function artForTheme(theme: string | null | undefined): Art {
  return toArt(sceneFor(theme).scene);
}

/** 큰 자리의 고정 장면 */
export function artForScreen(key: keyof typeof SCREEN_SCENE): Art {
  return toArt(SCREEN_SCENE[key]);
}
