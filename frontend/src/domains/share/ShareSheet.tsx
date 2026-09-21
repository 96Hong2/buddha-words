/**
 * 공유 옵션 시트 (O3).
 *
 * ── 무엇을 보낼지 사람이 고른다 ────────────────────────────────────────
 *
 * 둘 중 하나다. 고르는 자리를 글로 설명하지 않고 **미리보기 실물이 바뀌는 것**으로 보인다.
 * 고민을 털어놓은 사람에게 공유는 공포라서, 안심 문구 한 줄보다 나갈 것을 그대로 보이는
 * 쪽이 잘 증명한다.
 *
 *   경전 구절   이 고민과 무관하게 존재하던 글만. 아무나 받아도 사정이 드러나지 않는다
 *   답변 전체   앱에서 보던 그대로. **「당신의 이야기를 보면」이 함께 간다**
 *
 * 전체 쪽은 그 사실을 고르는 자리에서 먼저 말한다. 고르고 나서 알게 되면 늦다.
 *
 * ── 어떻게 보내나 ────────────────────────────────────────────────────
 *
 * 「공유하기」가 토스 네이티브 공유 시트를 연다. 받는 사람은 거기서 고른다(카톡·메시지·
 * 메일·AirDrop). 예전에는 이 버튼이 조용히 주소만 복사하고 시트를 닫아서, 누른 사람은
 * 아무 일도 일어나지 않았다고 느꼈다. 실제로 그 신고를 받았다.
 *
 * 시트를 못 여는 기기에서는 주소를 복사하고 **복사했다고 말한다.** 말없이 복사하지 않는다.
 *
 * 손잡이 · 딤 · 뒤로가기(Esc) 로 닫힌다. 오른쪽 위 X 는 두지 않는다(토스 미니앱 닫기와 같은 자리다).
 */

import { useEffect, useId, useRef, useState } from 'react';

import { useOverlayBackClose } from '../../app/providers';
import { useAnalytics } from '../../shared/analytics';
import { type ApiAnswer, type Scripture, type ShareScope } from '../../shared/api';
import { TEST_IDS, testId } from '../../shared/testIds';

import { ShareCard } from './ShareCard';
import { shareMessage } from './shareText';

import './share.css';

/** 이미지 저장을 맡은 쪽이 돌려주는 결과. 막힌 이유마다 남은 길이 다르다 */
export type ShareSaveResult = 'saved' | 'permission_denied' | 'unsupported' | 'card_failed';

type SaveBlock = Exclude<ShareSaveResult, 'saved'>;

/**
 * 링크를 만드는 일은 서버가 한다. 그동안과 실패했을 때를 화면이 알고 있어야 한다.
 * 이 상태가 없으면 링크 버튼이 늘 눌리는 것처럼 보이다가 빈 주소를 복사한다.
 */
export type ShareLinkState =
  | { status: 'making' }
  | { status: 'ready'; url: string }
  | { status: 'failed' };

/** 네이티브 공유 시트를 연 결과. 스스로 닫은 것은 실패가 아니다 */
export type ShareSendResult = 'sent' | 'dismissed' | 'unsupported';

type Block = SaveBlock | 'link_failed' | 'copy_failed';

/**
 * 범위마다 카드 종류가 다르다. 값은 `spec/events.ts` 가 적어 둔 것이라 여기서 바꾸지 않는다.
 */
const CARD_KIND: Record<ShareScope, string> = {
  scripture: 'scripture',
  full: 'full',
};

/**
 * 고르는 자리에 붙는 한 줄.
 *
 * 전에는 「적은 이야기는 카드에 들어가지 않아요」 하나였다. 이제 범위가 둘이라 같은 말을
 * 쓸 수 없다. **각 줄은 그 범위에서 참인 말만 한다.**
 *
 * ── 전체 쪽 문구를 고친 이유 (2026-09-17) ──────────────────────────────
 *
 * 처음에는 「적으신 글 자체는 들어가지 않아요」라고 적었다. 글자로는 맞는 말이다. 원문
 * 문자열은 어느 칸에도 담기지 않는다(`ShareFullData`).
 *
 * 그런데 실제로 만들어진 링크를 열어 보니 「팀장님」·「그만둘까」 같은 **그 사람이 쓴 낱말이
 * 풀이 안에 그대로 있었다.** 풀이는 그 고민을 읽고 쓴 글이라 당연한 일이다. 받는 사람은
 * 무슨 일이 있었는지 거의 다 읽는다.
 *
 * 그 상태에서 「글 자체는 안 가요」라고 안심시키면, 우리가 지킨 것은 규칙의 글자이고
 * 사람이 믿은 것은 규칙의 뜻이다. 공유 카드에서 한마디를 뺀 것과 같은 이유로(ShareCard.tsx
 * 머리말) 여기서도 **무엇이 실제로 전해지는지**를 말한다.
 *
 * 미리보기가 그 증거다. 글로 안심시키는 대신 나갈 것을 그대로 보인다.
 */
