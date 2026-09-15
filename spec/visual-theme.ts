/**
 * 부처 이미지 매핑 v0.3
 *
 * 원칙 하나. 부처의 표정은 항상 평온하다. 감정에 따라 우는 얼굴·화난 얼굴을 만들지 않는다.
 * 상황은 「자세(pose)」와 「배경 시간대(backdrop)」로 말한다.
 *
 * 그림은 두 층이다.
 *
 *   ① 인물 컷 6종  배경이 없는 캐릭터. 시간대는 CSS 그라데이션으로 뒤에 깐다.
 *                  작은 자리(썸네일·홈·대기·빈 상태)에 쓴다. 6장으로 24가지 조합이 된다.
 *   ② 장면 8종     배경까지 그려진 한 장(2026-09-15 도착). 계절·시간대가 그림에 들어 있다.
 *                  큰 자리(답변 상단·오늘의 한마디·진입 카드)에 쓴다.
 *
 * 큰 자리에서 인물 컷을 쓰면 CSS 그라데이션이 넓게 드러나 심심하다. 반대로 작은 자리에
 * 장면을 넣으면 배경만 보이고 부처가 안 보인다. 그래서 자리 크기로 층을 가른다.
 *
 * 화면은 visualTheme 열거값 10종으로 고른다. 감정 태그 문자열로 고르지 않는다.
 * 모르는 값이 오면 choice 로 간다.
 */

export type VisualTheme = 'anxiety' | 'anger' | 'loss' | 'comparison' | 'choice' | 'sleepless' | 'attachment' | 'emptiness' | 'relationship' | 'approval';
export type Pose = 'open_eyes' | 'listening' | 'welcome' | 'reading' | 'tea' | 'lotus';
export type Backdrop = 'dawn' | 'day' | 'dusk' | 'night';
export type SceneKey = 'dawn_pond' | 'autumn_maple' | 'dusk_water' | 'day_mountain' | 'stone_path' | 'night_moon' | 'compassion' | 'spring_sprout';

/** 자세 → 파일. 시안은 design/assets/buddha2_*.webp(800px), 번들은 재제작·최적화본 */
export const POSE_FILE: Record<Pose, string> = {
  open_eyes: 'buddha2_open_eyes',  // 정면, 눈 뜨고 부드럽게 바라봄. 홈 기본
  listening: 'buddha2_listening',  // 한 손을 가슴에. 경청·공감
  welcome:   'buddha2_welcome',    // 합장. 첫 진입·완료 인사
  reading:   'buddha2_reading',    // 책을 내려다봄. 경전 설명·보관함
  tea:       'buddha2_tea',        // 찻잔. 잠시 쉬어가기·대기
  lotus:     'buddha2_lotus',      // 연꽃을 바라봄. 오늘의 부처의 말·공유 카드
};

/** 장면 → 파일. 배경까지 그려진 한 장이라 시간대 토큰을 함께 쓰지 않는다 */
export const SCENE_FILE: Record<SceneKey, string> = {
  dawn_pond:     'scene_dawn_pond',      // 안개 낀 산과 연못의 아침
  autumn_maple:  'scene_autumn_maple',   // 붉은 단풍이 지는 노을
  dusk_water:    'scene_dusk_water',     // 물 위로 해가 내려앉는 노을
  day_mountain:  'scene_day_mountain',   // 눈 덮인 산줄기의 맑은 낮
  stone_path:    'scene_stone_path',     // 뒤로 이어지는 돌길. 길을 가리키지 않고 앉아 있다
  night_moon:    'scene_night_moon',     // 보름달과 등불이 켜진 밤
  compassion:    'scene_compassion',     // 손에 연꽃을 받쳐 들고 어깨에 새 둘
  spring_sprout: 'scene_spring_sprout',  // 새싹이 돋는 초록 연못
};

/** 공유 카드 배경. 세로 1122×1402 이라 1080×1620 서버 렌더에 맞춘다. 번들에 넣지 않는다 */
export const SHARE_CARD_BG = '07-share-card-dawn';

/** 배경 시간대. 값은 _tokens.css 의 --backdrop-* 토큰 이름이다 */
export const BACKDROP_TOKEN: Record<Backdrop, string> = {
  dawn:  'var(--backdrop-dawn)',   // 새벽. 옅은 연꽃빛이 섞인 아이보리
  day:   'var(--backdrop-day)',    // 낮. 에셋 매트 그대로
  dusk:  'var(--backdrop-dusk)',   // 노을. 금색이 짙어진다
  night: 'var(--backdrop-night)',  // 밤. 세이지가 어두워진 청록. 라이트 앱 안의 「이미지 안 색」이라 다크 모드가 아니다
};

