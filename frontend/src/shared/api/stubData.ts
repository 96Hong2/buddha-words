/**
 * 개발·e2e 용 스텁 백엔드.
 *
 * 실제 서버가 붙기 전에도 모든 화면이 그려지고 e2e 가 돌아야 한다. 그래서 라우터 판정은
 * **진짜 정본**(`spec/router.ts`)을 그대로 쓰고, 답변 본문만 결정론으로 지어낸다.
 * 경전은 백엔드가 읽는 것과 **같은 파일**(`data/scriptures/seed.json`, 400구절)에서 고른다.
 * 여기서 문장을 만들어 내지 않는다. 시드를 두 벌로 갈라 두면 스텁에서 본 화면과 서버에서 본
 * 화면이 다른 문장으로 갈린다.
 *
 * 고르는 방법은 시드가 커져도 그대로다. 같은 글에는 늘 같은 구절이 나온다(`hash`).
 * 후보를 세는 기준이 목록 길이라 400구절에서도 새로고침마다 답이 바뀌지 않는다.
 *
 * 옛 `dev-seed.json`(12구절)은 이 파일이 마지막 독자였고, 그래서 저장소에서 지웠다.
 *
 * 스텁 다이얼(`window.__buddhaStub`)로 e2e 가 지연·실패·응답 종류를 주입한다.
 */

import seed from '../../../../data/scriptures/seed.json';
import { decide, escalateToSolace, type RouteDecision } from './routerPort';
import type {
  Action,
  AnalysisSection,
  ApiAnswer,
  ApiCrisis,
  ApiExtension,
  ApiInvalid,
  ApiLight,
  ApiResponse,
  ApiSolace,
  Channel,
  DailyQuote,
  EmotionTag,
  Scripture,
  SharedCard,
  VisualTheme,
} from './types';

/** 스텁이 읽는 것만 적는다. 시드에는 `retrieval_text` 처럼 서버 검색 전용 필드가 더 있다 */
interface SeedItem {
  id: string;
  citation: string;
  text: string;
  modern_gloss: string;
  themes: string[];
  daily_ok: boolean;
  daily_line: string;
  terms?: { word: string; gloss: string }[];
  attribution?: { display_label?: string };
  base_edition?: string;
  license_status?: string | null;
  source_language?: string;
  source_text?: string;
  review?: { status?: string };
}

const ITEMS = (seed as { items: SeedItem[] }).items;

/**
 * 저본 문구. 원문 언어 두 갈래 × 감수 통과 여부 두 갈래다.
 *
 * **서버가 쓰는 문장과 같아야 한다**(`backend/app/domains/scripture/repo.py` 의
 * `_SOURCE_BASE` · `_REVIEW_DONE` · `_REVIEW_PENDING`). 두 벌이 갈라지면 개발에서 본
 * 화면과 배포된 화면이 다른 말을 적는다. e2e 가 두 파일을 나란히 읽어 글자까지 비교한다.
 */
export const SOURCE_NOTES = {
  pli: '팔리 원문을 저본으로 삼고 영역본으로 뜻을 대조해 한국어로 새로 옮긴 문장이에요.',
  zh: '고전 한문 원문을 저본으로 삼아 한국어로 새로 옮긴 문장이에요.',
  unknown: '원문을 저본으로 삼아 한국어로 새로 옮긴 문장이에요.',
  reviewed: '외부 문헌 감수에서 출처와 화자를 확인했어요.',
  unreviewed: '문헌 감수는 아직 받지 않은 구절이에요.',
  license: '이 구절이 실린 판본의 이용 조건은 아직 확인하고 있어요.',
} as const;

/** 원문 언어 → 화면에 붙일 이름. 서버의 `_ORIGINAL_LABEL` 과 같다 */
export const ORIGINAL_LABELS: Record<string, string> = { pli: '팔리 원문', zh: '한문 원문' };