const SCOPE_NOTE: Record<ShareScope, string> = {
  scripture: '경전 구절과 그 뜻만 담겨요. 적으신 이야기도 마음 태그도 들어가지 않아요',
  full: '무슨 일이 있었는지 받는 사람이 짐작할 수 있어요. 아래에서 확인하고 보내세요',
};

const SCOPE_LABEL: Record<ShareScope, string> = {
  scripture: '경전 구절만',
  full: '답변 전체',
};

const BLOCK: Record<
  Block,
  { tone: 'caution' | 'danger'; title: string; desc: string; primary: string; secondary: string }
> = {
  permission_denied: {
    tone: 'caution',
    title: '사진 접근이 꺼져 있어요',
    desc: '설정에서 사진 접근을 켜면 카드를 앨범에 저장할 수 있어요. 지금은 링크로 보낼 수 있어요.',
    primary: '설정 열기',
    secondary: '링크로 보내기',
  },
  unsupported: {
    tone: 'caution',
    title: '이 버전에서는 저장이 안 돼요',
    desc: '토스를 최신으로 업데이트하면 이미지로 저장할 수 있어요. 지금도 링크로는 보낼 수 있어요.',
    primary: '링크 보내기',
    secondary: '닫기',
  },
  card_failed: {
    tone: 'danger',
    title: '카드를 만들지 못했어요',
    desc: '지금은 링크로 보낼 수 있어요. 경전 구절과 귀속, 링크가 함께 나가요.',
    primary: '링크 보내기',
    secondary: '다시 해보기',
  },
  link_failed: {
    tone: 'danger',
    title: '링크를 만들지 못했어요',
    desc: '잠시 뒤에 다시 눌러 주세요.',
    primary: '다시 해보기',
    secondary: '닫기',
  },
  copy_failed: {
    tone: 'caution',
    title: '복사가 막혀 있어요',
    desc: '이 기기가 복사를 막고 있어요. 아래 글을 꾹 눌러 직접 복사하실 수 있어요.',
    primary: '다시 복사하기',
    secondary: '닫기',
  },
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export interface ShareSheetProps {
  open: boolean;
  onClose: () => void;
  answerId: string;
  /**
   * 카드에 실리는 것은 이 고민과 무관하게 존재하던 경전 구절과 그 뜻뿐이다.
   * 오늘 받은 한마디와 마음 태그는 여기로 아예 들어오지 않는다(`ShareCard.tsx` 머리말).
   */
  scripture: Scripture;
  /** 경전 해설. 카드에는 첫 문장만 올라간다 */
  gloss: string;
  /** 지금 고른 범위 */
  scope: ShareScope;
  /** 범위를 바꿨다. 링크를 다시 만드는 일은 부르는 쪽이 한다 */
  onScopeChange: (scope: ShareScope) => void;
  /** 전체 보내기 미리보기에 쓸 답변. 없으면 그 칸을 고를 수 없다 */
  answer?: ApiAnswer | null;
  /** 서버가 만드는 공유 주소. 만드는 중과 실패까지 담는다 */
  link: ShareLinkState;
  /** 링크 만들기를 다시 시킨다 */
  onRetryLink: () => void;
  /** 네이티브 공유 시트를 연다. 주지 않으면 주소를 복사한다 */
  onSendMessage?: (message: string) => Promise<ShareSendResult>;
  /**
   * 카드를 앨범에 저장한다. **주지 않으면 이미지 저장 버튼 자체를 내린다.**
   * 저장할 길이 없는데 버튼만 두면 누른 사람이 매번 안내 하나만 보고 돌아간다.
   */
  onSaveImage?: () => Promise<ShareSaveResult> | ShareSaveResult;
  /** 사진 접근 설정을 연다. 브릿지를 아는 쪽이 넘긴다 */
  onOpenSettings?: () => void;
  /**
   * 어느 화면에서 열렸나. **로그 이름이 갈린다.**
   *
   * 답변 화면은 `share_*` 를, 보관함은 `archive_share_*` 를 쓴다. 자리가 다르면 묻는
   * 것도 다르다: 저쪽은 「답을 받고 바로 보내나」이고 이쪽은 「며칠 뒤에 다시 꺼내 보내나」다.
   * 한 이름으로 합치면 두 질문 다 답할 수 없다. 보관함 쪽 로그는 `ArchiveScreen` 이 찍으므로
   * 여기서는 아무것도 찍지 않는다.
   */
  surface?: 'answer' | 'archive';
  /**
   * 실제로 내보냈다. **무엇으로 나갔는지 부르는 쪽이 알아야 하는 자리다.**
   *
   * 시트는 시스템 공유가 안 되면 스스로 복사로 넘어간다. 그 갈림이 시트 안에서 일어나서,
   * 부르는 쪽은 `onSendMessage` 만 보고 있으면 복사로 끝난 것을 모른다.
   */
  onComplete?: (method: 'system' | 'copy' | 'image') => void;
  /**
   * 「답변 전체」 칸이 잠겼을 때 그 옆에 적는 한 줄.
   *
   * 잠긴 버튼만 두면 왜 못 누르는지 알 길이 없다. 보관함에서는 서버가 답변 본문을
   * 30분만 들고 있어 며칠 뒤에는 링크를 만들 수 없는데, 그 사정을 사람이 알 수는 없다.
   */
  fullNote?: string;
  /** 클립보드가 막혔다. 부르는 쪽이 자기 이름으로 기록한다 */
  onCopyBlocked?: () => void;
}

export function ShareSheet({
  open,
  onClose,
  answerId,
  scripture,
  gloss,
  scope,
  onScopeChange,
  answer,
  link,
  onRetryLink,
  onSendMessage,
  surface = 'answer',
  onComplete,
  fullNote,
  onCopyBlocked,
  onSaveImage,
  onOpenSettings,
}: ShareSheetProps) {
  const analytics = useAnalytics();
  /** 이번에 연 시트가 실제로 공유로 끝났나. 정리 함수가 이 값을 보고 취소를 센다 */
  const completedRef = useRef<(() => void) | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [block, setBlock] = useState<Block | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** 복사가 막혔을 때 손으로 가져갈 수 있게 화면에 내놓는 글. 고민 원문은 여기에도 없다 */
  const [manual, setManual] = useState('');
  const titleId = useId();

  /** 답변 전체가 아직 안 왔으면 그 칸을 고를 수 없다. 없는 것을 보낼 수는 없다 */
  const fullReady = answer != null && answer.pass2.status === 'done';

  /**
   * 시스템 뒤로가기를 이 시트가 가져간다. 등록하지 않으면 뒤로가기가 오버레이를 지나쳐
   * 화면 이동으로 내려가, 시트와 함께 방금 받은 답변까지 홈으로 사라진다.
   */
  useOverlayBackClose(open, () => {
    if (block != null) setBlock(null);
    else onClose();
  });

  useEffect(() => {
    if (!open) return;
    // 보관함에서 연 판은 부르는 쪽이 `archive_share_*` 로 따로 센다
    if (surface === 'answer') {
      analytics.log('share_start', { answer_id: answerId, card_kind: CARD_KIND[scope] });
    }
    // 열고 아무것도 안 하고 닫은 것도 사실이다. 공유가 어디서 끊기는지 이 짝으로 본다
    let completed = false;
    const done = () => {
      completed = true;
    };
    completedRef.current = done;
    return () => {
      if (!completed && surface === 'answer') {
        analytics.log('share_cancel', { answer_id: answerId });
      }
    };
    // 범위를 바꿨다고 새로 연 것으로 세지 않는다. 한 번 연 것은 한 번이다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, answerId, analytics, surface]);

  useEffect(() => {
    if (!open) return;

    sheetRef.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (block != null) setBlock(null);
      else onClose();
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
    };
  }, [open, block, onClose]);

  useEffect(() => {
    if (toast == null) return;
    const timer = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  // 링크가 안 만들어진 것을 누르기 전에 알려 준다. 눌러 봐야 아는 실패는 실패를 두 번 겪게 한다
  useEffect(() => {
    if (!open || link.status !== 'failed') return;
    setBlock('link_failed');
  }, [open, link.status]);

  if (!open) return null;

  function complete(method: 'system' | 'copy' | 'image'): void {
    if (surface === 'answer') {
      analytics.log('share_complete', {
        answer_id: answerId,
        card_kind: CARD_KIND[scope],
        method,
      });
    }
    onComplete?.(method);
    completedRef.current?.();
  }

  function pick(next: ShareScope): void {
    if (next === scope) return;
    if (next === 'full' && !fullReady) return;
    if (surface === 'answer') {
      analytics.log('share_scope_select', { answer_id: answerId, scope: next }, { kind: 'click' });
    }
    onScopeChange(next);
  }

  /** 내보낼 글. 만드는 자리가 하나라 어느 버튼으로 나가든 모양이 같다 */
  function message(): string {
    return shareMessage({
      scripture,
      url: link.status === 'ready' ? link.url : null,
      full: scope === 'full',
    });
  }

  /**
   * 복사해서 내보낸다.
   *
   * **막히면 조용히 돌아가지 않는다.** 클립보드는 기기 설정이나 브라우저 권한 때문에 자주
   * 막히는데, 그때 그냥 돌아가면 사용자는 버튼을 눌렀는데 아무 일도 없는 화면을 본다.
   * 복사한 줄 알고 붙여 넣으면 엉뚱한 것이 나간다. 막혔다고 알리고 그 글을 화면에 내놓는다.
   */
  async function copyOut(text: string, notice: string): Promise<void> {
    if (await copyText(text)) {
      complete('copy');
      setBlock(null);
      setToast(notice);
      return;
    }
    onCopyBlocked?.();
    setManual(text);
    setBlock('copy_failed');
  }

  /**
   * 공유하기.
   *
   * 네이티브 시트가 열리면 거기서 카톡이든 메시지든 고른다. 못 열면 주소를 복사하고
   * **복사했다고 말한다.** 예전에는 이 자리에서 말없이 복사하고 시트만 닫혔다.
   */
  async function send(): Promise<void> {
    if (busy) return;
    if (link.status !== 'ready') {
      // 주소가 없는데 보낸 것처럼 굴지 않는다. 빈 주소를 보내면 받은 사람이 아무 데도 못 간다
      setBlock('link_failed');
      return;
    }

    const text = message();
    if (onSendMessage == null) {
      await copyOut(text, '링크가 복사됐어요');
      return;
    }

    setBusy(true);
    let result: ShareSendResult;
    try {
      result = await onSendMessage(text);
    } catch {
      result = 'unsupported';
    }
    setBusy(false);

    if (result === 'sent') {
      complete('system');
      setBlock(null);
      onClose();
      return;
    }
    // 스스로 닫은 것은 실패가 아니다. 취소한 사람에게 오류를 보이지 않는다
    if (result === 'dismissed') return;
    await copyOut(text, '링크가 복사됐어요');
  }

  /** 주소만 가져간다. 붙여 넣을 곳을 이미 아는 사람을 위한 자리다 */
  async function copyLink(): Promise<void> {
    // 빈 주소는 「만들지 못한 것」과 같다. 붙여 넣을 것이 없는데 복사했다고 말하지 않는다
    if (link.status !== 'ready' || link.url.trim() === '') {
      setBlock('link_failed');
      return;
    }
    await copyOut(link.url, '링크가 복사됐어요');
  }

  async function saveImage(): Promise<void> {
    if (busy) return;
    setBusy(true);
    const result = onSaveImage != null ? await onSaveImage() : 'unsupported';
    setBusy(false);
    if (result !== 'saved') {
      setBlock(result);
      return;
    }
    complete('image');
    setBlock(null);
    setToast('사진에 저장했어요');
  }

  function onBlockPrimary(): void {
    if (block === 'permission_denied') {
      onOpenSettings?.();
      return;
    }
    if (block === 'link_failed') {
      setBlock(null);
      onRetryLink();
      return;
    }
    if (block === 'copy_failed') {
      void copyOut(manual, '링크가 복사됐어요');
      return;
    }
    void send();
  }

  function onBlockSecondary(): void {
    if (block === 'permission_denied') {
      void send();
      return;
    }
    if (block === 'card_failed') {
      setBlock(null);
      void saveImage();
      return;
    }
    setBlock(null);
  }

  const blocked = block == null ? null : BLOCK[block];

  return (
    <>
      <div className="sh-sheet-root">
        <div className="sh-sheet__dim" {...testId(TEST_IDS.sheetDim)} onClick={onClose} />
        <div
          ref={sheetRef}
          className="sh-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          {...testId(TEST_IDS.shareSheet)}
        >
          <button
            type="button"
            className="sh-sheet__grab"
            aria-label="닫기"
            onClick={onClose}
            {...testId(TEST_IDS.sheetClose)}
          >
            <i aria-hidden="true" />
          </button>

          <h2 className="sh-sheet__title" id={titleId}>
            이 이야기를 나눠 볼까요?
          </h2>

          {/*
            무엇을 보낼지 고르는 자리. 라디오가 아니라 탭처럼 생겼지만 하는 일은 고르기라
            역할은 라디오로 알린다. 화면 낭독기가 「둘 중 하나」로 읽는다.
          */}
          <div className="sh-scope" role="radiogroup" aria-label="무엇을 보낼까요">
            {(['scripture', 'full'] as const).map((value) => {
              const disabled = value === 'full' && !fullReady;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={scope === value}
                  disabled={disabled}
                  className={`sh-scope__btn${scope === value ? ' is-on' : ''}`}
                  onClick={() => pick(value)}
                  {...testId(
                    value === 'scripture' ? TEST_IDS.shareScopeScripture : TEST_IDS.shareScopeFull,
                  )}
                >
                  {SCOPE_LABEL[value]}
                </button>
              );
            })}
          </div>

          {/* 잠긴 칸의 이유. 누르지 못하는 버튼을 설명 없이 두지 않는다 */}
          {!fullReady && fullNote != null && (
            <p className="sh-scope__note" {...testId(TEST_IDS.shareFullNote)}>
              {fullNote}
            </p>
          )}

          <p className="sh-sheet__safe">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M7 1.4 2.2 3.3v3.4c0 3 2 5.2 4.8 5.9 2.8-.7 4.8-2.9 4.8-5.9V3.3L7 1.4Z"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinejoin="round"
              />
              <path
                d="M4.9 7.1 6.4 8.6 9.3 5.5"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {SCOPE_NOTE[scope]}
          </p>

          <div className="sh-sheet__preview">
            {scope === 'scripture' || answer == null ? (
              <ShareCard scripture={scripture} gloss={gloss} />
            ) : (
              <FullPreview answer={answer} scripture={scripture} />
            )}
          </div>

          <div className="sh-sheet__btns">
            <button
              type="button"
              className="sh-btn"
              disabled={link.status === 'making' || busy}
              onClick={() => void send()}
              // 주소가 실제로 생긴 뒤에만 붙는다. 없는 동안 빈 값이 붙으면 못 쓰는 주소가 보인다
              data-share-url={link.status === 'ready' ? link.url : undefined}
              {...testId(TEST_IDS.shareLink)}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path
                  d="M9 12V3m0 0L6.1 5.9M9 3l2.9 2.9"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M3.6 10.4v3.2c0 .9.7 1.6 1.6 1.6h7.6c.9 0 1.6-.7 1.6-1.6v-3.2"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              {link.status === 'making' ? '링크 만드는 중' : '공유하기'}
            </button>

            {onSaveImage == null ? (
              <button
                type="button"
                className="sh-btn sh-btn--ghost"
                disabled={link.status !== 'ready'}
                onClick={() => void copyLink()}
                {...testId(TEST_IDS.shareCopy)}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <rect
                    x="6.4"
                    y="6.4"
                    width="8.4"
                    height="8.4"
                    rx="2"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M11.6 4.3a1.9 1.9 0 0 0-1.9-1.1H5.2a2 2 0 0 0-2 2v4.5c0 .8.5 1.5 1.1 1.8"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
                링크 복사하기
              </button>
            ) : (
              <button
                type="button"
                className="sh-btn sh-btn--ghost"
                disabled={busy}
                onClick={() => void saveImage()}
                {...testId(TEST_IDS.shareImage)}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path
                    d="M9 2.6v8.2m0 0L5.9 7.7M9 10.8l3.1-3.1"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M3.2 12.1v1.6a1.7 1.7 0 0 0 1.7 1.7h8.2a1.7 1.7 0 0 0 1.7-1.7v-1.6"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
                이미지로 저장하기
              </button>
            )}
          </div>
        </div>
      </div>

      {blocked == null || block == null ? null : (
        <div className="sh-fall-root">
          <div className="sh-fall__dim" onClick={() => setBlock(null)} />
          <div className="sh-fall" role="alertdialog" aria-labelledby={`${titleId}-block`}>
            <div className={`sh-fall__ico sh-fall__ico--${blocked.tone}`}>
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
                <path
                  d="M11 3.4 19.2 17.6H2.8L11 3.4Z"
                  stroke={blocked.tone === 'danger' ? 'var(--danger)' : 'var(--accent-text)'}
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
                <path
                  d="M11 9v3.4"
                  stroke={blocked.tone === 'danger' ? 'var(--danger)' : 'var(--accent-text)'}
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
                <circle
                  cx="11"
                  cy="15"
                  r=".95"
                  fill={blocked.tone === 'danger' ? 'var(--danger)' : 'var(--accent-text)'}
                />
              </svg>
            </div>
            <h3 className="sh-fall__t" id={`${titleId}-block`}>
              {blocked.title}
            </h3>
            <p className="sh-fall__d">{blocked.desc}</p>
            {block === 'copy_failed' ? (
              // 복사가 막힌 사람이 마지막으로 기댈 곳. 손으로 끌어 가져갈 수 있게 그대로 내놓는다
              <p className="sh-fall__manual">{manual}</p>
            ) : null}
            <div className="sh-fall__btns">
              <button type="button" className="sh-btn sh-btn--sm" onClick={onBlockPrimary}>
                {blocked.primary}
              </button>
              <button
                type="button"
                className="sh-btn sh-btn--ghost sh-btn--sm"
                onClick={onBlockSecondary}
              >
                {blocked.secondary}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast != null ? (
        <div className="sh-toast" role="status">
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
            style={{ flex: '0 0 auto' }}
          >
            <circle cx="10" cy="10" r="8.2" stroke="var(--accent-on-deep)" strokeWidth="1.5" />
            <path
              d="M6.4 10.2 8.9 12.7 13.8 7.6"
              stroke="var(--accent-on-deep)"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {toast}
        </div>
      ) : null}
    </>
  );
}

/**
 * 답변 전체를 보낼 때의 미리보기.
 *
 * 실물을 그대로 줄여 보인다. 「이런 것이 나가요」라고 글로 적는 대신 나갈 것을 보인다.
 * 본문을 다 그리면 시트가 화면보다 길어지므로 각 덩이의 첫 줄만 보이고 나머지는 접힌다.
 */
function FullPreview({ answer, scripture }: { answer: ApiAnswer; scripture: Scripture }) {
  const pass2 = answer.pass2;
  if (pass2.status !== 'done') return null;

  return (
    <div className="sh-full" {...testId(TEST_IDS.shareFullPreview)}>
      <p className="sh-full__msg">{answer.modernBuddhaMessage}</p>
      <blockquote className="sh-full__quote">
        <p>{scripture.text}</p>
      </blockquote>
      <ul className="sh-full__list">
        <li>
          <span className="sh-full__h">이 말씀은 이런 뜻이에요</span>
          <span className="sh-full__b">{pass2.scriptureExplanation}</span>
        </li>
        {pass2.personalAnalysis.slice(0, 1).map((section) => (
          <li key={section.heading}>
            <span className="sh-full__h">{section.heading}</span>
            <span className="sh-full__b">{section.body}</span>
          </li>
        ))}
        {pass2.actions.length > 0 && (
          <li>
            <span className="sh-full__h">지금 할 수 있는 것</span>
            <span className="sh-full__b">{pass2.actions[0].title}</span>
          </li>
        )}
      </ul>
      <p className="sh-full__more">받는 사람은 링크에서 전체를 봐요</p>
    </div>
  );
}
