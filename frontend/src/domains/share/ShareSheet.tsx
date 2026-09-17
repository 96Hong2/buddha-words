/**
 * 공유 옵션 시트 (O3).
 *
 * MVP 는 고를 것이 없다. 그래서 옵션 목록 대신 나갈 카드 실물을 줄여서 그대로 보여 준다.
 * 고민을 털어놓은 사람에게 공유는 공포라서, 안심 문구 한 줄보다 카드 실물이 더 잘 증명한다.
 *
 * 손잡이 · 딤 · 뒤로가기(Esc) 로 닫힌다. 오른쪽 위 X 는 두지 않는다(토스 미니앱 닫기와 같은 자리다).
 */

import { useEffect, useId, useRef, useState } from 'react';

import { useOverlayBackClose } from '../../app/providers';
import { useAnalytics } from '../../shared/analytics';
import { attributionLine, type Scripture } from '../../shared/api';
import { TEST_IDS, testId } from '../../shared/testIds';

import { ShareCard } from './ShareCard';

import './share.css';

/** 이미지 저장을 맡은 쪽이 돌려주는 결과. 막힌 이유마다 남은 길이 다르다 */
export type ShareSaveResult = 'saved' | 'permission_denied' | 'unsupported' | 'card_failed';

type SaveBlock = Exclude<ShareSaveResult, 'saved'>;

/**
 * 링크를 만드는 일은 서버가 한다. 그동안과 실패했을 때를 화면이 알고 있어야 한다.
 * 이 상태가 없으면 링크 버튼이 늘 눌리는 것처럼 보이다가 빈 주소를 복사한다.
 */
export type ShareLinkState =
  { status: 'making' } | { status: 'ready'; url: string } | { status: 'failed' };

type Block = SaveBlock | 'link_failed' | 'copy_failed';

/** MVP 카드는 한 종류다. 값은 `spec/events.ts` 가 적어 둔 것이라 여기서 바꾸지 않는다 */
const CARD_KIND = 'modern_message';

/**
 * 카드 위에 서는 안심 문구.
 *
 * 전에는 「적은 이야기는 카드에 들어가지 않아요」였다. 원문 문자열은 실리지 않으니
 * 글자로는 맞는 말이었는데, 그때 카드에 실리던 한마디가 그 고민을 읽고 쓴 문장이라
 * 받는 사람이 상황을 바로 읽었다. 약속과 실제가 어긋난 것이다.
 *
 * 이제 카드에 실리는 것은 이 고민과 무관하게 존재하던 경전 구절과 그 뜻뿐이다.
 * 그래서 「안 들어간다」로 끝내지 않고 **무엇이 들어가는지**까지 적는다.
 * 무엇이 나가는지 아는 사람만 마음 놓고 보낼 수 있다.
 */
const SAFE_NOTE =
  '카드에는 경전 구절과 그 뜻만 담겨요. 적으신 이야기도 마음 태그도 들어가지 않아요';

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
    desc: '토스를 최신으로 업데이트하면 이미지로 저장할 수 있어요. 지금도 링크와 글로는 보낼 수 있어요.',
    primary: '링크 보내기',
    secondary: '글로 복사하기',
  },
  card_failed: {
    tone: 'danger',
    title: '카드를 만들지 못했어요',
    desc: '글로만 보낼 수 있어요. 경전 구절과 귀속, 링크가 함께 나가요.',
    primary: '글로 보내기',
    secondary: '다시 해보기',
  },
  link_failed: {
    tone: 'danger',
    title: '링크를 만들지 못했어요',
    desc: '잠시 뒤에 다시 눌러 주세요. 지금은 경전 구절을 글로 복사해서 보낼 수 있어요.',
    primary: '다시 해보기',
    secondary: '글로 복사하기',
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
   * 오늘 받은 한마디와 마음 태그는 여기로 아예 들어오지 않는다. 한마디는 그 고민을 읽고 쓴
   * 문장이라 받는 사람에게 상황이 비치고, 마음 태그는 거기에 정황을 더한다(`ShareCard.tsx` 머리말).
   */
  scripture: Scripture;
  /** 경전 해설. 카드에는 첫 문장만 올라간다 */
  gloss: string;
  /** 서버가 만드는 공유 주소. 만드는 중과 실패까지 담는다 */
  link: ShareLinkState;
  /** 링크 만들기를 다시 시킨다 */
  onRetryLink: () => void;
  /** 토스 공유로 보낸다. 주지 않으면 주소를 복사한다 */
  onSendLink?: () => Promise<boolean> | boolean;
  /**
   * 카드를 앨범에 저장한다. **주지 않으면 이미지 저장 버튼 자체를 내리고 「글로 복사하기」를 세운다.**
   * 저장할 길이 없는데 버튼만 두면 누른 사람이 매번 안내 하나만 보고 돌아간다.
   */
  onSaveImage?: () => Promise<ShareSaveResult> | ShareSaveResult;
  /** 사진 접근 설정을 연다. 브릿지를 아는 쪽이 넘긴다 */
  onOpenSettings?: () => void;
}

