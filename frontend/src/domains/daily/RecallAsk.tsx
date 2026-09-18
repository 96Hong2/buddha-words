/**
 * 「어제 적어 드린 그거, 해 보셨나요?」 카드.
 *
 * ── 왜 시트가 아니라 카드인가 ─────────────────────────────────────────────
 *
 * 한 번은 시트로 만들었다. 홈에 들어서는 순간 덮개가 화면을 덮고 스크롤이 잠겼다.
 * 이 저장소의 절대 규칙 7번이 **「진입 즉시 바텀시트 없음」**인데 그 선을 정면으로 넘는다.
 * 물어보라는 요구는 답을 강요하라는 뜻이 아니다.
 *
 * ── 예전 홈 카드와 무엇이 다른가 ─────────────────────────────────────────
 *
 * 전에는 답을 받을 때마다 **말없이** 쌓여서 매일 홈 첫 줄에 질문이 서 있었다. 사용자가
 * 「어제 이야기는 띄우지 마라」고 한 것이 그것이다.
 *
 * 지금은 셋이 다르다.
 *   1. 답변에서 「내일 했는지 물어봐 주세요」를 **누른 사람에게만** 남는다
 *   2. 한 번 답하면 기기에서 지운다. 닫기만 해도 그날은 다시 안 뜬다
 *   3. 이레가 지나면 조용히 버린다. 한 달 뒤에 「어제 적어 드린」이라고 묻지 않는다
 *
 * 재료는 `{ answerId, date, firstActionTitle }` 뿐이다. 고민 원문과 답변 본문은 어디에도
 * 저장하지 않으므로 이 화면에 원문이 나올 수 없다.
 */

import { useEffect, useRef } from 'react';

import { useAnalytics } from '../../shared/analytics';
import { daysSince, recallWording, type RecallEntry } from '../../shared/prefs/recall';
import { TEST_IDS, testId } from '../../shared/testIds';

import './daily.css';

export interface RecallAskProps {
  /** 물어볼 것. 없으면 아무것도 그리지 않는다 */
  entry: RecallEntry | null;
  /** 「해봤어요」면 true. 어느 쪽이든 카드를 닫고 기기에서 지운다 */
  onRespond: (done: boolean) => void;
  /** 닫기. 오늘은 더 묻지 않지만 기기에서 지우지는 않는다 */
  onClose: () => void;
}

export function RecallAsk({ entry, onRespond, onClose }: RecallAskProps) {
  const analytics = useAnalytics();
  const seen = useRef('');
  const since = entry != null ? daysSince(entry.date) : 0;

  useEffect(() => {
    if (entry == null || seen.current === entry.answerId) return;
    seen.current = entry.answerId;
    analytics.log('recall_card_impression', { days_since: since }, { kind: 'impression' });
  }, [analytics, entry, since]);

  if (entry == null) return null;

  function respond(done: boolean): void {
    analytics.log('recall_card_click', { days_since: since, done }, { kind: 'click' });
    onRespond(done);
  }

  return (
    <div
      className="recall-ask"
      role="group"
      aria-label="지난 이야기"
      {...testId(TEST_IDS.recallSheet)}
    >
      <div className="recall-ask__head">
        {/*
          조사를 붙이지 않는다. 행동 제목은 모델이 쓴 글이라 받침이 있을 수도 없을 수도 있다.
          「전화 한 통」는 해 보셨나요? 가 사용자 화면에 그대로 나갔다.
        */}
        <p className="recall-ask__title">
          {recallWording(entry, since)} 적어 드린
          <br />
          「{entry.firstActionTitle}」, 해 보셨나요?
        </p>
        <button
          type="button"
          className="recall-ask__x"
          aria-label="닫기"
          onClick={onClose}
          {...testId(TEST_IDS.sheetClose)}
        >
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <div className="recall-ask__buttons">
        <button
          type="button"
          className="recall-ask__btn recall-ask__btn--yes"
          onClick={() => respond(true)}
          {...testId(TEST_IDS.recallYes)}
        >
          해봤어요
        </button>
        <button
          type="button"
          className="recall-ask__btn"
          onClick={() => respond(false)}
          {...testId(TEST_IDS.recallNo)}
        >
          아직이요
        </button>
      </div>
    </div>
  );
}
