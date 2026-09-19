import { useEffect, useRef, useState } from 'react';

import { useOverlayBackClose } from '../../app/providers';
import { attributionLine } from '../../shared/api';
import { TEST_IDS, testId } from '../../shared/testIds';

// 경전 카드와 그 안의 「원문 보기」 시트는 답변 화면 것을 그대로 쓴다. 같은 것을 두 벌 그리면
// 한쪽만 고쳐진다. 그 CSS 는 화면 루트(.ans) 아래에 묶여 있어 파일도 함께 들여온다
import { ScriptureCard } from '../answer/ScriptureCard';

import { DATE_FORMAT, TagChips } from './ArchiveItem';
import type { SavedAnswer } from './archiveStore';

import '../answer/answer.css';
import './archive.css';

export interface ArchiveDetailProps {
  /** 열려 있으면 그 항목, 닫혀 있으면 null */
  item: SavedAnswer | null;
  /** 이번에 받은 답변과 같은 것인가. 날짜 옆에 「오늘」이 붙는다 */
  today?: boolean;
  onClose: () => void;
  onDelete: (answerId: string) => void;
  /**
   * 간직한 말씀을 내보낸다. 보내지 못하면 복사한 것으로 답한다.
   * 주지 않으면 공유 버튼을 그리지 않는다.
   */
  onShare?: (item: SavedAnswer) => Promise<'sent' | 'copied' | 'dismissed' | 'failed'>;
}

/** 공유 아이콘. 답변 화면 것과 같은 모양을 쓴다 */
function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 15.5V4.2M8.4 7.6 12 4l3.6 3.6" />
      <path d="M5.5 12.8v5.6a1.4 1.4 0 0 0 1.4 1.4h10.2a1.4 1.4 0 0 0 1.4-1.4v-5.6" />
    </svg>
  );
}

function paragraphs(text: string): string[] {
  return text.split(/\n+/).filter((line) => line.trim() !== '');
}

/**
 * 간직한 말씀 상세.
 *
 * 간직할 때 함께 남긴 답변 본문을 그대로 펼친다. 없는 조각은 자리를 만들지 않는다.
 * 닫는 길은 셋이다: 닫기 버튼 · 시트 바깥 · 시스템 뒤로가기.
 */