export function ShareSheet({
  open,
  onClose,
  answerId,
  scripture,
  gloss,
  link,
  onRetryLink,
  onSendLink,
  onSaveImage,
  onOpenSettings,
}: ShareSheetProps) {
  const analytics = useAnalytics();
  /** 이번에 연 시트가 실제로 공유로 끝났나. 정리 함수가 이 값을 보고 취소를 센다 */
  const completedRef = useRef<(() => void) | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [block, setBlock] = useState<Block | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  /** 복사가 막혔을 때 손으로 가져갈 수 있게 화면에 내놓는 글. 고민 원문은 여기에도 없다 */
  const [manual, setManual] = useState('');
  const titleId = useId();

  /**
   * 시스템 뒤로가기를 이 시트가 가져간다. 등록하지 않으면 뒤로가기가 오버레이를 지나쳐
   * 화면 이동으로 내려가, 시트와 함께 방금 받은 답변까지 홈으로 사라진다.
   * 닫는 순서는 Esc 와 같다. 막힘 안내가 떠 있으면 그것부터 닫는다.
   */
  useOverlayBackClose(open, () => {
    if (block != null) setBlock(null);
    else onClose();
  });

  useEffect(() => {
    if (!open) return;
    analytics.log('share_start', { answer_id: answerId, card_kind: CARD_KIND });
    // 열고 아무것도 안 하고 닫은 것도 사실이다. 공유가 어디서 끊기는지 이 짝으로 본다
    let completed = false;
    const done = () => {
      completed = true;
    };
    completedRef.current = done;
    return () => {
      if (!completed) analytics.log('share_cancel', { answer_id: answerId });
    };
  }, [open, answerId, analytics]);

  useEffect(() => {
    if (!open) return;

    sheetRef.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      // 막힌 안내가 떠 있으면 그것부터 닫는다
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
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 2400);
    return () => clearTimeout(timer);
  }, [saved]);

  // 링크가 안 만들어진 것을 누르기 전에 알려 준다. 눌러 봐야 아는 실패는 실패를 두 번 겪게 한다
  useEffect(() => {
    if (!open || link.status !== 'failed') return;
    setBlock('link_failed');
  }, [open, link.status]);

  if (!open) return null;

  function complete(method: 'link' | 'image'): void {
    analytics.log('share_complete', { answer_id: answerId, card_kind: CARD_KIND, method });
    completedRef.current?.();
  }

  /**
   * 복사해서 내보낸다.
   *
   * **막히면 조용히 돌아가지 않는다.** 클립보드는 기기 설정이나 브라우저 권한 때문에 자주
   * 막히는데, 그때 그냥 돌아가면 사용자는 버튼을 눌렀는데 아무 일도 없는 화면을 본다.
   * 복사한 줄 알고 붙여 넣으면 엉뚱한 것이 나간다. 막혔다고 알리고 그 글을 화면에 내놓는다.
   */
  async function copyOut(text: string): Promise<void> {
    if (await copyText(text)) {
      complete('link');
      setBlock(null);
      onClose();
      return;
    }
    setManual(text);
    setBlock('copy_failed');
  }

  async function sendLink(): Promise<void> {
    if (link.status !== 'ready') {
      // 주소가 없는데 보낸 것처럼 굴지 않는다. 빈 주소를 복사하면 받은 사람이 아무 데도 못 간다
      setBlock('link_failed');
      return;
    }
    if (onSendLink != null) {
      // 공유 시트를 열었다 스스로 닫은 것은 실패가 아니다. 취소한 사람에게 오류를 보이지 않는다
      if (!(await onSendLink())) return;
      complete('link');
      setBlock(null);
      onClose();
      return;
    }
    await copyOut(link.url);
  }

  /** 카드나 링크가 막혔을 때 남는 길. 고민 원문은 여기에도 없다 */
  async function sendAsText(): Promise<void> {
    // 주소가 없으면 그 줄만 빠진다. 없는 주소를 빈칸으로 붙여 보내지 않는다
    const tail = link.status === 'ready' ? `\n\n${link.url}` : '';
    // 카드와 같은 것을 보낸다. 오늘 받은 한마디는 여기에도 싣지 않는다.
    // 글로 옮기면 카드의 금색 상자가 사라지므로 어디까지가 경전인지 글 안에 적는다
    await copyOut(['경전 원문', scripture.text, attributionLine(scripture)].join('\n') + tail);
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
    setSaved(true);
  }

  function onBlockPrimary(): void {
    if (block === 'permission_denied') {
      onOpenSettings?.();
      return;
    }
    if (block === 'unsupported') {
      void sendLink();
      return;
    }
    if (block === 'link_failed') {
      setBlock(null);
      onRetryLink();
      return;
    }
    if (block === 'copy_failed') {
      void copyOut(manual);
      return;
    }
    void sendAsText();
  }

  function onBlockSecondary(): void {
    if (block === 'permission_denied') {
      void sendLink();
      return;
    }
    if (block === 'unsupported' || block === 'link_failed') {
      void sendAsText();
      return;
    }
    if (block === 'copy_failed') {
      setBlock(null);
      return;
    }
    setBlock(null);
    void saveImage();
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
            {SAFE_NOTE}
          </p>

          <div className="sh-sheet__preview">
            <ShareCard scripture={scripture} gloss={gloss} />
          </div>

          <div className="sh-sheet__btns">
            <button
              type="button"
              className="sh-btn"
              disabled={link.status === 'making'}
              onClick={() => void sendLink()}
              // 주소가 실제로 생긴 뒤에만 붙는다. 없는 동안 빈 값이 붙으면 못 쓰는 주소가 보인다
              data-share-url={link.status === 'ready' ? link.url : undefined}
              {...testId(TEST_IDS.shareLink)}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path
                  d="M7.6 10.4a3 3 0 0 0 4.5.3l2.1-2.1a3 3 0 0 0-4.2-4.2l-1.2 1.2"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <path
                  d="M10.4 7.6a3 3 0 0 0-4.5-.3L3.8 9.4a3 3 0 0 0 4.2 4.2l1.2-1.2"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              {link.status === 'making' ? '링크 만드는 중' : '링크 보내기'}
            </button>
            {onSaveImage == null ? (
              /*
               * 앨범에 저장할 길이 아직 없다. 그 자리에 「이미지로 저장하기」를 두면 누구든
               * 누르는 순간 「이 버전에서는 저장이 안 돼요」만 만난다. 최신 토스에서도 같은
               * 말이 나와서 업데이트하러 갔다가 헛걸음한다. 되지 않는 것을 큰 버튼으로 내놓지
               * 않고, 실제로 되는 글 복사를 그 자리에 둔다.
               */
              <button
                type="button"
                className="sh-btn sh-btn--ghost"
                onClick={() => void sendAsText()}
                {...testId(TEST_IDS.shareText)}
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
                글로 복사하기
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
              {block === 'permission_denied' ? (
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
                  <rect
                    x="3"
                    y="5.5"
                    width="16"
                    height="12"
                    rx="2.4"
                    stroke="var(--accent-text)"
                    strokeWidth="1.5"
                  />
                  <circle cx="11" cy="11.5" r="2.8" stroke="var(--accent-text)" strokeWidth="1.5" />
                  <path
                    d="M4 6.6 18 16.4"
                    stroke="var(--accent-text)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              ) : null}
              {block === 'unsupported' || block === 'copy_failed' ? (
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
                  <rect
                    x="6"
                    y="2.5"
                    width="10"
                    height="17"
                    rx="2.2"
                    stroke="var(--accent-text)"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M11 6.6v4.8"
                    stroke="var(--accent-text)"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                  <circle cx="11" cy="14.4" r=".95" fill="var(--accent-text)" />
                </svg>
              ) : null}
              {block === 'card_failed' || block === 'link_failed' ? (
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
                  <path
                    d="M11 3.4 19.2 17.6H2.8L11 3.4Z"
                    stroke="var(--danger)"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M11 9v3.4"
                    stroke="var(--danger)"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                  <circle cx="11" cy="15" r=".95" fill="var(--danger)" />
                </svg>
              ) : null}
            </div>
            <h3 className="sh-fall__t" id={`${titleId}-block`}>
              {blocked.title}
            </h3>
            <p className="sh-fall__d">{blocked.desc}</p>
            {block === 'copy_failed' ? (
              // 복사가 막힌 사람이 마지막으로 기댈 곳. 손으로 끌어 가져갈 수 있게 그대로 내놓는다
              <p
                className="sh-fall__d"
                style={{
                  userSelect: 'text',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: 'var(--surface-illust)',
                }}
              >
                {manual}
              </p>
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

      {saved ? (
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
          사진에 저장했어요
        </div>
      ) : null}
    </>
  );
}
