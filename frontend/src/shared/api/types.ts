/**
 * API 응답 타입. 정본은 `spec/answer.schema.json` 이다.
 * 스키마를 바꾸면 이 파일을 같이 바꾸고 `npm run check:spec` 으로 스텁 응답을 검증한다.
 *
 * LLM 출력 타입(LlmPass1 …)은 여기 없다. 프론트는 서버가 조립한 Api* 만 본다.
 */

import type { InputRoute, CrisisLevel } from '@spec/router.ts';
import type { VisualTheme } from '@spec/visual-theme.ts';

export type { InputRoute, CrisisLevel, VisualTheme };

export type EmotionTag =
  | 'anxiety' | 'comparison' | 'approval' | 'attachment' | 'anger'
  | 'regret' | 'loneliness' | 'emptiness' | 'confusion' | 'fatigue' | 'other';

export type Channel = '109' | 'madeleine' | '1577-0199' | '1388' | '1366' | '112';

export interface Term { word: string; gloss: string }

export interface Scripture {
  id: string;
  /** 「법구경 17장 분노의 장 223게」 */
  citation: string;
  /** 사람이 감수한 문장 그대로. 모델이 만들지 않는다 */
  text: string;
  terms?: Term[];
  source?: { base?: string; license?: string; translator?: string };
}

export interface AnalysisSection { heading: string; body: string }
export interface Action { title: string; why?: string }

export interface Quota {
  /** 오늘 남은 이어가기 횟수 */
  continuesLeft: number;
  continuesUsed: number;
  /** 오늘 첫 고민을 이미 썼나 */
  firstUsed: boolean;
  /** 천장에 닿았나 */
  exhausted: boolean;
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

export type ApiResponse =
  | ApiAnswer | ApiLight | ApiInvalid | ApiCrisis | ApiSolace | ApiExtension;

/** 서버가 보는 것은 원문과 이어가기 의사뿐이다. 원문은 저장되지 않는다 */
export interface ConcernRequest {
  text: string;
  /** 요청2(2차 패스)를 잇는 키. 같은 키로 다시 부르면 사용량이 다시 줄지 않는다 */
  idempotencyKey: string;
  /** 이어가기 광고를 본 뒤 보내는 보상 토큰 */
  continueToken?: string;
}

/** 공유 링크 하나가 실어 나르는 것 전부. 보낸 사람이 적은 글은 여기에 없다 */
export interface SharedCard {
  buddhaMessage: string;
  scripture: Scripture;
  emotionTags: EmotionTag[];
  /** 「이 말씀은 이런 뜻이에요」 문단 */
  explanation: string[];
}

/** 오늘의 한마디. LLM 을 부르지 않는다 */
export interface DailyQuote {
  quoteId: string;
  /** 20~40자 경구 */
  line: string;
  scripture: Scripture;
}
