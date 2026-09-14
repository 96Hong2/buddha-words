/**
 * 간직한 말씀을 기기에 두는 자리.
 *
 * 서버에 올리지 않는다. 무엇을 간직했는지는 그 사람의 마음이고, 익명키에 붙여 두면
 * 그것 자체가 사람을 가리키는 값이 된다.
 * **고민 원문은 어떤 필드에도 담지 않는다.** 답변의 한 줄과 태그·그림만 남긴다.
 *
 * 훅이 아니라 함수다. 간직 버튼은 answer 화면에 있어서, 그쪽이 화면을 거치지 않고 부른다.
 */

import type { EmotionTag, VisualTheme } from '../../shared/api';

const KEY = 'buddha.archive.v1';

/** 여기까지 쌓이고 그다음부터 이용권을 묻는다 */
export const SAVE_LIMIT = 3;

export interface SavedAnswer {
  answerId: string;
  /** 간직한 시각. 화면에는 날짜만 그린다 */
  savedAt: number;
  /** 오늘의 부처의 말 한 줄 */
  line: string;
  tags: EmotionTag[];
  visualTheme: VisualTheme;
}

export type SavedInput = Omit<SavedAnswer, 'savedAt'>;

export type SaveResult =
  /** 간직했다. `slotIndex` 는 몇 번째 자리인지(1부터) */
  | { status: 'saved'; slotIndex: number }
  /** 이미 간직한 답변이다. 자리를 더 쓰지 않는다 */
  | { status: 'already'; slotIndex: number }
  /** 자리가 다 찼다. 네 번째라 Paywall 을 연다 */
  | { status: 'limit'; slotIndex: number };

interface Stored {
  version: 1;
  items: SavedAnswer[];
}

function isSaved(value: unknown): value is SavedAnswer {
  if (typeof value !== 'object' || value == null) return false;
  const item = value as Partial<SavedAnswer>;
  return (
    typeof item.answerId === 'string' &&
    typeof item.savedAt === 'number' &&
    typeof item.line === 'string' &&
    Array.isArray(item.tags) &&
    typeof item.visualTheme === 'string'
  );
}

function read(): SavedAnswer[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw == null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed == null) return [];
    const items = (parsed as Partial<Stored>).items;
    if (!Array.isArray(items)) return [];
    return items.filter(isSaved);
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
 * 간직한다.
 *
 * 자리가 찼으면 아무것도 쓰지 않고 `limit` 을 돌려준다. 부르는 쪽이 그 값을 보고 Paywall 을 연다.
 * 저장이 막힌 기기에서도 `limit` 이 아니라 `saved` 로 답한다. 화면이 「간직했어요」라고 말한 뒤
 * 목록에 없으면 그것대로 이상하지만, 자리가 찬 것처럼 이용권을 묻는 쪽이 더 나쁘다.
 */
export function saveAnswer(entry: SavedInput): SaveResult {
  const items = read();

  const already = items.findIndex((item) => item.answerId === entry.answerId);
  if (already >= 0) return { status: 'already', slotIndex: already + 1 };

  const slotIndex = items.length + 1;
  if (items.length >= SAVE_LIMIT) return { status: 'limit', slotIndex };

  write([...items, { ...entry, savedAt: Date.now() }]);
  return { status: 'saved', slotIndex };
}
