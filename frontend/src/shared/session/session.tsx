/**
 * 한 번의 이야기(고민 → 답변)가 화면을 건너 다니는 자리.
 *
 * 전역 스토어가 아니다. 서버 상태는 여기 두지 않고, 화면 사이를 넘어야 하는 것만 둔다:
 * 적은 글 · 방금 받은 응답 · 멱등키. 위기 화면에서 「닫고 돌아가기」를 눌렀을 때
 * 적은 글이 살아 있어야 하는 이유도 이것이다.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { useBridge } from '../../app/providers/bridgeContext';
import type { ApiResponse } from '../api/types';
import type { MiniAppBridge } from '../toss';

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
    else
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ text, savedAt: Date.now() } satisfies StoredDraft),
      );
  } catch {
    // 저장이 막혀도 쓰던 글은 메모리에 남아 있다. 여기서 막으면 입력이 멈춘다.
  }
}

/** 콘솔에 등록한 비소모품. 「마음 보관함 이용권」 하나뿐이다 */
export const ARCHIVE_PASS_SKU = 'archive_pass';

/**
 * 이용권 기기 캐시.
 *
 * 보유의 근거가 아니라 첫 화면을 빨리 그리기 위한 사본이다. 근거는 토스 주문 이력이고,
 * 이 값과 어긋나면 이력이 이긴다.
 */
const PASS_CACHE_KEY = 'archive-pass';

/** 'unknown' 은 아직 복원 결과를 못 받은 상태. 없는 것과 모르는 것을 가른다 */
export type ArchivePassState = 'unknown' | 'none' | 'owned';

/**
 * 이용권을 사려고 한 한 번의 끝.
 *
 * `unsupported` 를 `failed` 와 가르는 이유: 이 토스 앱 버전에서는 주문서 자체가 안 열려서
 * 다시 눌러도 결과가 같다. 「잠시 뒤에 다시 시도해 주세요」라고 말하면 사람을 헛되이 돌린다.
 */
export type ArchivePurchaseOutcome = 'completed' | 'cancelled' | 'failed' | 'unsupported';

declare global {
  interface Window {
    /** e2e·개발이 제품 플래그를 밀어 넣는 자리 */
    __buddhaFlags?: { iap?: { archivePass?: boolean } };
  }
}

/**
 * `iap.archivePass`. 이용권 판매를 켜고 끈다.
 *
 * **기본은 꺼져 있다.** 사업자·정산 승인 전에는 팔 수 없고, 승인 전에 심사를 내는 빌드가
 * 기본값이기 때문이다. 팔려면 `VITE_IAP_ARCHIVE_PASS=on` 으로 빌드한다.
 * 꺼져 있으면 네 번째 간직하기에서 결제 시트 대신 자리가 찼다는 안내만 뜬다.
 */
export function isArchivePassEnabled(): boolean {
  const dial = typeof window === 'undefined' ? undefined : window.__buddhaFlags?.iap?.archivePass;
  if (typeof dial === 'boolean') return dial;
  return import.meta.env.VITE_IAP_ARCHIVE_PASS === 'on';
}

/**
 * 토스에 남은 주문 이력으로 이용권 보유를 판정한다.
 *
 * `null` 은 「못 읽었다」다. 「없다」와 갈라야 기기 캐시를 지우지 않는다.
 * 환불된 주문은 이력에서 빠져 오므로 이 자리에서 회수도 같이 반영된다.
 */