function sourceNote(item: SeedItem): string {
  const language = item.source_language ?? '';
  const base =
    language === 'pli'
      ? SOURCE_NOTES.pli
      : language === 'zh'
        ? SOURCE_NOTES.zh
        : SOURCE_NOTES.unknown;
  // 2026-09-16 전수 감수로 시드 395구절이 전부 approved 가 됐다. 화면에는 감수 도장을
  // 붙이는 갈래와 안 붙이는 갈래가 둘 다 있는데, 데이터에 초안이 하나도 없어 뒤엣것을
  // 화면에서 잴 수가 없다. 도장 코드를 무조건 참으로 바꿔도 e2e 열두 건이 전부 통과했다.
  // 그래서 스텁에 시험용 스위치를 둔다. 켜면 모든 구절이 미감수로 온다.
  const reviewed = dial().draftScripture === true ? false : item.review?.status === 'approved';
  return `${base} ${reviewed ? SOURCE_NOTES.reviewed : SOURCE_NOTES.unreviewed}`;
}

/**
 * 서버가 내주는 모양과 같게 맞춘다(`backend/.../scripture/repo.py` 의 `to_api`).
 * 출처 칸을 스텁에서만 채우면 스텁에서는 보이던 줄이 실제 서버에서 사라진다.
 * 시드는 법구경 말고도 열두 문헌을 함께 담고 있어 한 출처로 뭉뚱그릴 수도 없다.
 *
 * 한동안 `attribution` 이 스텁에만 있었다. 스키마가 닫혀 있어 서버가 못 실었고, 그래서
 * 개발 화면에는 화자가 뜨는데 실제 서버에 붙이면 한 명도 안 떴다. 지금은 스키마 · 서버 ·
 * 이 파일 · `http.ts` 넷이 다 열려 있어 두 화면이 같은 것을 낸다.
 *
 * 문구는 여기서 짓지 않는다. 귀속은 시드가 적어 둔 그대로이고, 저본 문구는 서버와 같은
 * 규칙으로 고른다(`sourceNote`).
 */
function toScripture(item: SeedItem): Scripture {
  const scripture: Scripture = {
    id: item.id,
    citation: item.citation,
    text: item.text,
    terms: item.terms,
  };
  const label = item.attribution?.display_label;
  if (label != null && label !== '') scripture.attribution = { displayLabel: label };

  const source: NonNullable<Scripture['source']> = {
    translator: '부처의 말 자체 번역',
    note: sourceNote(item),
  };
  if (item.base_edition != null && item.base_edition !== '') source.base = item.base_edition;
  if (item.license_status === 'needs_check') source.license = SOURCE_NOTES.license;
  if (item.source_text != null && item.source_text !== '') {
    source.originalLabel = ORIGINAL_LABELS[item.source_language ?? ''] ?? '원문';
    source.originalText = item.source_text;
  }
  scripture.source = source;
  return scripture;
}

/** 같은 글에는 늘 같은 구절이 나온다. 새로고침마다 답이 바뀌면 화면을 못 믿는다 */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function pickByTheme(text: string, theme: string, skipIds: string[] = []): SeedItem {
  const pool = ITEMS.filter((s) => !skipIds.includes(s.id));
  const matched = pool.filter((s) => s.themes.includes(theme));
  const from = matched.length > 0 ? matched : pool;
  return from[hash(text) % from.length];
}

// ── 테마·태그 추정 (스텁 전용. 실제로는 1차 패스 모델이 한다) ────────────────
const THEME_WORDS: { theme: VisualTheme; tag: EmotionTag; words: string[] }[] = [
  { theme: 'anger', tag: 'anger', words: ['화가', '짜증', '분노', '억울', '싸웠'] },
  { theme: 'sleepless', tag: 'anxiety', words: ['잠', '불면', '새벽', '못 자'] },
  { theme: 'loss', tag: 'loneliness', words: ['이별', '헤어', '떠났', '돌아가셨', '상실'] },
  { theme: 'comparison', tag: 'comparison', words: ['비교', '남들', '뒤처', '부럽'] },
  {
    theme: 'relationship',
    tag: 'fatigue',
    words: ['친구', '동료', '남편', '아내', '가족', '관계'],
  },
  { theme: 'approval', tag: 'approval', words: ['인정', '눈치', '평가', '미움받'] },
  { theme: 'attachment', tag: 'attachment', words: ['미련', '집착', '못 놓', '아직도'] },
  { theme: 'emptiness', tag: 'emptiness', words: ['공허', '무기력', '의미가', '허무'] },
  { theme: 'anxiety', tag: 'anxiety', words: ['불안', '걱정', '두렵', '무서'] },
];

