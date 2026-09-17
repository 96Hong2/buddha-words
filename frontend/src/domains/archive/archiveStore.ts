/**
 * 간직한 말씀을 기기에 두는 자리.
 *
 * 서버에 올리지 않는다. 무엇을 간직했는지는 그 사람의 마음이고, 익명키에 붙여 두면
 * 그것 자체가 사람을 가리키는 값이 된다.
 * **고민 원문은 어떤 필드에도 담지 않는다.** 남기는 것은 화면에 나갔던 답변 쪽뿐이다.
 *
 * 답변 본문(경전·풀이·분석·할 수 있는 것)까지 남기는 이유: 간직해 놓고 다시 못 보면
 * 간직하기가 아무것도 하지 않은 것이 된다. 앱을 닫으면 세션의 답변은 사라지므로
 * 이 자리에 없는 것은 어디에도 없다. 개인정보 안내(PrivacyScreen)에도 같은 말을 적어 둔다.
 *
 * 훅이 아니라 함수다. 간직 버튼은 answer 화면에 있어서, 그쪽이 화면을 거치지 않고 부른다.
 */

import {
  isEmotionTag,
  type Action,
  type AnalysisSection,
  type EmotionTag,
  type Scripture,
  type Term,
  type VisualTheme,
} from '../../shared/api';

const KEY = 'buddha.archive.v1';

/**
 * 다시 펼쳐 보려고 함께 남기는 답변 본문.
 *
 * 전부 물음표가 붙어 있다. 요청2가 오기 전에 간직하면 경전만 있고, 앞선 판에서 간직한 것은
 * 아무것도 없다. 없는 것을 있는 척 채우지 않고 화면이 있는 만큼만 그린다.
 */
export interface SavedDetail {
  /** 사람이 감수한 구절 그대로. 모델이 만든 문장이 아니다 */
  scripture?: Scripture;
  /** 「이 말씀은 이런 뜻이에요」 */
  explanation?: string;
  terms?: Term[];
  /** 「당신의 이야기를 보면」 */
  analysis?: AnalysisSection[];
  /** 「지금 할 수 있는 것」 */
  actions?: Action[];
  /** 마지막 한마디 */
  closing?: string;
  /** 광고를 보고 받은 「다른 관점」. 받지 않고 간직했으면 없다 */
  extension?: SavedExtension;
}

/**
 * 「조금 더 깊게 보고 싶다면」으로 받은 한 덩이.
 *
 * 받으려면 광고를 끝까지 봐야 해서, 간직해 놓고 사라지면 가장 아깝다.
 * 구절만 있고 나머지가 깨진 값도 살린다. 통째로 버리면 광고를 본 대가가 사라진다.
 */
export interface SavedExtension {
  scripture: Scripture;
  /** 앞의 풀이와 다른 쪽에서 본 한 단락 */
  alternativeAnalysis?: AnalysisSection;
  action?: Action;
}

export interface SavedAnswer {
  answerId: string;
  /** 간직한 시각. 화면에는 날짜만 그린다 */
  savedAt: number;
  /** 오늘의 부처의 말 한 줄 */
  line: string;
  tags: EmotionTag[];
  visualTheme: VisualTheme;
  /** 눌렀을 때 펼칠 답변 본문. 앞선 판에서 간직한 것에는 없다 */
  detail?: SavedDetail;
}

export type SavedInput = Omit<SavedAnswer, 'savedAt'>;

export type SaveResult =
  /** 간직했다. `slotIndex` 는 몇 번째로 간직한 것인지(1부터) */
  | { status: 'saved'; slotIndex: number }
  /** 이미 간직한 답변이다. 같은 것을 두 번 담지 않는다 */
  | { status: 'already'; slotIndex: number };

