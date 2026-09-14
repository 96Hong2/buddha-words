/**
 * 공유 옵션 시트 (O3).
 *
 * MVP 는 고를 것이 없다. 그래서 옵션 목록 대신 나갈 카드 실물을 줄여서 그대로 보여 준다.
 * 고민을 털어놓은 사람에게 공유는 공포라서, 안심 문구 한 줄보다 카드 실물이 더 잘 증명한다.
 *
 * 손잡이 · 딤 · Esc 셋으로 닫힌다. 오른쪽 위 X 는 두지 않는다(토스 미니앱 닫기와 같은 자리다).
 */

import { useEffect, useId, useRef, useState } from 'react';

import { useAnalytics } from '../../shared/analytics';
import type { EmotionTag, Scripture } from '../../shared/api';
import { TEST_IDS, testId } from '../../shared/testIds';

import { ShareCard } from './ShareCard';

import './share.css';

/** 이미지 저장을 맡은 쪽이 돌려주는 결과. 막힌 이유마다 남은 길이 다르다 */
export type ShareSaveResult = 'saved' | 'permission_denied' | 'unsupported' | 'card_failed';

type SaveBlock = Exclude<ShareSaveResult, 'saved'>;

/** MVP 카드는 한 종류다 */
const CARD_KIND = 'modern_message';

const BLOCK: Record<SaveBlock, { tone: 'caution' | 'danger'; title: string; desc: string; primary: string; secondary: string }> = {
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
    desc: '글로만 보낼 수 있어요. 한마디와 출처, 링크가 함께 나가요.',
    primary: '글로 보내기',
    secondary: '다시 해보기',
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
  tags: readonly EmotionTag[];
  buddhaMessage: string;
  scripture: Scripture;
  /** 경전 해설. 카드에는 첫 문장만 올라간다 */
  gloss: string;
  /** 서버가 만든 공유 주소 */
  shareUrl: string;
  /** 토스 공유로 보낸다. 주지 않으면 주소를 복사한다 */
  onSendLink?: () => Promise<boolean> | boolean;
  /** 카드를 앨범에 저장한다. 주지 않으면 이 기기에서는 저장할 수 없는 것으로 본다 */
  onSaveImage?: () => Promise<ShareSaveResult> | ShareSaveResult;
  /** 사진 접근 설정을 연다. 브릿지를 아는 쪽이 넘긴다 */
  onOpenSettings?: () => void;
}

export function ShareSheet({
  open,
  onClose,
  answerId,
  tags,
  buddhaMessage,
  scripture,
  gloss,
  shareUrl,
  onSendLink,
  onSaveImage,
  onOpenSettings,
}: ShareSheetProps) {
  const analytics = useAnalytics();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [block, setBlock] = useState<SaveBlock | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    analytics.log('share_start', { answer_id: answerId, card_kind: CARD_KIND });
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

  if (!open) return null;

  function complete(method: 'link' | 'image'): void {
    analytics.log('share_complete', { answer_id: answerId, card_kind: CARD_KIND, method });
  }

  async function sendLink(): Promise<void> {
    const ok = onSendLink != null ? await onSendLink() : await copyText(shareUrl);
    if (!ok) return;
    complete('link');
    setBlock(null);
    onClose();
  }

  /** 카드를 못 만들거나 저장이 막혔을 때 남는 길. 고민 원문은 여기에도 없다 */
  async function sendAsText(): Promise<void> {
    const ok = await copyText(`${buddhaMessage}\n\n${scripture.text}\n${scripture.citation}\n\n${shareUrl}`);
    if (!ok) return;
    complete('link');
    setBlock(null);
    onClose();
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
    void sendAsText();
  }

  function onBlockSecondary(): void {
    if (block === 'permission_denied') {
      void sendLink();
      return;
    }
    if (block === 'unsupported') {
      void sendAsText();
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
            적은 이야기는 카드에 들어가지 않아요
          </p>

          <div className="sh-sheet__preview">
            <ShareCard tags={tags} buddhaMessage={buddhaMessage} scripture={scripture} gloss={gloss} />
          </div>

          <div className="sh-sheet__btns">
            <button type="button" className="sh-btn" onClick={() => void sendLink()} data-share-url={shareUrl} {...testId(TEST_IDS.shareLink)}>
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
              링크 보내기
            </button>
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
                  <rect x="3" y="5.5" width="16" height="12" rx="2.4" stroke="var(--accent-text)" strokeWidth="1.5" />
                  <circle cx="11" cy="11.5" r="2.8" stroke="var(--accent-text)" strokeWidth="1.5" />
                  <path d="M4 6.6 18 16.4" stroke="var(--accent-text)" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              ) : null}
              {block === 'unsupported' ? (
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
                  <rect x="6" y="2.5" width="10" height="17" rx="2.2" stroke="var(--accent-text)" strokeWidth="1.5" />
                  <path d="M11 6.6v4.8" stroke="var(--accent-text)" strokeWidth="1.6" strokeLinecap="round" />
                  <circle cx="11" cy="14.4" r=".95" fill="var(--accent-text)" />
                </svg>
              ) : null}
              {block === 'card_failed' ? (
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
                  <path d="M11 3.4 19.2 17.6H2.8L11 3.4Z" stroke="var(--danger)" strokeWidth="1.5" strokeLinejoin="round" />
                  <path d="M11 9v3.4" stroke="var(--danger)" strokeWidth="1.6" strokeLinecap="round" />
                  <circle cx="11" cy="15" r=".95" fill="var(--danger)" />
                </svg>
              ) : null}
            </div>
            <h3 className="sh-fall__t" id={`${titleId}-block`}>
              {blocked.title}
            </h3>
            <p className="sh-fall__d">{blocked.desc}</p>
            <div className="sh-fall__btns">
              <button type="button" className="sh-btn sh-btn--sm" onClick={onBlockPrimary}>
                {blocked.primary}
              </button>
              <button type="button" className="sh-btn sh-btn--ghost sh-btn--sm" onClick={onBlockSecondary}>
                {blocked.secondary}
              </button>
            </div>
          </div>
        </div>
      )}

      {saved ? (
        <div className="sh-toast" role="status">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" style={{ flex: '0 0 auto' }}>
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
