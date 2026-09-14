/**
 * 입력 라우터 v0.3 · 정본
 *
 * 고민 입력을 다섯 갈래로 나눈다. light · normal · deep · invalid · crisis.
 * 길이 하나로 판정하지 않는다. 「ㅋㅋㅋㅋ」를 열 줄 써도 light 이고,
 * 「남편이 다른 사람을 만나는 것 같아요. 이혼해야 할까요?」는 짧아도 normal 이상이다.
 *
 * 두 층으로 돈다.
 *   1층 rules      결정론. 프론트와 서버가 같은 파일을 쓴다. 0원, 0ms.
 *                  invalid · crisis 후보 · light 후보 · 승격 바닥(floor)을 정한다.
 *   2층 classifier 값싼 모델 한 번(출력 100토큰 안팎). light/normal/deep 을 가르고
 *                  crisis 후보를 확정한다. 실패하면 rules 의 임시 판정으로 내려간다.
 *
 * 합치는 규칙(merge): crisis 는 위로만 간다. invalid 는 rules 만 정한다.
 * 승격 바닥(floor)은 classifier 가 그 아래로 내리지 못한다.
 *
 * crisis 는 두 결로 나뉜다(v0.3.1).
 *   acute    방법·수단을 찾거나 계획·시도를 말한 경우. 창구 안내만 띄우고 모델을 부르지 않는다.
 *   distress 「죽고 싶다」처럼 고통을 말한 경우. 창구 안내를 먼저 띄우되,
 *            글쓴이가 스스로 「그래도 이야기를 들어주세요」를 누르면 escalateToSolace 로 위로 답변을 연다.
 * 이 승격은 escalateToSolace 를 거쳐야만 일어난다. rules 도 classifier 도 solace 를 직접 반환하지 않는다.
 * acute 는 그 함수가 막으므로 어떤 경로로도 모델에 닿지 않는다.
 *
 * 이 파일은 의존성이 없다. `node --experimental-strip-types docs/spec/router.test.ts` 로 픽스처를 돈다.
 */

export type InputRoute = 'light' | 'normal' | 'deep' | 'invalid' | 'crisis' | 'solace';

/** crisis 의 결. acute 는 모델을 부르지 않는다 */
export type CrisisLevel = 'acute' | 'distress';
export type ModelTier = 'none' | 'cheap' | 'standard' | 'premium';

export type RouteFlags = {
  minor: boolean;       // 글쓴이가 미성년자로 보인다 → 위기 창구에 1388 을 올린다
  abuse: boolean;       // 폭력·학대 정황 → 1366·112, excluded_for: abuse_victim
  lowEntropy: boolean;  // 같은 글자 반복으로 길이를 채웠다
  injection: boolean;   // 시스템 프롬프트 요청·지시 우회 시도
};

export type RouteDecision = {
  route: InputRoute;
  confidence: number;          // 0~1
  reasons: string[];           // 판정 근거 코드. 로그에 그대로 싣는다(원문은 싣지 않는다)
  useRag: boolean;             // 경전 검색을 돌리나
  modelTier: ModelTier;        // 실제 모델 id 는 배포 산출물이 정한다. 여기서는 등급만
  stage: 'rules' | 'classifier' | 'fallback';
  flags: RouteFlags;
  counts: { chars: number; lines: number; segments: number; uniqueRatio: number };
  /** rules 가 정한 바닥. classifier 는 이 아래로 내리지 못한다 */
  floor: InputRoute | null;
  /** classifier 에게 넘길 힌트. 사용자에게 보이지 않는다 */
  hints: string[];
  /** route 가 crisis 일 때만 채운다. acute 는 escalateToSolace 가 거부한다 */
  crisisLevel: CrisisLevel | null;
};

/** classifier(2층)가 돌려주는 값. 스키마 strict. 본문을 쓰지 않는다 */
export type ClassifierVerdict = {
  route: 'light' | 'normal' | 'deep' | 'crisis' | 'invalid';
  confidence: number;
  reasons: string[];
  minor: boolean;
  abuse: boolean;
};