interface Stored {
  version: 1;
  items: SavedAnswer[];
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function parseList<T>(value: unknown, one: (raw: unknown) => T | undefined): T[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const parsed = value.map(one).filter((item): item is T => item != null);
  return parsed.length > 0 ? parsed : undefined;
}

function parseSection(value: unknown): AnalysisSection | undefined {
  if (typeof value !== 'object' || value == null) return undefined;
  const item = value as Partial<AnalysisSection>;
  if (typeof item.heading !== 'string' || typeof item.body !== 'string') return undefined;
  return { heading: item.heading, body: item.body };
}

function parseAction(value: unknown): Action | undefined {
  if (typeof value !== 'object' || value == null) return undefined;
  const item = value as Partial<Action>;
  if (typeof item.title !== 'string') return undefined;
  return { title: item.title, why: str(item.why) };
}

function parseTerm(value: unknown): Term | undefined {
  if (typeof value !== 'object' || value == null) return undefined;
  const item = value as Partial<Term>;
  if (typeof item.word !== 'string' || typeof item.gloss !== 'string') return undefined;
  return { word: item.word, gloss: item.gloss };
}

/** 필드를 하나씩 골라 담는다. 통째로 펼치면 기기에 남아 있던 모르는 값이 화면까지 흘러간다 */
function parseScripture(value: unknown): Scripture | undefined {
  if (typeof value !== 'object' || value == null) return undefined;
  const item = value as Partial<Scripture>;
  if (typeof item.id !== 'string' || typeof item.text !== 'string') return undefined;

  const source = typeof item.source === 'object' && item.source != null ? item.source : {};
  const label =
    typeof item.attribution === 'object' && item.attribution != null
      ? str(item.attribution.displayLabel)
      : undefined;

  return {
    id: item.id,
    text: item.text,
    citation: typeof item.citation === 'string' ? item.citation : '',
    terms: parseList(item.terms, parseTerm),
    source: {
      base: str(source.base),
      translator: str(source.translator),
      license: str(source.license),
      // 저본 문장과 한문·팔리 원문. 빼고 읽으면 다시 열었을 때 원문 자리가 비고,
      // 그 상태로 다시 쓰이면서 기기에 남아 있던 원문까지 지워진다
      note: str(source.note),
      originalLabel: str(source.originalLabel),
      originalText: str(source.originalText),
    },
    attribution: label != null ? { displayLabel: label } : undefined,
  };
}

function parseExtension(value: unknown): SavedExtension | undefined {
  if (typeof value !== 'object' || value == null) return undefined;
  const raw = value as Record<string, unknown>;
  const scripture = parseScripture(raw.scripture);
  if (scripture == null) return undefined;
  return {
    scripture,
    alternativeAnalysis: parseSection(raw.alternativeAnalysis),
    action: parseAction(raw.action),
  };
}

/**
 * 기기에 남아 있던 답변 본문을 지금 판이 그릴 수 있는 만큼만 읽는다.
 * 한 조각이 깨져 있어도 나머지는 살린다. 통째로 버리면 간직한 말이 사라진다.
 */
function parseDetail(value: unknown): SavedDetail | undefined {
  if (typeof value !== 'object' || value == null) return undefined;
  const raw = value as Record<string, unknown>;
  const detail: SavedDetail = {
    scripture: parseScripture(raw.scripture),
    explanation: str(raw.explanation),
    terms: parseList(raw.terms, parseTerm),
    analysis: parseList(raw.analysis, parseSection),
    actions: parseList(raw.actions, parseAction),
    closing: str(raw.closing),
    extension: parseExtension(raw.extension),
  };
  return Object.values(detail).some((part) => part != null) ? detail : undefined;
}

/**
 * 이미 간직한 답에 나중에 받은 조각을 채운다. 있는 값은 건드리지 않는다.
 *
 * 간직한 다음에 광고를 보고 「다른 관점」을 받는 순서가 있다. 그때 다시 간직하기를 누르면
 * 「이미 있어요」로 끝나서, 광고를 끝까지 보고 받은 것이 어디에도 남지 않았다.
 */
function fillDetail(kept?: SavedDetail, fresh?: SavedDetail): SavedDetail | undefined {
  if (fresh == null) return kept;
  if (kept == null) return fresh;
  return {
    scripture: kept.scripture ?? fresh.scripture,
    explanation: kept.explanation ?? fresh.explanation,
    terms: kept.terms ?? fresh.terms,
    analysis: kept.analysis ?? fresh.analysis,
    actions: kept.actions ?? fresh.actions,
    closing: kept.closing ?? fresh.closing,
    extension: kept.extension ?? fresh.extension,
  };
}

/**
 * 기기에 남아 있던 한 줄을 지금 판이 그릴 수 있는 모양으로 읽는다. 아니면 null.
 *
 * **태그는 값까지 본다.** 모르는 태그가 섞여 있으면 화면이 표에서 못 찾고 그리다 죽는데,
 * 그 값은 기기에 계속 남아 있어 다시 열어도 같은 자리에서 또 죽는다. 모르는 태그는 칩만
 * 빼고 간직한 말은 남긴다. 이제는 보관함에서 지울 수도 있다.
 */
function parseSaved(value: unknown): SavedAnswer | null {
  if (typeof value !== 'object' || value == null) return null;
  const item = value as Partial<SavedAnswer>;
  if (
    typeof item.answerId !== 'string' ||
    typeof item.savedAt !== 'number' ||
    typeof item.line !== 'string' ||
    !Array.isArray(item.tags) ||
    typeof item.visualTheme !== 'string'
  ) {
    return null;
  }
  return {
    answerId: item.answerId,
    savedAt: item.savedAt,
    line: item.line,
    tags: item.tags.filter(isEmotionTag),
    visualTheme: item.visualTheme,
    detail: parseDetail(item.detail),
  };
}

function read(): SavedAnswer[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw == null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed == null) return [];
    const items = (parsed as Partial<Stored>).items;
    if (!Array.isArray(items)) return [];
    return items.map(parseSaved).filter((item): item is SavedAnswer => item != null);
  } catch {
    // 저장소가 막혔거나 값이 깨졌다. 빈 보관함으로 본다.
    return [];
  }
}