export function ArchiveDetail({
  item,
  today = false,
  onClose,
  onDelete,
  onShare,
}: ArchiveDetailProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  /** 지우기는 되돌릴 수 없다. 한 번 더 묻고 지운다 */
  const [asking, setAsking] = useState(false);
  /** 공유를 누른 뒤 한마디. 시트를 못 여는 기기에서는 복사했다고 말한다 */
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const open = item != null;

  useOverlayBackClose(open, onClose);

  useEffect(() => {
    if (!open) return;
    setAsking(false);
    setShareNote(null);
    sheetRef.current?.focus();

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      // 원문 보기·용어 시트가 이 위에 떠 있으면 그쪽만 닫는다. 같이 닫으면 원문을 한 번
      // 보려다 상세까지 사라진다
      if (sheetRef.current?.querySelector('[role="dialog"]') != null) return;
      event.preventDefault();
      onClose();
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
    };
  }, [open, onClose]);

  if (item == null) return null;

  const detail = item.detail;
  const scripture = detail?.scripture;
  const analysis = detail?.analysis ?? [];
  const actions = detail?.actions ?? [];
  const closing = detail?.closing;
  /** 광고를 보고 받은 다른 관점. 받고 나서 간직한 답에만 있다 */
  const extension = detail?.extension;
  const nothingMore =
    scripture == null &&
    detail?.explanation == null &&
    analysis.length === 0 &&
    actions.length === 0 &&
    closing == null &&
    extension == null;

  return (
    <div className="ad-root">
      <div className="ad-dim" onClick={onClose} {...testId(TEST_IDS.sheetDim)} />
      <div
        ref={sheetRef}
        className="ad-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ad-line"
        tabIndex={-1}
        {...testId(TEST_IDS.archiveDetail)}
      >
        <span className="ad-grabber" aria-hidden="true" />

        <p className="ad-meta">
          <span className="ad-date">{DATE_FORMAT.format(item.savedAt)}에 간직했어요</span>
          {today && <span className="arch-badge-today">오늘</span>}
        </p>

        <p className="ad-eyebrow">오늘의 부처의 말</p>
        <blockquote className="ad-line" id="ad-line">
          {item.line}
        </blockquote>
        <TagChips tags={item.tags} />

        {/* 답변 화면과 같은 카드다. 저본·한문 원문은 그 안의 「원문 보기」가 연다 */}
        {scripture != null && (
          <div className="ad-ans ans">
            <ScriptureCard
              scripture={scripture}
              explanation={detail?.explanation}
              terms={detail?.terms}
            />
          </div>
        )}

        {analysis.length > 0 && (
          <section className="ad-sec">
            <h3 className="ad-sec-title">당신의 이야기를 보면</h3>
            {analysis.map((section) => (
              <div key={section.heading}>
                <h4 className="ad-sub-title">{section.heading}</h4>
                {paragraphs(section.body).map((line, index) => (
                  <p className="ad-body" key={index}>
                    {line}
                  </p>
                ))}
              </div>
            ))}
          </section>
        )}

        {actions.length > 0 && (
          <section className="ad-sec">
            <h3 className="ad-sec-title">지금 할 수 있는 것</h3>
            <ol className="ad-acts">
              {actions.map((action, index) => (
                <li key={action.title}>
                  <span className="ad-n">{index + 1}</span>
                  <span className="ad-act-text">
                    <b>{action.title}</b>
                    {action.why != null && <span className="ad-why">{action.why}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {closing != null && <p className="ad-closing">{closing}</p>}

        {/*
          광고를 끝까지 보고 받은 한 덩이. 답변 화면과 같은 모양(점선 테두리 · 경전면 ·
          다른 해석 · 행동 하나)으로 둔다. 자리도 마지막 한마디 아래로 같다
        */}
        {extension != null && (
          <div className="ad-ans ans">
            <div className="ext-card">
              <p className="eyebrow">조금 더 깊게 본 다른 관점</p>
              <div className="ext-result" {...testId(TEST_IDS.extensionResult)}>
                <div className="scripture">
                  <p className="text">{extension.scripture.text}</p>
                  <p className="cite">{attributionLine(extension.scripture)}</p>
                </div>
                {extension.alternativeAnalysis != null && (
                  <div className="sub">
                    <h3>{extension.alternativeAnalysis.heading}</h3>
                    {paragraphs(extension.alternativeAnalysis.body).map((line, index) => (
                      <p className="body" key={index}>
                        {line}
                      </p>
                    ))}
                  </div>
                )}
                {extension.action != null && (
                  <ol className="acts">
                    <li>
                      <span className="n">1</span>
                      <p>
                        <b>{extension.action.title}</b>
                        {extension.action.why != null && (
                          <span className="why">{extension.action.why}</span>
                        )}
                      </p>
                    </li>
                  </ol>
                )}
              </div>
            </div>
          </div>
        )}

        {nothingMore && (
          <p className="ad-note">
            이 말씀은 한마디만 남아 있어요. 경전과 풀이는 함께 간직되지 않았어요. 내보내기는
            경전이 있는 말씀에서만 할 수 있어요.
          </p>
        )}

        <div className="ad-actions">
          {asking ? (
            <>
              <p className="ad-ask">지우면 이 답변은 다시 볼 수 없어요. 지울까요?</p>
              <button
                type="button"
                className="arch-btn arch-btn--danger arch-btn--lg"
                onClick={() => onDelete(item.answerId)}
                {...testId(TEST_IDS.archiveDeleteConfirm)}
              >
                지우기
              </button>
              <button
                type="button"
                className="arch-btn arch-btn--plain"
                onClick={() => setAsking(false)}
              >
                그대로 두기
              </button>
            </>
          ) : (
            <>
              {/*
                간직한 말씀은 **언제든** 내보낼 수 있다. 며칠 전에 담은 것도 마찬가지다.
                나가는 것은 경전 구절과 앱 주소뿐이고, 적으신 이야기도 풀이도 따라가지 않는다.
                답변 화면의 공유와 달리 서버 링크를 만들지 않는다. 그 링크는 방금 받은 답에만
                살아 있어서, 지난달에 담은 것을 누르면 「찾을 수 없어요」가 돌아온다.

                ⚠ **경전이 함께 담긴 것만 내보낸다.** 앞선 판에서 담아 한마디만 남은 항목은
                그 한마디가 `modernBuddhaMessage` 다. 그 문장은 이 사람의 고민을 읽고 쓴 글이라
                메신저에 펼쳐지면 받는 사람이 무슨 일인지 짐작한다. 같은 이유로 공유 랜딩
                페이지도 그 값을 싣지 않는다(`backend/tests/test_share_landing.py`).
                경전 구절은 이 고민과 무관하게 원래 있던 글이라 아무나 받아도 사정이 안 드러난다.
              */}
              {onShare != null && scripture != null && (
                <button
                  type="button"
                  className="arch-btn arch-btn--share arch-btn--lg"
                  disabled={sharing}
                  onClick={() => {
                    if (sharing) return;
                    setSharing(true);
                    setShareNote(null);
                    void onShare(item)
                      .then((result) => {
                        if (result === 'copied') setShareNote('보낼 글을 복사했어요');
                        else if (result === 'failed') setShareNote('지금은 보내지 못했어요');
                      })
                      .finally(() => setSharing(false));
                  }}
                  {...testId(TEST_IDS.archiveShare)}
                >
                  <span className="arch-btn__icon" aria-hidden="true">
                    <ShareIcon />
                  </span>
                  공유하기
                </button>
              )}
              {/* 무엇이 나가는지 버튼 옆에서 말한다. 누른 뒤에 알면 늦다 */}
              <p className="ad-hint" role={shareNote != null ? 'status' : undefined}>
                {shareNote ?? '경전 구절과 앱 주소만 나가요'}
              </p>
              <button
                type="button"
                className="arch-btn arch-btn--primary arch-btn--lg"
                onClick={onClose}
                {...testId(TEST_IDS.sheetClose)}
              >
                닫기
              </button>
              <p className="ad-hint">뒤로가기, 바깥 어두운 곳, 닫기 버튼 모두로 나갈 수 있어요</p>
              {/*
                지우기는 맨 끝에 떼어 둔다. 닫기 안내 위에 두면 그 안내가 지우기의 설명처럼
                읽히고, 되돌릴 수 없는 버튼이 주 동작 사이에 끼어든다
              */}
              <button
                type="button"
                className="arch-btn arch-btn--plain arch-btn--far"
                onClick={() => setAsking(true)}
                {...testId(TEST_IDS.archiveDelete)}
              >
                보관함에서 지우기
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
