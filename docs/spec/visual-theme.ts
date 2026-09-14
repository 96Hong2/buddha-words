/**
 * 부처 이미지 매핑 v0.3
 *
 * 원칙 하나. 부처의 표정은 항상 평온하다. 감정에 따라 우는 얼굴·화난 얼굴을 만들지 않는다.
 * 상황은 「자세(pose)」와 「배경 시간대(backdrop)」로 말한다.
 *
 * 그림은 자세 6종(2026-09-14 도착, 1254×1254 PNG, 원본 assets/buddha_hires_v2/)이고
 * 시간대는 CSS 그라데이션이다. 그림 파일에 시간대를 굽지 않는다. 그래야 6장으로 24가지 장면이 된다.
 *
 * 화면은 visualTheme 열거값 10종으로 고른다. 감정 태그 문자열로 고르지 않는다.
 * 모르는 값이 오면 choice 로 간다.
 */

export type VisualTheme = 'anxiety' | 'anger' | 'loss' | 'comparison' | 'choice' | 'sleepless' | 'attachment' | 'emptiness' | 'relationship' | 'approval';
export type Pose = 'open_eyes' | 'listening' | 'welcome' | 'reading' | 'tea' | 'lotus';
export type Backdrop = 'dawn' | 'day' | 'dusk' | 'night';

/** 자세 → 파일. 시안은 design/assets/buddha2_*.webp(800px), 번들은 재제작·최적화본 */
export const POSE_FILE: Record<Pose, string> = {
  open_eyes: 'buddha2_open_eyes',  // 정면, 눈 뜨고 부드럽게 바라봄. 홈 기본
  listening: 'buddha2_listening',  // 한 손을 가슴에. 경청·공감
  welcome:   'buddha2_welcome',    // 합장. 첫 진입·완료 인사
  reading:   'buddha2_reading',    // 책을 내려다봄. 경전 설명·보관함
  tea:       'buddha2_tea',        // 찻잔. 잠시 쉬어가기·대기
  lotus:     'buddha2_lotus',      // 연꽃을 바라봄. 오늘의 부처의 말·공유 카드
};

/** 배경 시간대. 값은 _tokens.css 의 --backdrop-* 토큰 이름이다 */
export const BACKDROP_TOKEN: Record<Backdrop, string> = {
  dawn:  'var(--backdrop-dawn)',   // 새벽. 옅은 연꽃빛이 섞인 아이보리
  day:   'var(--backdrop-day)',    // 낮. 에셋 매트 그대로
  dusk:  'var(--backdrop-dusk)',   // 노을. 금색이 짙어진다
  night: 'var(--backdrop-night)',  // 밤. 세이지가 어두워진 청록. 라이트 앱 안의 「이미지 안 색」이라 다크 모드가 아니다
};

/** 답변 화면 상단. 테마 10종 → 자세 + 시간대 */
export const THEME_SCENE: Record<VisualTheme, { pose: Pose; backdrop: Backdrop; ko: string }> = {
  anxiety:      { pose: 'listening', backdrop: 'dawn',  ko: '불안' },
  anger:        { pose: 'tea',       backdrop: 'dusk',  ko: '분노' },
  loss:         { pose: 'lotus',     backdrop: 'dusk',  ko: '이별·상실' },
  comparison:   { pose: 'open_eyes', backdrop: 'day',   ko: '비교·열등감' },
  choice:       { pose: 'open_eyes', backdrop: 'dawn',  ko: '고민·선택 (기본값)' },
  sleepless:    { pose: 'tea',       backdrop: 'night', ko: '잠 못 드는 걱정' },
  attachment:   { pose: 'lotus',     backdrop: 'day',   ko: '집착·미련' },
  emptiness:    { pose: 'reading',   backdrop: 'dawn',  ko: '무기력·공허' },
  relationship: { pose: 'listening', backdrop: 'day',   ko: '관계 피로' },
  approval:     { pose: 'welcome',   backdrop: 'day',   ko: '인정받고 싶은 마음' },
};

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
  return (theme && (THEME_SCENE as Record<string, { pose: Pose; backdrop: Backdrop }>)[theme]) || THEME_SCENE.choice;
}

/**
 * 재제작 발주 (아직 없는 자세). 없어도 위 매핑은 6장으로 닫혀 있다. 도착하면 매핑만 바꾼다.
 *   - open_palm   손바닥을 편 모습 (내려놓음 · attachment 에 쓰고 싶다)
 *   - path_seated 길 앞에 앉아 있는 모습 (choice 에 쓰고 싶다. 길을 가리키지는 않는다)
 * 생성 프롬프트 앵커는 assets/buddha_hires_v2/prompts.json 의 master character 문단 그대로.
 *
 * QA 체크 (production 반입 전, 6장 전부):
 *   눈 좌우 대칭 · 눈높이 · 손가락 수 · 얼굴 대칭 · 후광 위치 · 귀 모양 · 배경 건축물 · 글자 없음
 */