function write(items: SavedAnswer[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, items } satisfies Stored));
    return true;
  } catch {
    return false;
  }
}

/** 간직한 순서대로. 새로 간직한 것이 앞에 온다 */
export function listSaved(): SavedAnswer[] {
  return read().sort((a, b) => b.savedAt - a.savedAt);
}

export function countSaved(): number {
  return read().length;
}

/**
 * 이 답변이 이미 보관함에 있나.
 *
 * 간직하기 앞에 광고를 두면서 필요해졌다. 이미 담긴 것을 또 담으라고 광고를 보여 주면
 * 끝까지 보고 나서 「이미 보관함에 있어요」를 만난다. 그건 값을 받고 아무것도 안 준 것이다.
 */
export function isSaved(answerId: string): boolean {
  return read().some((item) => item.answerId === answerId);
}

/**
 * 간직한다.
 *
 * **개수 제한이 없다.** 예전에는 셋까지만 담기고 넷째부터 이용권을 물었는데, 간직하기는
 * 사람이 그 말을 다시 보고 싶어서 누르는 자리라 거기를 막으면 앱이 주려는 것 자체가 막힌다.
 * 지금 문지기는 짧은 광고 하나이고 그 판단은 부르는 쪽(AnswerRoute)이 한다.
 */
export function saveAnswer(entry: SavedInput): SaveResult {
  const items = read();

  const already = items.findIndex((item) => item.answerId === entry.answerId);
  if (already >= 0) {
    // 자리를 더 쓰지는 않지만, 그새 늘어난 조각은 마저 담는다
    const kept = items[already];
    const next = [...items];
    next[already] = { ...kept, detail: fillDetail(kept.detail, entry.detail) };
    write(next);
    return { status: 'already', slotIndex: already + 1 };
  }

  const slotIndex = items.length + 1;
  write([...items, { ...entry, savedAt: Date.now() }]);
  return { status: 'saved', slotIndex };
}

/** 간직한 것 하나를 지운다. 지운 것이 있으면 true */
export function removeSaved(answerId: string): boolean {
  const items = read();
  const left = items.filter((item) => item.answerId !== answerId);
  if (left.length === items.length) return false;
  return write(left);
}
