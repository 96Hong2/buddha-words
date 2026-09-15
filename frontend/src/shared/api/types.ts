/**
 * API 응답 타입. 정본은 `spec/answer.schema.json` 이다.
 * 스키마를 바꾸면 이 파일을 같이 바꾸고 `npm run check:spec` 으로 스텁 응답을 검증한다.
 *
 * LLM 출력 타입(LlmPass1 …)은 여기 없다. 프론트는 서버가 조립한 Api* 만 본다.
 */

import type { InputRoute, CrisisLevel } from '@spec/router.ts';
import type { VisualTheme } from '@spec/visual-theme.ts';

export type { InputRoute, CrisisLevel, VisualTheme };

/**
 * 마음 태그의 닫힌 값. 화면이 이 값을 그대로 표의 키로 쓴다.
 * 타입을 이 목록에서 뽑아 두어야 목록과 타입이 어긋나지 않는다.
 */
export const EMOTION_TAGS = [
  'anxiety',
  'comparison',
  'approval',
  'attachment',
  'anger',
  'regret',
  'loneliness',
  'emptiness',
  'confusion',
  'fatigue',
  'other',
] as const;

export type EmotionTag = (typeof EMOTION_TAGS)[number];

/** 밖에서 들어온 값이 지금 판의 마음 태그인지 */
export function isEmotionTag(value: unknown): value is EmotionTag {
  return typeof value === 'string' && (EMOTION_TAGS as readonly string[]).includes(value);
}

export type Channel = '109' | 'madeleine' | '1577-0199' | '1388' | '1366' | '112';

export interface Term {
  word: string;
  gloss: string;
}

/**
 * 누가 한 말인가.
 *
 * 「불교 문헌의 문장」과 「부처가 직접 한 말」은 다르다. 법구경은 전승상 부처의 가르침이지만
 * 어느 자리에서 한 말인지 화자가 특정되지 않고, 테리가타·승만경·선어록은 아예 다른 사람이
 * 말한다. 서비스 이름이 「부처의 말」이어도 화면이 화자를 부처로 바꾸지 않는다.
 */
export interface Attribution {
  /**
   * 화면에 그대로 나갈 완성된 한 줄.
   * 「— 뿐니까 장로니, 테리가타 12.1」 · 「부처의 가르침 · 법구경 20장 282게」
   */
  displayLabel?: string;
}

/**
 * 경전이 어디서 왔나. **문장은 서버가 완성해서 보낸다.**
 *
 * 화면이 원문 언어와 감수 상태를 보고 문장을 지으면, 한문에서 옮긴 육조단경 아래에
 * 「영역본을 옮겼다」가 붙고 감수 안 받은 구절에 「감수자가 확인했다」가 붙는다.
 * 실제로 그렇게 나가고 있었다. 그래서 문장을 짓는 자리를 서버 한 곳으로 모았다.
 */
export interface ScriptureSource {
  /** 저본. 「《육조단경》 행유품 한문 원문」 */
  base?: string;
  /** 판본 라이선스를 아직 확인하지 못한 구절에만 온다 */
  license?: string;
  translator?: string;
  /** 저본을 어떻게 옮겼고 감수를 받았는지 적은 한 문장. 그대로 그린다 */
  note?: string;
  /** 「한문 원문」 · 「팔리 원문」. originalText 가 있을 때만 함께 온다 */
  originalLabel?: string;
  /** 팔리·한문 원문. 번역문 전체를 덮는 원문이 실린 구절에만 온다 */
  originalText?: string;
}

export interface Scripture {
  id: string;
  /** 경전에서의 자리. 「법구경 17장 분노의 장 223게」 */
  citation: string;
  /** 사람이 감수한 문장 그대로. 모델이 만들지 않는다 */
  text: string;
  terms?: Term[];
  source?: ScriptureSource;
  /** 화자까지 담은 귀속. 서버와 스텁 모두 채워 보낸다 */
  attribution?: Attribution;
}

/**
 * 구절 하나에 붙일 귀속 한 줄. 네 화면(답변 카드·원문 시트·공유 카드·오늘의 한마디)이
 * 모두 이 함수 하나를 지난다.
 *
 * **화면은 귀속 문구를 짓지 않는다.** 값을 만드는 곳은 시드 빌드(`tools/build_scripture_seed.py`)
 * 하나이고 여기서는 받은 문자열을 그대로 그린다. 화자 이름을 화면이 조합하기 시작하면
 * 「부처의 말」이라는 제품 이름에 끌려 남의 말이 부처의 말이 된다.
 *
 * 귀속이 없으면 출처 한 줄만 그린다. 모르는 화자를 채워 넣지 않는다. 이 방향은 늘 안전한
 * 쪽으로만 틀린다. 조주 선사의 말이 「오등회원」으로 보일 수는 있어도 부처의 말이 되지는 않는다.
 * 스텁과 실제 서버가 둘 다 이 칸을 채워 보내므로 평소에는 물러설 일이 없다.
 */
export function attributionLine(scripture: Scripture): string {
  const label = scripture.attribution?.displayLabel;
  return label != null && label !== '' ? label : scripture.citation;
}

export interface AnalysisSection {
  heading: string;
  body: string;
}
export interface Action {
  title: string;
  why?: string;
}

/**
 * 서버가 보내는 사용량. 모양은 `spec/answer.schema.json` 의 `Quota` 그대로다.
 * 정본은 spec 이므로 여기서 이름을 바꾸거나 필드를 더하지 않는다.
 */