/**
 * 답변 화면 상단. 테마 10종 → 자세 + 시간대
 *
 * `ko` 는 그 사람 앞에 놓이는 말이다. 키(attachment 같은 영문 코드)는 그림을 고르는 값이라
 * 바꾸지 않지만, 한글 이름은 판정이 아니라 마음의 이름이어야 한다. 사별한 사람에게
 * 「집착」, 남과 자신을 견주는 사람에게 「열등감」은 상태 이름이 아니라 진단서다.
 * 화면 칩(`domains/answer` · `domains/archive`)과 같은 말을 쓴다. 한 개념에 두 이름을 두지 않는다.
 */
export const THEME_SCENE: Record<VisualTheme, { pose: Pose; backdrop: Backdrop; scene: SceneKey; ko: string }> = {
  anxiety:      { pose: 'listening', backdrop: 'dawn',  scene: 'dawn_pond',     ko: '불안' },
  anger:        { pose: 'tea',       backdrop: 'dusk',  scene: 'dusk_water',    ko: '분노' },
  loss:         { pose: 'lotus',     backdrop: 'dusk',  scene: 'autumn_maple',  ko: '이별·상실' },
  comparison:   { pose: 'open_eyes', backdrop: 'day',   scene: 'day_mountain',  ko: '남과 견주는 마음' },
  choice:       { pose: 'open_eyes', backdrop: 'dawn',  scene: 'stone_path',    ko: '고민·선택 (기본값)' },
  sleepless:    { pose: 'tea',       backdrop: 'night', scene: 'night_moon',    ko: '잠 못 드는 걱정' },
  attachment:   { pose: 'lotus',     backdrop: 'day',   scene: 'autumn_maple',  ko: '아직 남은 마음' },
  emptiness:    { pose: 'reading',   backdrop: 'dawn',  scene: 'spring_sprout', ko: '무기력·공허' },
  relationship: { pose: 'listening', backdrop: 'day',   scene: 'compassion',    ko: '관계 피로' },
  approval:     { pose: 'welcome',   backdrop: 'day',   scene: 'day_mountain',  ko: '인정받고 싶은 마음' },
};

/**
 * 장면이 여덟인데 테마는 열이라 둘이 겹친다. 계획이 정해 둔 대로다.
 * attachment 는 상실 그림으로, approval 은 comparison 그림으로 간다.
 */

/** 큰 자리의 고정 장면. 여기 없는 화면은 인물 컷(SCREEN_POSE)을 쓴다 */
export const SCREEN_SCENE = {
  dailyQuote: 'dawn_pond',
  entryCard:  'dawn_pond',
  shareCard:  'dusk_water',
} as const satisfies Record<string, SceneKey>;

/** 화면별 고정 자리. 답변 상단이 아닌 곳 */
export const SCREEN_POSE = {
  home:          { pose: 'open_eyes', backdrop: 'day' },
  loading:       { pose: 'tea',       backdrop: 'dawn' },
  dailyQuote:    { pose: 'lotus',     backdrop: 'dawn' },
  archiveEmpty:  { pose: 'reading',   backdrop: 'day' },
  shareCard:     { pose: 'lotus',     backdrop: 'dusk' },
  lightAnswer:   { pose: 'tea',       backdrop: 'day' },
  crisis:        null,                                   // 위기 화면에는 그림을 두지 않는다
  invalid:       { pose: 'welcome',   backdrop: 'day' },
} as const;

export function sceneFor(theme: string | null | undefined) {
  return (theme && (THEME_SCENE as Record<string, { pose: Pose; backdrop: Backdrop; scene: SceneKey }>)[theme]) || THEME_SCENE.choice;
}

/**
 * 재제작 발주. 2026-09-15 에 장면 여덟이 도착하면서 둘 다 닫혔다.
 *   - path_seated 길 앞에 앉아 있는 모습 → 장면 stone_path 로 왔다. choice 가 쓴다
 *   - open_palm   손바닥을 편 모습 → 장면 compassion 이 손에 연꽃을 받쳐 든 모습으로 대신한다
 *
 * 공유 카드 배경본(글자 없는 것)도 07-share-card-dawn 으로 왔다.
 * 생성 프롬프트 앵커는 assets/buddha_hires_v2/prompts.json 의 master character 문단 그대로.
 *
 * QA 체크 (production 반입 전, 6장 전부):
 *   눈 좌우 대칭 · 눈높이 · 손가락 수 · 얼굴 대칭 · 후광 위치 · 귀 모양 · 배경 건축물 · 글자 없음
 */