function themeOf(text: string): { theme: VisualTheme; tags: EmotionTag[] } {
  const hit = THEME_WORDS.find((t) => t.words.some((w) => text.includes(w)));
  if (hit == null) return { theme: 'choice', tags: ['confusion'] };
  return { theme: hit.theme, tags: [hit.tag, 'confusion'] };
}

// ── 스텁 다이얼 ──────────────────────────────────────────────────────────────
export interface StubDial {
  /** 1차 패스 지연(ms). 기본 600 */
  pass1Ms?: number;
  /** 2차 패스 지연(ms). 기본 1200 */
  pass2Ms?: number;
  /** 강제로 이 응답을 낸다. 라우터 판정을 건너뛴다 */
  force?: 'light' | 'invalid' | 'crisis-acute' | 'crisis-distress' | 'answer';
  /** 2차 패스를 실패시킨다 */
  failPass2?: boolean;
  /** 전송 자체를 실패시킨다 */
  failSend?: 'timeout' | 'offline' | 'budget';
  /** 광고를 띄울 수 없는 기기로 둔다 */
  adUnsupported?: boolean;
  /**
   * 경전을 미감수 구절처럼 내준다. 감수 도장이 안 붙는 갈래를 화면에서 보려고 둔 스위치다.
   * 전수 감수 뒤 시드에 초안이 남지 않아 데이터로는 그 갈래를 만들 수 없다.
   * 스텁에만 있고 운영 빌드에는 실리지 않는다.
   */
  draftScripture?: boolean;
  /**
   * 경전 뜻풀이와 용어를 통째로 갈아 끼운다. 실서버에서 풀이를 쓰는 것은 모델이라
   * 어떤 문장이 올지 스텁이 흉내 낼 수 없다. 용어 칩이 남의 낱말을 자르지 않는지처럼
   * 문장에 달린 동작을 화면에서 재려고 둔다.
   */
  glossOverride?: { explanation: string; terms: { word: string; gloss: string }[] };
}

declare global {
  interface Window {
    __buddhaStub?: StubDial;
  }
}