// ────────────────────────────────────────────────────────────────────────────
// 정규화와 세기
// ────────────────────────────────────────────────────────────────────────────

const COUNTABLE = /[가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9]/g;

export function normalize(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[ ​-‍﻿]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export function countChars(text: string): number {
  return (text.match(COUNTABLE) ?? []).length;
}

/** 줄바꿈 1차, 종결 기호 2차. 닫는 따옴표 앞과 소수점은 끊지 않는다. 6자 미만 조각은 세지 않는다 */
export function segments(text: string): string[] {
  const guarded = text.replace(/(\d)\.(\d)/g, '$1․$2');
  return guarded
    .split('\n')
    .flatMap((line) => line.split(/(?<=[.!?。？！])(?![’”'"」』)\]])\s*|(?<=[…‥]{1,2})\s+/u))
    .map((s) => s.replace(/․/g, '.').trim())
    .filter((s) => countChars(s) >= 6);
}

function uniqueRatio(text: string): number {
  const body = text.replace(/\s/g, '');
  if (!body) return 0;
  return new Set(body).size / body.length;
}

// ────────────────────────────────────────────────────────────────────────────
// 사전. 전부 어간 기준. 제외 패턴을 먼저 본다.
// ────────────────────────────────────────────────────────────────────────────

/** 위기: 하나라도 맞으면 crisis 후보. 강한 패턴(STRONG)은 classifier 없이 확정 */
const CRISIS_STRONG = [
  /자살(하|할|하고|생각|계획|시도)/, /목숨을?\s?끊/, /죽어버리(고|겠|려)/, /죽을(래|거야|게요|거예요)/,
  /뛰어내리(고|려|겠)/, /목을?\s?매/, /번개탄/, /수면제.{0,6}(모으|모아|털)/, /유서/,
  /손목.{0,4}(긋|그어)/, /자해(하|했|를|를 했)/, /죽여버리(고|겠)/, /다\s?죽이/,
];
const CRISIS_SOFT = [
  /죽고\s?싶/, /살아있기\s?싫/, /사라지고\s?싶/, /살기\s?싫/, /없어지고\s?싶/, /세상.{0,4}떠나고\s?싶/,
];
/**
 * 방법·수단을 찾는 물음. 걸리면 무조건 acute 라서 어떤 경로로도 모델에 닿지 않는다.
 * 「소설이다 · 참고용이다」 같은 우회 전제를 붙여도 같은 자리에서 걸린다.
 */
const CRISIS_METHOD = [
  /(어떻게|어떤|무슨|무엇|뭘|뭐로|방법|수단).{0,10}(죽|자살|자해)/,
  /(죽는|자살|자해|목매|목\s?매).{0,4}(방법|법|수단|요령)/,
  /(먹으면|마시면|하면).{0,6}(죽|안\s?깨)/, /몇\s?(알|정|개).{0,8}(죽|위험|치사)/, /치사(량|율)/,
  /(안\s?아프게|고통\s?없이|편하게).{0,8}(죽|가는)/,
];
/** 관용 표현. 위기 사전보다 먼저 본다 */
const CRISIS_EXCLUDE = [
  /때려치우|때려치고/, /죽겠(다|어|네|어요)/, /죽을\s?만큼/, /죽는\s?줄/, /죽을\s?것\s?같/, /죽도록/,
  /(배고파|더워|추워|웃겨|귀찮아|힘들어|피곤해|졸려|심심해).{0,3}죽/,
];

/** 학대·폭력 정황. abuse 플래그 → excluded_for 에 걸린 구절을 후보에서 뺀다 */
const ABUSE = [/맞았|때린|때려요|때렸/, /폭행|폭력/, /성폭행|성추행|성희롱/, /몰카|스토킹|감금/, /굶기|학대/];
const MINOR = [/담임|야자|수능|내신|중학교|고등학교|학원|교복|급식|학교에서/];

/** 짧아도 가볍게 답할 수 없는 주제. floor = normal. classifier 가 deep 으로 올릴 수 있다 */
const TOPIC_FLOOR = [
  /바람(피|났|난)|외도|불륜|다른\s?사람을\s?만나/, /이혼|별거|파혼/, /헤어지|이별|차였|결별/, /배신|속였/,
  /돌아가셨|사망|장례|세상을\s?떠|유산(했|됐)/, /해고|잘렸|권고사직|폐업|파산|부도/,
  /시한부|암\s?진단|진단받았/, /사산|난임/, /괴롭힘|왕따|따돌림|갑질/,
];

/** 프롬프트 인젝션·시스템 요청. invalid 로 보낸다 */
const INJECTION = [
  /(시스템|system)\s?(프롬프트|prompt)/i, /ignore\s+(all\s+)?(previous|above)/i, /(지시|명령).{0,6}(무시|잊)/,
  /너의?\s?(설정|규칙|지침).{0,6}(알려|출력|보여)/, /developer\s?mode/i, /jailbreak/i, /역할.{0,4}(바꿔|변경).{0,8}(답|출력)/,
];

/** 가벼운 입력. light 후보. 진지한 고민이 섞이면 classifier 가 normal 로 올린다 */
const LIGHT_TOPICS = [
  /(점심|저녁|아침|야식).{0,6}(뭐|무엇).{0,4}먹/, /뭐\s?먹(지|을까)/, /(오늘|주말|이번\s?주).{0,4}뭐\s?하지/,
  /심심(해|하다|함)/, /로또|복권.{0,6}번호/, /(부처|부처님|너).{0,6}(잘생|예쁘|진짜|누구|몇\s?살|사람이야|AI야)/,
  /(여자|남자)\s?친구.{0,6}(만들|생기|사귀)고\s?싶/, /돈.{0,4}(많이)?\s?벌고\s?싶/, /출근(하기)?\s?싫/, /회사\s?때려\s?(칠|치)/,
];
const LAUGH_ONLY = /^[ㅋㅎㅠㅜㅡ!?.~\s]+$/;
const EMOJI_ONLY = /^[\p{Extended_Pictographic}\p{Emoji_Component}\s]+$/u;

/** 영문 토큰이 단어 꼴인지. 모음이 없거나 자음 4연속·모음 3연속이면 자판 두드림으로 본다 */
function latinLooksRandom(text: string): boolean {
  const tokens = text.toLowerCase().split(/\s+/).filter((t) => /[a-z]{3,}/.test(t));
  if (!tokens.length) return true;
  const noisy = tokens.filter((t) => !/[aeiou]/.test(t) || /[bcdfghjklmnpqrstvwxz]{4,}/.test(t) || /[aeiou]{3,}/.test(t)).length;
  return noisy / tokens.length >= 0.5;
}

// ────────────────────────────────────────────────────────────────────────────
// 1층 · rules
// ────────────────────────────────────────────────────────────────────────────

const TIER: Record<InputRoute, ModelTier> = {
  invalid: 'none', crisis: 'none', light: 'cheap', normal: 'cheap', deep: 'premium',
  // 위로 답변은 분석이 아니라 문장의 결이 전부라 값싼 등급으로 내리지 않는다
  solace: 'standard',
};
const RAG: Record<InputRoute, boolean> = {
  invalid: false, crisis: false, light: false, normal: true, deep: true,
  solace: true,
};

function decide(route: InputRoute, stage: RouteDecision['stage'], confidence: number, base: Omit<RouteDecision, 'route' | 'stage' | 'confidence' | 'useRag' | 'modelTier'>): RouteDecision {
  return { ...base, route, stage, confidence, useRag: RAG[route], modelTier: TIER[route] };
}

export function routeByRules(raw: string): RouteDecision {
  const text = normalize(raw);
  const chars = countChars(text);
  const lines = text ? text.split('\n').filter((l) => l.trim()).length : 0;
  const segs = segments(text).length;
  const uniq = uniqueRatio(text);
  const counts = { chars, lines, segments: segs, uniqueRatio: Number(uniq.toFixed(2)) };
  const compact = text.replace(/\s/g, '');

  const reasons: string[] = [];
  const hints: string[] = [];
  const flags: RouteFlags = {
    minor: MINOR.some((re) => re.test(text)),
    abuse: ABUSE.some((re) => re.test(text)),
    lowEntropy: chars >= 40 && uniq < 0.18,
    injection: INJECTION.some((re) => re.test(text)),
  };
  const base = { reasons, flags, counts, floor: null as InputRoute | null, hints, crisisLevel: null as CrisisLevel | null };

  // 1. 웃음·이모지만 → 가벼운 답. 빈 입력·기호만 → invalid
  if (text && (LAUGH_ONLY.test(text) || EMOJI_ONLY.test(text))) {
    reasons.push('laugh_or_emoji_only');
    return decide('light', 'rules', 0.95, base);
  }
  if (chars === 0) {
    reasons.push('empty_or_symbols');
    return decide('invalid', 'rules', 0.99, base);
  }
  // 2. 인젝션
  if (flags.injection) {
    reasons.push('injection_pattern');
    return decide('invalid', 'rules', 0.95, base);
  }
  // 3. 위기. 제외 패턴을 먼저 본다. 제외에 걸려도 힌트는 남긴다
  const excluded = CRISIS_EXCLUDE.some((re) => re.test(compact) || re.test(text));
  const method = CRISIS_METHOD.some((re) => re.test(compact));
  const strong = CRISIS_STRONG.some((re) => re.test(compact));
  const soft = CRISIS_SOFT.some((re) => re.test(compact));
  // 방법을 묻는 글은 관용 표현 제외를 적용하지 않는다
  if (method) {
    reasons.push('crisis_method');
    base.crisisLevel = 'acute';
    return decide('crisis', 'rules', 0.97, base);
  }
  if (!excluded && strong) {
    reasons.push('crisis_strong');
    base.crisisLevel = 'acute';
    return decide('crisis', 'rules', 0.9, base);
  }
  if ((strong || soft) && excluded) hints.push('crisis_pattern_but_idiom');
  if (!excluded && soft) {
    reasons.push('crisis_soft');
    hints.push('crisis_candidate');
    base.floor = 'normal';
    base.crisisLevel = 'distress';
    // 확정은 classifier. rules 임시 판정은 crisis 로 두어 분류 실패 시 안전한 쪽으로 간다
    return decide('crisis', 'rules', 0.6, base);
  }
  // 5. 무의미한 반복·랜덤 문자열
  if (flags.lowEntropy) {
    reasons.push('low_entropy');
    return decide('invalid', 'rules', 0.85, base);
  }
  const jamoOnly = /^[ㄱ-ㅎㅏ-ㅣ\s]+$/.test(text);
  const latinNoise = /^[a-zA-Z0-9\s]+$/.test(text) && chars >= 8 && latinLooksRandom(text);
  if (jamoOnly || latinNoise) {
    reasons.push('random_string');
    return decide('invalid', 'rules', 0.85, base);
  }
  // 6. 주제 승격 바닥. 짧아도 가볍게 답하지 않는다
  if (TOPIC_FLOOR.some((re) => re.test(text))) {
    reasons.push('topic_floor');
    base.floor = 'normal';
    hints.push('serious_topic');
    // deep 여부는 맥락(이해관계·의사결정·구체성)을 classifier 가 본다. 길이가 아니다
    const provisional: InputRoute = chars >= 120 || (lines >= 3 && chars >= 40) ? 'deep' : 'normal';
    return decide(provisional, 'rules', 0.55, base);
  }
  if (flags.abuse) { base.floor = 'normal'; hints.push('abuse_context'); }
  // 7. 가벼운 주제
  if (LIGHT_TOPICS.some((re) => re.test(text)) && chars < 60) {
    reasons.push('light_topic');
    return decide('light', 'rules', 0.8, base);
  }
  // 8. 아주 짧고 문장이 하나면 light 후보. 단 감정어가 있으면 normal 후보
  const feeling = /(힘들|우울|불안|외로|화가|짜증|스트레스|무서|눈물|슬프|미치겠|답답|서럽|억울|자존감|고민)/.test(text);
  if (chars < 15 && !feeling) {
    reasons.push('very_short_no_feeling');
    return decide('light', 'rules', 0.6, base);
  }
  // 9. 나머지는 classifier 몫. rules 임시 판정은 길이·줄 수로 normal/deep 후보만 낸다
  reasons.push('needs_classifier');
  const provisional: InputRoute = chars >= 120 || (lines >= 3 && chars >= 40) ? 'deep' : 'normal';
  hints.push(provisional === 'deep' ? 'length_suggests_deep' : 'length_suggests_normal');
  return decide(provisional, 'rules', 0.5, base);
}

// ────────────────────────────────────────────────────────────────────────────
// 합치기 · rules + classifier
// ────────────────────────────────────────────────────────────────────────────

const ORDER: InputRoute[] = ['light', 'normal', 'deep'];

/** rules 가 확정한 것은 classifier 를 부르지 않는다 */
export function needsClassifier(d: RouteDecision): boolean {
  return d.stage === 'rules' && d.confidence < 0.8;
}

export function merge(rules: RouteDecision, verdict: ClassifierVerdict | null): RouteDecision {
  if (!needsClassifier(rules)) return rules;
  const flags = { ...rules.flags, minor: rules.flags.minor || (verdict?.minor ?? false), abuse: rules.flags.abuse || (verdict?.abuse ?? false) };
  if (!verdict) {
    // 분류 실패. 위기 후보는 위기로, 나머지는 normal 로 내려 답변은 나가게 한다
    const route: InputRoute = rules.route === 'crisis' ? 'crisis' : 'normal';
    return decide(route, 'fallback', 0.4, { ...rules, flags, reasons: [...rules.reasons, 'classifier_failed'] });
  }
  const reasons = [...rules.reasons, ...verdict.reasons.map((r) => `clf:${r}`)];
  // crisis 는 어느 층이든 올리면 올라간다. 내리는 것은 rules 가 crisis_soft 였고 classifier 가 none 일 때만
  if (verdict.route === 'crisis') {
    // rules 가 acute 로 못박았으면 그대로 둔다. classifier 가 새로 올린 것은 distress 로 받는다
    const level: CrisisLevel = rules.crisisLevel === 'acute' ? 'acute' : 'distress';
    return decide('crisis', 'classifier', Math.max(verdict.confidence, 0.7), { ...rules, flags, reasons, crisisLevel: level });
  }
  if (rules.route === 'crisis' && rules.floor === 'normal' && verdict.confidence < 0.6) {
    // 확신 없는 「관용 표현」 판정은 믿지 않는다. 안전한 쪽으로 남긴다
    return decide('crisis', 'classifier', 0.6, { ...rules, flags, reasons: [...reasons, 'crisis_kept_low_confidence'] });
  }
  // invalid 는 rules 만 정한다. classifier 가 invalid 라고 해도 light 로 받아 캐릭터 답변을 준다
  let route: InputRoute = verdict.route === 'invalid' ? 'light' : verdict.route;
  // deep 은 확신이 있어야 한다. 길이 때문에 올라간 deep 은 classifier 가 낮게 보면 normal
  if (route === 'deep' && verdict.confidence < 0.6) { route = 'normal'; reasons.push('deep_low_confidence'); }
  // 승격 바닥
  if (rules.floor && ORDER.indexOf(route) < ORDER.indexOf(rules.floor)) { route = rules.floor; reasons.push('floor_applied'); }
  return decide(route, 'classifier', verdict.confidence, { ...rules, flags, reasons });
}

/**
 * 위기 안내를 본 사람이 「그래도 이야기를 들어주세요」를 눌렀을 때만 부른다.
 * distress 만 통과한다. acute 는 여기서 막히므로 방법·수단을 물은 글은 모델에 닿지 않는다.
 * 통과해도 답변 규격이 다르다. 분석·행동 지침 없이 위로 한 겹과 창구 카드만 나간다(LENGTH_POLICY.solace).
 * 프론트가 혼자 부르지 않는다. 서버가 같은 원문으로 다시 판정해 같은 답을 얻어야 연다.
 */
export function escalateToSolace(d: RouteDecision): RouteDecision | null {
  if (d.route !== 'crisis') return null;
  if (d.crisisLevel !== 'distress') return null;
  return {
    ...d,
    route: 'solace',
    modelTier: TIER.solace,
    useRag: RAG.solace,
    reasons: [...d.reasons, 'user_asked_to_continue'],
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 화면 인디케이터. 라우팅 규칙이 아니라 「더 쓰게 만드는」 장치다. 서버 판정과 독립
// ────────────────────────────────────────────────────────────────────────────

export type Depth = 1 | 2 | 3;
export function depthIndicator(raw: string): { dots: Depth; label: string } {
  const text = normalize(raw);
  const chars = countChars(text);
  const lines = text ? text.split('\n').filter((l) => l.trim()).length : 0;
  const rich = chars >= 100 || (lines >= 3 && chars >= 24);   // 라우팅 규칙이 아니다. 「응」 세 줄만 막는다
  if (chars === 0) return { dots: 1, label: '자세히 들려줄수록 더 깊게 이해할 수 있어요' };
  if (rich) return { dots: 3, label: '✨ 이제 꽤 깊게 이야기해볼 수 있겠어요' };
  return { dots: 2, label: '조금만 더 이야기해주시면 상황을 더 잘 볼 수 있어요' };
}

/** 분량 규약. 글자 수는 상한이 아니라 밀도 기준이다. 문장 반복으로 채우지 않는다 */
export const LENGTH_POLICY = {
  light:  { total: [250, 600],  scriptures: 0, analysisSections: 0, actions: [0, 1] },
  normal: { total: [700, 1100], scriptures: 1, analysisSections: 1, actions: [1, 2] },
  deep:   { total: [1300, 2000], scriptures: [1, 2], analysisSections: [2, 3], actions: [1, 3] },
  /**
   * 위로 답변. 짧게 쓴다. 상황을 해석하지 않고 지금 무엇을 하라고도 말하지 않는다.
   * action 하나는 「물 한 잔」 「창문 열기」 「그 사람에게 전화」 수준의 몸으로 하는 것만 허용한다.
   */
  solace: { total: [300, 650], scriptures: 1, analysisSections: 0, actions: [0, 1] },
} as const;

/**
 * 위로 답변이 절대 담으면 안 되는 것. 생성 뒤 이 검사를 통과해야 화면에 나간다.
 * 걸리면 문장을 고치지 않고 통째로 버린 뒤 고정 문구로 대체하고 사건을 남긴다.
 * 앱인토스 「AI 채팅·상담」 3) 폭력·자해·자살: 방법 설명·구체적 묘사·모방 가능한 표현 금지.
 */
export const SOLACE_FORBIDDEN = [
  /방법|수단|요령|치사|약을?\s?(모으|먹)|번개탄|목을?\s?매|손목|뛰어내리/,
  /어떻게\s?(죽|하면\s?죽)/, /고통\s?없이|안\s?아프게/,
  /(죽는|떠나는)\s?것도\s?(하나의|한)\s?(선택|방법)/, /이해(해요|합니다|가\s?가)/,
];

/** 위로 답변이 검사에 걸렸을 때 대신 내보내는 고정 문장. 모델을 다시 부르지 않는다 */
export const SOLACE_FALLBACK =
  '지금 여기까지 이야기해 주신 것만으로도 충분히 애쓰셨어요.\n' +
  '이 마음은 혼자 들기에 너무 무거워요. 아래 번호로 지금 연락해 보셔요.';