export interface ServerQuota {
  /** 오늘 쓴 무료 한 번. 0 또는 1 */
  freeUsed: number;
  /** 오늘 광고를 보고 이어간 횟수 */
  adContinuesUsed: number;
  /** 이어가기 천장. 값을 정하는 것은 서버다 */
  adContinuesMax: number;
  /** 다음 자정. 사용자 시간대 기준 ISO 시각 */
  resetsAt: string;
}

/**
 * 화면이 읽는 사용량.
 *
 * 서버는 **쓴 횟수**를 세고 화면은 **남은 횟수**를 읽는다. 두 모양을 하나로 합치지 않고
 * 뒤집는 자리를 `http.ts` 의 `toQuota` **한 곳**에만 둔다. 화면 쪽을 spec 모양으로 갈아 끼우면
 * 이미 이 이름들로 그리고 있는 앱 정보 화면과 이어가기 시트가 함께 깨진다.
 * 정본은 `ServerQuota` 이고 이 타입은 그것을 옮긴 결과다. 천장 값을 여기서 새로 정하지 않는다.
 */
export interface Quota {
  /** 오늘 남은 이어가기 횟수 */
  continuesLeft: number;
  continuesUsed: number;
  /** 오늘 첫 고민을 이미 썼나 */
  firstUsed: boolean;
  /** 천장에 닿았나 */
  exhausted: boolean;
  /** 서버가 준 다음 자정. 아직 그리는 화면은 없지만 받은 값을 버리지 않는다 */
  resetsAt?: string;
}

export type Pass2 =
  | { status: 'pending' }
  | { status: 'failed'; retryable?: boolean }
  | {
      status: 'done';
      scriptureExplanation: string;
      terms?: Term[];
      personalAnalysis: AnalysisSection[];
      actions: Action[];
      closingMessage: string;
    };

export interface ApiAnswer {
  responseType: 'answer';
  answerId: string;
  route: 'normal' | 'deep';
  routeNote?: 'promoted_topic' | 'downgraded_budget';
  safety?: 'none' | 'concern';
  emotionTags: EmotionTag[];
  modernBuddhaMessage: string;
  scriptures: Scripture[];
  visualTheme: VisualTheme;
  extensionAvailable: boolean;
  pass2: Pass2;
  redactedCount?: number;
  quota?: Quota;
}

export interface ApiLight {
  responseType: 'light';
  answerId: string;
  message: string;
  emotionTags?: EmotionTag[];
  visualTheme?: 'choice';
  cta: 'deeper';
  quota?: Quota;
}

export type InvalidMessageKey = 'playful' | 'empty' | 'injection' | 'repetition';

export interface ApiInvalid {
  responseType: 'invalid';
  messageKey: InvalidMessageKey;
  retryAllowed: true;
  quota?: Quota;
}

export interface ApiCrisis {
  responseType: 'crisis';
  channels: Channel[];
  flags?: { minor?: boolean; abuse?: boolean };
  crisisLevel: CrisisLevel;
  /** distress 일 때만 true. 클라이언트가 스스로 뒤집지 않는다 */
  canContinue: boolean;
}

export interface ApiSolace {
  responseType: 'solace';
  opening: string;
  scripture: Scripture;
  closing: string;
  channels: Channel[];
  fallbackUsed?: boolean;
}

export interface ApiExtension {
  responseType: 'extension';
  answerId: string;
  scripture: Scripture;
  alternativeAnalysis: AnalysisSection;
  action: Action;
}

export type ApiResponse = ApiAnswer | ApiLight | ApiInvalid | ApiCrisis | ApiSolace | ApiExtension;

/** 서버가 보는 것은 원문과 이어가기 의사뿐이다. 원문은 저장되지 않는다 */
export interface ConcernRequest {
  text: string;
  /** 요청2(2차 패스)를 잇는 키. 같은 키로 다시 부르면 사용량이 다시 줄지 않는다 */
  idempotencyKey: string;
  /** 이어가기 광고를 본 뒤 보내는 보상 토큰 */
  continueToken?: string;
}

/**
 * 공유 링크 하나가 실어 나르는 것 전부. **보낸 사람이 적은 글은 여기에 없다.**
 *
 * 갈래가 둘인 것은 두 구현이 실제로 낼 수 있는 것이 다르기 때문이다.
 * 스텁은 그림을 못 그려 카드 조각을 그대로 넘기고, 서버는 카드를 PNG 로 미리 그려 두고
 * 그 주소만 준다(`GET /share/{id}/card.png`). 서버에 조각을 JSON 으로 내주는 자리는 없다.
 * 없는 자리를 있는 척 채우지 않으려고 모양을 갈라 두었다.
 */
export type SharedCard =
  | {
      kind: 'fields';
      buddhaMessage: string;
      scripture: Scripture;
      emotionTags: EmotionTag[];
      /** 「이 말씀은 이런 뜻이에요」 문단 */
      explanation: string[];
    }
  | {
      kind: 'image';
      /** 서버가 그린 1080 × 1620 카드 주소 */
      imageUrl: string;
    };

/**
 * 공유 링크를 하나 연 결과.
 *
 * `landingUrl` 은 **서버가 지어 내려 준 절대주소**다. 화면이 조립하지 않는다. 앱과 서버가
 * 서는 자리가 배포마다 달라서, 화면이 만들면 그때마다 어긋난다.
 * 스텁 판에는 넘길 백엔드가 없어 `null` 이고, 그때만 화면이 자기 자리를 쓴다.
 */
export interface ShareLink {
  token: string;
  landingUrl: string | null;
}

/** 오늘의 한마디. LLM 을 부르지 않는다 */
export interface DailyQuote {
  quoteId: string;
  /** 20~40자 경구 */
  line: string;
  scripture: Scripture;
}