function dial(): StubDial {
  return (typeof window !== 'undefined' && window.__buddhaStub) || {};
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── 창구 ────────────────────────────────────────────────────────────────────
function channelsFor(flags: { minor?: boolean; abuse?: boolean }): Channel[] {
  const list: Channel[] = ['109', 'madeleine'];
  if (flags.minor) list.push('1388');
  if (flags.abuse) list.push('1366', '112');
  return list;
}

// ── 본문 생성 (결정론) ──────────────────────────────────────────────────────
function buddhaMessage(theme: VisualTheme): string {
  const table: Record<VisualTheme, string> = {
    anxiety: '오지 않은 일을 미리 앓지 마라. 지금 네 발이 닿은 자리만이 네 것이다.',
    anger: '불을 불로 끄려 하지 마라. 손에 쥔 돌이 먼저 네 손을 태운다.',
    loss: '떠난 것을 붙들지 마라. 강물은 지나가야 다음 물이 온다.',
    comparison:
      '남의 속도를 좇지 마라. 그 사람의 길은 그 사람의 것이고, 너의 길은 아직 끝나지 않았다.',
    choice: '두 길 앞에서 오래 서 있는 것도 걸음이다. 다만 서 있는 줄은 알고 서 있어라.',
    sleepless: '밤에 떠오른 생각을 밤에 판단하지 마라. 어둠은 크기를 부풀린다.',
    attachment: '쥔 손으로는 받을 수 없다. 펴는 것이 곧 얻는 것이다.',
    emptiness: '비어 있음을 결핍이라 부르지 마라. 그릇은 비어 있어 담는다.',
    relationship: '가까울수록 사이를 두어라. 나무도 붙어 자라면 함께 시든다.',
    approval: '남의 저울로 네 무게를 재지 마라. 그 저울은 매일 눈금이 바뀐다.',
  };
  return table[theme];
}

function analysisFor(theme: VisualTheme, deep: boolean): AnalysisSection[] {
  const first: AnalysisSection = {
    heading: '지금 무엇이 무거운가',
    body:
      '적어 주신 글에는 상황 자체보다 그 상황을 어떻게 받아들여야 할지 모르겠다는 마음이 더 크게 들어 있어요. ' +
      '무엇을 해야 할지 몰라서 힘든 것이 아니라, 지금 느끼는 감정이 괜찮은 것인지 확신이 서지 않아서 더 오래 맴도는 거예요. ' +
      '그 마음은 판단이 필요한 마음이 아니라 먼저 인정받아야 하는 마음이에요.',
  };
  const second: AnalysisSection = {
    heading: '내가 정할 수 있는 자리',
    body:
      '이 상황에는 내가 어쩔 수 있는 부분과 어쩔 수 없는 부분이 섞여 있어요. ' +
      '상대의 마음과 이미 지나간 일은 뒤쪽이고, 앞으로 어떻게 반응할지와 어디까지 감당할지는 앞쪽이에요. ' +
      '둘을 섞어 두면 어쩔 수 없는 쪽까지 내 탓으로 돌아와 무게가 두 배가 돼요.',
  };
  const third: AnalysisSection = {
    heading: '시간이 지나면 달라지는 것',
    body:
      '지금 내린 결론이 영영 갈 것처럼 느껴지지만, 이 감정의 세기는 몇 주 단위로 분명히 바뀌어요. ' +
      '지금은 결론을 내는 때가 아니라 견디는 때일 수 있어요. ' +
      '결정을 미루는 것과 결정을 못 하는 것은 다르고, 지금은 미뤄도 되는 시기예요.',
  };
  void theme;
  return deep ? [first, second, third] : [first];
}

function actionsFor(deep: boolean): Action[] {
  const all: Action[] = [
    {
      title: '오늘 자기 전에 이 마음 한 줄만 적어 두기',
      why: '머리에서 꺼내 놓으면 크기가 실제 크기로 돌아와요',
    },
    {
      title: '내일 이 일로 가장 먼저 만날 사람 한 명 정하기',
      why: '혼자 굴리는 시간이 길수록 결론이 극단으로 가요',
    },
    {
      title: '이번 주에 하지 않기로 할 것 하나 고르기',
      why: '더할 일보다 뺄 일이 지금은 더 효과가 커요',
    },
  ];
  return deep ? all : all.slice(0, 2);
}

// ── 응답 조립 ───────────────────────────────────────────────────────────────
let answerSeq = 0;
/** 새로고침해도 겹치지 않는 꼬리. 실제 서버가 내주는 id 처럼 매번 다르다 */
const runTag = Math.random().toString(36).slice(2, 8);
function newAnswerId(): string {
  answerSeq += 1;
  return `stub-${runTag}-${answerSeq}`;
}

export function buildAnswer(
  text: string,
  route: 'normal' | 'deep',
  decision: RouteDecision,
): ApiAnswer {
  const { theme, tags } = themeOf(text);
  const scripture = toScripture(pickByTheme(text, theme));
  return {
    responseType: 'answer',
    answerId: newAnswerId(),
    route,
    routeNote: decision.floor === 'normal' && route === 'normal' ? 'promoted_topic' : undefined,
    safety: 'none',
    emotionTags: tags,
    modernBuddhaMessage: buddhaMessage(theme),
    scriptures: [scripture],
    visualTheme: theme,
    extensionAvailable: dial().adUnsupported !== true,
    pass2: { status: 'pending' },
  };
}

export function buildPass2(
  text: string,
  route: 'normal' | 'deep',
): Extract<ApiAnswer['pass2'], { status: 'done' }> {
  const { theme } = themeOf(text);
  const item = pickByTheme(text, theme);
  const deep = route === 'deep';
  const override = dial().glossOverride;
  return {
    status: 'done',
    scriptureExplanation:
      override?.explanation ??
      `${item.modern_gloss} 이 구절은 상황을 바꾸라는 말이 아니라, 상황을 보는 자리를 한 걸음 옮겨 보라는 말이에요. ` +
        '같은 일을 겪어도 어디에 서서 보느냐에 따라 견딜 수 있는 무게가 달라져요. ' +
        '지금 하신 고민도 답을 정하기 전에 먼저 자리를 옮겨 볼 수 있는 이야기예요.',
    terms: override?.terms ?? item.terms,
    personalAnalysis: analysisFor(theme, deep),
    actions: actionsFor(deep),
    closingMessage: '오늘 하루를 잘 넘긴 것만으로도 충분히 하신 거예요.',
  };
}

export function buildLight(text: string): ApiLight {
  const messages = [
    '오늘은 가볍게 지나가도 괜찮은 날인가 봐요. 부처도 탁발을 나가기 전에는 그날 무엇을 먹을지 정하지 않았다고 해요. 정해 두지 않아야 받는 대로 맛있게 먹으니까요. 지금 눈에 먼저 들어온 것으로 고르셔도 충분해요.',
    '심심하다는 건 마음에 자리가 비었다는 뜻이기도 해요. 비어 있는 그릇이라야 뭔가를 담을 수 있으니, 지금 그 빈자리를 억지로 채우지 않아도 괜찮아요.',
    '웃음도 마음이 하는 일이에요. 오늘 웃을 일이 있었다면 그것만으로 하루 몫은 하신 거예요.',
  ];
  return {
    responseType: 'light',
    answerId: newAnswerId(),
    message: messages[hash(text) % messages.length],
    emotionTags: ['other'],
    visualTheme: 'choice',
    cta: 'deeper',
  };
}

export function buildInvalid(decision: RouteDecision): ApiInvalid {
  const reasons = decision.reasons.join(' ');
  const key: ApiInvalid['messageKey'] = reasons.includes('empty')
    ? 'empty'
    : reasons.includes('injection')
      ? 'injection'
      : reasons.includes('repetition') || reasons.includes('low_entropy')
        ? 'repetition'
        : 'playful';
  return { responseType: 'invalid', messageKey: key, retryAllowed: true };
}

export function buildCrisis(decision: RouteDecision): ApiCrisis {
  const flags = { minor: decision.flags.minor, abuse: decision.flags.abuse };
  return {
    responseType: 'crisis',
    channels: channelsFor(flags),
    flags,
    crisisLevel: decision.crisisLevel ?? 'distress',
    // 서버가 정한다. 클라이언트가 이 값을 스스로 뒤집지 않는다.
    canContinue: escalateToSolace(decision) != null,
  };
}

export function buildSolace(text: string, decision: RouteDecision): ApiSolace | ApiCrisis {
  // 승격 통로는 이 함수 하나다. acute 는 여기서 막힌다.
  const promoted = escalateToSolace(decision);
  if (promoted == null) return buildCrisis(decision);

  const scripture = toScripture(pickByTheme(text, 'emptiness'));
  return {
    responseType: 'solace',
    opening:
      '그렇게까지 버텨 오신 이야기를 들었어요. 그 마음을 혼자 들고 계셨다는 게 가장 무겁게 남아요. ' +
      '지금 느끼는 것이 과한 것도, 틀린 것도 아니에요.',
    scripture,
    closing:
      '지금 당장 무엇을 결정하지 않으셔도 돼요. 물 한 잔 마시고 창문을 한 번 열어 보셔요. ' +
      '그다음은 그다음에 생각해도 늦지 않아요.',
    channels: channelsFor({ minor: decision.flags.minor, abuse: decision.flags.abuse }),
  };
}

export function buildExtension(text: string, answerId: string, usedIds: string[]): ApiExtension {
  const { theme } = themeOf(text);
  const item = pickByTheme(text + '#ext', theme, usedIds);
  return {
    responseType: 'extension',
    answerId,
    scripture: toScripture(item),
    alternativeAnalysis: {
      heading: '다른 쪽에서 보면',
      body:
        '지금까지는 이 일을 내가 무엇을 잘못했나의 문제로 보셨을 수 있어요. ' +
        '그런데 같은 상황을 「내가 무엇을 바라고 있었나」로 바꿔 보면 이야기가 달라져요. ' +
        '바라던 것이 무엇이었는지 분명해지면, 그것이 지금 꼭 필요한 것인지도 같이 보여요.',
    },
    action: {
      title: '내가 이 일에서 정말 바랐던 것 한 문장으로 적기',
      why: '바람이 분명해지면 실망의 크기도 정확해져요',
    },
  };
}

// ── 공유 카드 ───────────────────────────────────────────────────────────────
/**
 * 링크를 연 사람이 보는 카드. 서버가 토큰으로 내주는 자리를 흉내 낸다.
 * 고민 원문은 여기에 담기지 않는다.
 *
 * 스텁은 카드를 그림으로 그리지 못한다. 그래서 `kind: 'fields'` 조각을 그대로 넣어 두고
 * 화면이 HTML 로 그린다. 서버는 반대로 PNG 주소만 준다(`http.ts` 의 `fetchSharedCard`).
 */
const SHARED_KEY = 'buddha.stub.share.v1';

function sharedStore(): Record<string, SharedCard> {
  try {
    return JSON.parse(localStorage.getItem(SHARED_KEY) ?? '{}') as Record<string, SharedCard>;
  } catch {
    return {};
  }
}

export function rememberShared(answerId: string, card: SharedCard): void {
  // 서버가 할 일을 흉내 낸다. 새로고침에 살아남아야 링크가 링크 구실을 한다.
  try {
    localStorage.setItem(SHARED_KEY, JSON.stringify({ ...sharedStore(), [answerId]: card }));
  } catch {
    // 저장이 막힌 기기에서는 링크를 못 만든다. 화면이 만료 안내로 받는다.
  }
}

export function readShared(token: string): SharedCard | null {
  const card = sharedStore()[token];
  // 갈래가 생기기 전에 저장된 옛 값은 화면이 못 그린다. 반쪽으로 그리지 않고 없는 것으로 본다
  if (card == null || (card.kind !== 'fields' && card.kind !== 'image')) return null;
  return card;
}

// ── 오늘의 한마디 ────────────────────────────────────────────────────────────
/** 같은 날에는 같은 구절. 날짜만으로 정해지고 사용자와 무관하다 */
export function pickDaily(dateISO: string): DailyQuote {
  const pool = ITEMS.filter((s) => s.daily_ok);
  const item = pool[hash(dateISO) % pool.length];
  return { quoteId: `${dateISO}:${item.id}`, line: item.daily_line, scripture: toScripture(item) };
}

// ── 한 번에 판정 ────────────────────────────────────────────────────────────
export interface StubResult {
  decision: RouteDecision;
  response: ApiResponse;
}

export function respondTo(text: string, decision: RouteDecision): ApiResponse {
  const forced = dial().force;
  if (forced === 'light') return buildLight(text);
  if (forced === 'invalid') return buildInvalid(decision);
  if (forced === 'answer') return buildAnswer(text, 'deep', decision);

  switch (decision.route) {
    case 'light':
      return buildLight(text);
    case 'invalid':
      return buildInvalid(decision);
    case 'crisis':
      return buildCrisis(decision);
    case 'deep':
      return buildAnswer(text, 'deep', decision);
    default:
      return buildAnswer(text, 'normal', decision);
  }
}

export { decide, dial };
