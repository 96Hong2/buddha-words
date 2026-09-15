/**
 * 지난 답변을 되짚는 홈 카드.
 *
 * 재료는 기기 Storage 에 남긴 `{ answerId, date, tags, firstActionTitle }` 뿐이다.
 * 고민 원문과 답변 본문은 어디에도 저장하지 않으므로 이 카드에 원문이 나올 수 없다.
 * 어느 쪽을 눌러도 입력창으로 초점이 간다.
 */

import { useEffect, useRef } from 'react';

import { useAnalytics } from '../../shared/analytics';
import { TEST_IDS, testId } from '../../shared/testIds';
import type { KeyValueStore } from '../../shared/toss';

import './daily.css';

/**
 * 입력칸에서 초점이 빠져나가지 않게 한다.
 * 초점이 빠지면 홈이 다시 그려지면서 버튼 노드가 바뀌어, 누르던 클릭이 사라진다.
 * 예시 칩과 전송 버튼이 이미 같은 처리를 하고 있는데 이 카드만 빠져 있었다.
 */
function keepFocus(event: { preventDefault: () => void }): void {
  event.preventDefault();
}

const KEY = 'recall-last';
const DAY_MS = 24 * 60 * 60 * 1000;

/** 기기에 남기는 것 전부. 여기에 원문을 더하지 않는다 */
export interface RecallEntry {
  answerId: string;
  /** 답변을 받은 날 (YYYY-MM-DD, 사용자 시간대) */
  date: string;
  tags: string[];
  /** 그날 적어 드린 행동 하나의 제목 */
  firstActionTitle: string;
}

function isEntry(value: unknown): value is RecallEntry {
  if (value == null || typeof value !== 'object') return false;
  const entry = value as Partial<RecallEntry>;
  return (
    typeof entry.answerId === 'string' &&
    typeof entry.date === 'string' &&
    typeof entry.firstActionTitle === 'string' &&
    Array.isArray(entry.tags)
  );
}

/** 못 읽으면 카드가 없는 것으로 본다 */
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

/** 답변을 받은 쪽이 부른다. 실패해도 답변 흐름을 막지 않는다 */
export async function writeRecall(store: KeyValueStore, entry: RecallEntry): Promise<void> {
  try {
    await store.set(KEY, JSON.stringify(entry));
  } catch {
    // 회고 카드는 있으면 좋은 것이다. 못 남겨도 오늘 답변은 그대로다.
  }
}

/**
 * 한 번 답한 카드는 지운다.
 *
 * 화면에서만 치우면 기기에는 그대로 남아, 앱을 다시 열 때마다 같은 것을 또 묻는다.
 * 지우기가 실패하면 다음 진입에 한 번 더 뜬다. 그 실패로 홈을 멈추지는 않는다.
 */
export async function clearRecall(store: KeyValueStore): Promise<void> {
  try {
    await store.remove(KEY);
  } catch {
    // 지우지 못했다. 카드가 한 번 더 뜨는 것 말고 달라지는 것은 없다.
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
export function recallWording(entry: RecallEntry, since: number): { key: string; when: string } {
  if (since <= 1) return { key: '어제 이야기', when: '어제' };
  const day = monthDay(entry.date);
  return { key: '지난 이야기', when: day != null ? `${day}에` : '지난번에' };
}

export interface RecallCardProps {
  entry: RecallEntry;
  /** 「해봤어요」면 true. 어느 쪽이든 입력창으로 보낸다 */
  onRespond: (done: boolean) => void;
}

export function RecallCard({ entry, onRespond }: RecallCardProps) {
  const analytics = useAnalytics();
  const since = daysSince(entry.date);
  const { key, when } = recallWording(entry, since);
  const seen = useRef('');

  useEffect(() => {
    if (seen.current === entry.answerId) return;
    seen.current = entry.answerId;
    analytics.log('recall_card_impression', { days_since: since }, { kind: 'impression' });
  }, [analytics, entry.answerId, since]);

  function respond(done: boolean): void {
    analytics.log('recall_card_click', { days_since: since }, { kind: 'click' });
    onRespond(done);
  }

  return (
    <div className="recall-card" {...testId(TEST_IDS.recallCard)}>
      <span className="recall-card__text">
        <span className="recall-card__key">{key}</span>
        <span className="recall-card__line">
          {when} 적어 드린 「{entry.firstActionTitle}」는 해 보셨나요?
        </span>
      </span>
      <span className="recall-card__buttons">
        <button type="button" onMouseDown={keepFocus} onClick={() => respond(true)}>
          해봤어요
        </button>
        <button type="button" onMouseDown={keepFocus} onClick={() => respond(false)}>
          아직이요
        </button>
      </span>
    </div>
  );
}
