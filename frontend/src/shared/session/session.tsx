/**
 * 한 번의 이야기(고민 → 답변)가 화면을 건너 다니는 자리.
 *
 * 전역 스토어가 아니다. 서버 상태는 여기 두지 않고, 화면 사이를 넘어야 하는 것만 둔다:
 * 적은 글 · 방금 받은 응답 · 멱등키. 위기 화면에서 「닫고 돌아가기」를 눌렀을 때
 * 적은 글이 살아 있어야 하는 이유도 이것이다.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import type { ApiResponse } from '../api/types';

const DRAFT_KEY = 'buddha.draft.v1';
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

interface StoredDraft {
  text: string;
  savedAt: number;
}

function readDraft(): string {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw == null) return '';
    const parsed = JSON.parse(raw) as StoredDraft;
    if (Date.now() - parsed.savedAt > DRAFT_TTL_MS) return '';
    return parsed.text ?? '';
  } catch {
    return '';
  }
}

function writeDraft(text: string): void {
  try {
    if (text.trim() === '') localStorage.removeItem(DRAFT_KEY);
    else localStorage.setItem(DRAFT_KEY, JSON.stringify({ text, savedAt: Date.now() } satisfies StoredDraft));
  } catch {
    // 저장이 막혀도 쓰던 글은 메모리에 남아 있다. 여기서 막으면 입력이 멈춘다.
  }
}

interface SessionValue {
  /** 지금 입력창에 있는 글. 위기 화면을 닫아도 지워지지 않는다 */
  draft: string;
  setDraft: (text: string) => void;
  /** 전송한 글. 답변 화면이 다시 요청할 때 쓴다 */
  sent: string;
  response: ApiResponse | null;
  idempotencyKey: string;
  beginSubmit: (text: string) => string;
  setResponse: (res: ApiResponse | null) => void;
  clear: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

function newKey(): string {
  const c = globalThis.crypto;
  if (c != null && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [draft, setDraftState] = useState<string>(() => readDraft());
  const [sent, setSent] = useState('');
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [idempotencyKey, setKey] = useState('');

  const setDraft = useCallback((text: string) => {
    setDraftState(text);
    writeDraft(text);
  }, []);

  const beginSubmit = useCallback((text: string) => {
    const key = newKey();
    setSent(text);
    setKey(key);
    setResponse(null);
    return key;
  }, []);

  const clear = useCallback(() => {
    setDraftState('');
    writeDraft('');
    setSent('');
    setResponse(null);
    setKey('');
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ draft, setDraft, sent, response, idempotencyKey, beginSubmit, setResponse, clear }),
    [draft, setDraft, sent, response, idempotencyKey, beginSubmit, clear],
  );

  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (value == null) throw new Error('useSession 은 SessionProvider 안에서만 쓸 수 있어요.');
  return value;
}
