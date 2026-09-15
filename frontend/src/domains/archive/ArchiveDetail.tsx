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
export function ArchiveDetail({ item, today = false, onClose, onDelete }: ArchiveDetailProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  /** 지우기는 되돌릴 수 없다. 한 번 더 묻고 지운다 */
  const [asking, setAsking] = useState(false);

  const open = item != null;

  useOverlayBackClose(open, onClose);

  useEffect(() => {
    if (!open) return;
    setAsking(false);
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
            이 말씀은 한마디만 남아 있어요. 경전과 풀이는 함께 간직되지 않았어요.
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
              <button
                type="button"
                className="arch-btn arch-btn--plain"
                onClick={() => setAsking(true)}
                {...testId(TEST_IDS.archiveDelete)}
              >
                보관함에서 지우기
              </button>
              <button
                type="button"
                className="arch-btn arch-btn--primary arch-btn--lg"
                onClick={onClose}
                {...testId(TEST_IDS.sheetClose)}
              >
                닫기
              </button>
              <p className="ad-hint">뒤로가기, 바깥 어두운 곳, 닫기 버튼 모두로 나갈 수 있어요</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