async function restoreArchivePass(bridge: MiniAppBridge): Promise<boolean | null> {
  if (!bridge.supports('purchase')) return null;

  let orders;
  try {
    orders = await bridge.purchase.restore();
  } catch {
    return null;
  }

  const ours = orders.filter((order) => order.sku === ARCHIVE_PASS_SKU);
  if (ours.length === 0) return false;

  // 돈은 받았는데 지급을 못 마친 주문이 남아 있으면 여기서 마저 준다.
  for (const order of ours) {
    if (order.pending) await bridge.purchase.completeGrant(order.orderId);
  }
  return true;
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

  /** 마음 보관함 이용권을 가지고 있나. 이야기 하나가 끝나도 지워지지 않는다 */
  archivePass: ArchivePassState;
  /** 이용권을 산다. 주문서부터 지급까지 한 번에 하고 결과만 돌려준다 */
  buyArchivePass: () => Promise<ArchivePurchaseOutcome>;
  /**
   * 토스 주문 이력을 다시 읽어 이용권 상태를 맞춘다. 설정의 「구매 내역 다시 확인」이 부른다.
   * 못 읽으면 `unknown` 을 돌려주고 지금 상태를 그대로 둔다. 산 사람의 이용권을 지우지 않는다.
   */
  refreshArchivePass: () => Promise<ArchivePassState>;
}

const SessionContext = createContext<SessionValue | null>(null);

function newKey(): string {
  const c = globalThis.crypto;
  if (c != null && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const bridge = useBridge();
  const [draft, setDraftState] = useState<string>(() => readDraft());
  const [archivePass, setArchivePass] = useState<ArchivePassState>('unknown');
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

  /**
   * 앱을 열 때 한 번 이용권을 맞춘다.
   *
   * 여기서 하는 이유: 결제는 토스 계정에 남고 기기에는 안 남는다. 앱을 지웠다 다시 깔면
   * 기기 캐시가 비어 있어서, 산 사람이 잠긴 보관함을 보게 된다. 보관함 화면에서 부르면
   * 그 화면에 들어온 사람만 복원되고, 결제 직전에 부르면 이미 늦다.
   *
   * 화면을 그리기 전에 기다리지 않는다. 캐시로 먼저 그리고 이력이 오면 고친다.
   */
  const refreshArchivePass = useCallback(async (): Promise<ArchivePassState> => {
    const owned = await restoreArchivePass(bridge);
    // null 은 못 읽은 것이다. 캐시를 덮어쓰면 산 사람의 이용권이 사라진다.
    if (owned == null) return 'unknown';
    setArchivePass(owned ? 'owned' : 'none');
    await bridge.storage.set(PASS_CACHE_KEY, owned ? '1' : '0');
    return owned ? 'owned' : 'none';
  }, [bridge]);

  useEffect(() => {
    let cancelled = false;

    void bridge.storage.get(PASS_CACHE_KEY).then((cached) => {
      if (cancelled || cached == null) return;
      setArchivePass((prev) => (prev === 'unknown' ? (cached === '1' ? 'owned' : 'none') : prev));
    });

    void refreshArchivePass();

    return () => {
      cancelled = true;
    };
  }, [bridge, refreshArchivePass]);

  const buyArchivePass = useCallback(async (): Promise<ArchivePurchaseOutcome> => {
    const result = await bridge.purchase.buy(ARCHIVE_PASS_SKU, async (orderId) => {
      // 돈을 받은 그 자리다. 여기서 이용권을 열고 기기에도 적어 둔다.
      // 익명키에 붙는 서버 지급은 아직 없다. 재설치 복원은 토스 주문 이력이 맡는다.
      void orderId;
      setArchivePass('owned');
      await bridge.storage.set(PASS_CACHE_KEY, '1');
      return true;
    });
    // 못 쓰는 버전인 것과 이번에 안 된 것은 사람에게 할 말이 다르다.
    if (result.status === 'failed') {
      return result.reason === 'unsupported' ? 'unsupported' : 'failed';
    }
    return result.status;
  }, [bridge]);

  const value = useMemo<SessionValue>(
    () => ({
      draft,
      setDraft,
      sent,
      response,
      idempotencyKey,
      beginSubmit,
      setResponse,
      clear,
      archivePass,
      buyArchivePass,
      refreshArchivePass,
    }),
    [
      draft,
      setDraft,
      sent,
      response,
      idempotencyKey,
      beginSubmit,
      clear,
      archivePass,
      buyArchivePass,
      refreshArchivePass,
    ],
  );

  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (value == null) throw new Error('useSession 은 SessionProvider 안에서만 쓸 수 있어요.');
  return value;
}
