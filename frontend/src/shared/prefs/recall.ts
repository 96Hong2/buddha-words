/**
 * 「내일 이거 했는지 물어봐 주세요」로 남겨 둔 한 줄.
 *
 * ── 예전과 무엇이 달라졌나 ────────────────────────────────────────────────
 *
 * 전에는 답을 받을 때마다 **말없이** 이 값을 남기고, 다음 날 홈 카드로 「어제 적어 드린
 * ~는 해 보셨나요?」를 물었다. 부탁하지 않은 질문이 매일 홈 맨 위에 서 있었고, 답을 받을
 * 때마다 쌓여서 홈이 물음표로 시작했다.
 *
 * 지금은 **사람이 눌렀을 때만** 남긴다. 그리고 홈 카드가 아니라, 알림을 받고 들어오거나
 * 다음 날 처음 열 때 시트 한 장으로 한 번 묻는다. 안 눌렀으면 아무것도 뜨지 않는다.
 *
 * 저장하는 것은 행동 제목과 날짜뿐이다. 고민 원문과 답변 본문은 어디에도 담지 않는다.
 * 저장 자리를 shared 로 옮긴 것은 answer 도메인과 daily 도메인이 같은 값을 쓰기 때문이다.
 * 도메인끼리 서로를 import 하지 않는다.
 */

import type { KeyValueStore } from '../toss';

const KEY = 'recall-last';
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 며칠까지 물어볼까.
 *
 * 이레가 지나면 조용히 버린다. 한 달 만에 온 사람에게 「지난번에 적어 드린 그거 해 보셨나요」는
 * 되짚기가 아니라 빚 독촉이다. 그 사람은 이미 잊었고, 잊은 것을 들춰내는 앱이 된다.
 */
export const RECALL_MAX_DAYS = 7;

/** 오늘은 더 묻지 않기로 한 날. 닫기만 눌러도 여기 적는다 */
const HUSH_KEY = 'buddha.recall-hush.v1';

function today(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * 답하지 않고 닫았다. 오늘은 더 묻지 않는다.
 *
 * 기기에서 지우지는 않는다. 답할 마음이 남아 있을 수 있다. 이 표가 없으면 앱을 열 때마다
 * 같은 질문이 다시 서고, 그것이 예전 회고 카드가 받은 불평 그대로다.
 * 동기 저장소를 쓰는 이유는 첫 페인트에 이미 정해져 있어야 하기 때문이다.
 */
export function hushRecallToday(): void {
  try {
    localStorage.setItem(HUSH_KEY, today());
  } catch {
    // 못 적으면 이번 실행에서만 조용하다. 다음에 한 번 더 뜬다
  }
}

export function recallHushedToday(): boolean {
  try {
    return localStorage.getItem(HUSH_KEY) === today();
  } catch {
    return false;
  }
}

/** 기기에 남기는 것 전부. 여기에 원문을 더하지 않는다 */
export interface RecallEntry {
  answerId: string;
  /** 답변을 받은 날 (YYYY-MM-DD, 사용자 시간대) */
  date: string;
  /** 그날 적어 드린 행동 하나의 제목 */
  firstActionTitle: string;
}

function isEntry(value: unknown): value is RecallEntry {
  if (value == null || typeof value !== 'object') return false;
  const entry = value as Partial<RecallEntry>;
  return (
    typeof entry.answerId === 'string' &&
    typeof entry.date === 'string' &&
    typeof entry.firstActionTitle === 'string'
  );
}

/** 못 읽으면 물어볼 것이 없는 것으로 본다 */
export async function readRecall(store: KeyValueStore): Promise<RecallEntry | null> {
  try {
    const raw = await store.get(KEY);
    if (raw == null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isEntry(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** 사람이 「내일 물어봐 주세요」를 눌렀을 때만 부른다. 실패해도 답변 흐름을 막지 않는다 */
export async function writeRecall(store: KeyValueStore, entry: RecallEntry): Promise<void> {
  try {
    await store.set(KEY, JSON.stringify(entry));
  } catch {
    // 못 남겨도 오늘 답변은 그대로다.
  }
}

/**
 * 한 번 답한 것은 지운다.
 *
 * 화면에서만 치우면 기기에는 그대로 남아, 앱을 다시 열 때마다 같은 것을 또 묻는다.
 * 지우기가 실패하면 다음 진입에 한 번 더 뜬다. 그 실패로 홈을 멈추지는 않는다.
 */
export async function clearRecall(store: KeyValueStore): Promise<void> {
  try {
    await store.remove(KEY);
  } catch {
    // 지우지 못했다. 한 번 더 뜨는 것 말고 달라지는 것은 없다.
  }
}

export function daysSince(dateISO: string, now: Date = new Date()): number {
  const [year, month, date] = dateISO.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(date)) return 0;
  const then = new Date(year, month - 1, date).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.max(0, Math.round((today - then) / DAY_MS));
}

/** '2026-09-08' → '9월 8일'. 못 읽으면 null */
function monthDay(dateISO: string): string | null {
  const [, month, date] = dateISO.split('-').map(Number);
  if (!Number.isFinite(month) || !Number.isFinite(date)) return null;
  return `${month}월 ${date}일`;
}

/**
 * 며칠 만에 왔는지에 따라 부르는 말이 달라진다.
 * 하루 만이면 「어제」, 그 위는 날짜를 그대로 적는다. 일주일 만에 온 사람에게 어제라고 하지 않는다.
 */
export function recallWording(entry: RecallEntry, since: number): string {
  if (since <= 1) return '어제';
  const day = monthDay(entry.date);
  return day != null ? `${day}에` : '지난번에';
}
