/**
 * 답변 끝의 「도움이 됐나요?」 두 칸.
 *
 * **마찰을 최소로 둔다.** 누르지 않아도 되고, 누르면 고맙다는 한 줄로 끝난다.
 * 설문을 바로 띄우지 않는다. 아쉬웠다고 한 사람에게만, 그중에서도 **표본에만**,
 * 한 번 탭으로 끝나는 시트를 띄운다. 글자를 적게 하지 않는다.
 *
 * 버튼이 화면에 있던 것은 전부터인데 아무것도 기록하지 않고 있었다. 그래서 「어떤 라우팅의
 * 답이 더 나은가」를 물어볼 수 없었다. 여기서 그 두 값을 남긴다.
 */

import { useState } from 'react';

import { answerLengthBucket, useAnalytics } from '../../shared/analytics';
import { FLAGS, inNegativeReasonSample } from '../../shared/flags';
import { TEST_IDS, testId } from '../../shared/testIds';

/** 한 번 탭으로 끝난다. 복수 선택도 글자 입력도 없다 */
const REASONS = [
  { code: 'mismatch', label: '내 고민과 안 맞아요' },
  { code: 'obvious', label: '너무 뻔해요' },
  { code: 'too_long', label: '너무 길어요' },
  { code: 'tone', label: '말투가 아쉬워요' },
  { code: 'scripture', label: '경전이 안 맞아요' },
  { code: 'other', label: '그 밖에' },
] as const;

export interface AnswerFeedbackProps {
  answerId: string;
  route: string;
  /** 마음 태그 첫 번째. 어떤 고민에서 만족도가 갈리는지 본다 */
  primaryTag: string | undefined;
  /** 답변 본문 길이. 길수록 만족도가 떨어지는지 본다 */
  answerChars: number;
}

export function AnswerFeedback({
  answerId,
  route,
  primaryTag,
  answerChars,
}: AnswerFeedbackProps) {
  const analytics = useAnalytics();
  const [picked, setPicked] = useState<'positive' | 'negative' | null>(null);
  const [askReason, setAskReason] = useState(false);

  if (!FLAGS.answerFeedback) return null;

  function choose(value: 'positive' | 'negative') {
    if (picked != null) return;
    setPicked(value);
    analytics.log(
      'answer_feedback',
      {
        answer_id: answerId,
        value,
        route,
        primary_tag: primaryTag,
        answer_length_bucket: answerLengthBucket(answerChars),
      },
      { kind: 'click', once: `answer_feedback:${answerId}` },
    );
    // 아쉬웠다고 한 사람에게만, 그중 표본에만 한 번 묻는다
    if (value === 'negative' && inNegativeReasonSample()) setAskReason(true);
  }

  function pickReason(code: string) {
    analytics.log(
      'answer_negative_reason',
      { answer_id: answerId, reason: code },
      { kind: 'click', once: `negative_reason:${answerId}` },
    );
    setAskReason(false);
  }

  return (
    <>
      <p className="q">오늘 마음에 도움이 됐나요?</p>
      <div className="fb-row">
        <button
          type="button"
          className="fb-btn"
          aria-pressed={picked === 'positive'}
          disabled={picked != null}
          onClick={() => choose('positive')}
          {...testId(TEST_IDS.feedbackUp)}
        >
          <svg
            className="h"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 20.5C7.5 18 4 14.8 4 11.2A3.9 3.9 0 0 1 12 8.8 3.9 3.9 0 0 1 20 11.2c0 3.6-3.5 6.8-8 9.3z" />
          </svg>
          도움이 됐어요
        </button>
        <button
          type="button"
          className="fb-btn"
          aria-pressed={picked === 'negative'}
          disabled={picked != null}
          onClick={() => choose('negative')}
          {...testId(TEST_IDS.feedbackDown)}
        >
          <svg
            className="q2"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="8.5" />
            <path d="M9.7 9.6a2.4 2.4 0 0 1 4.6.8c0 1.6-2.3 2-2.3 3.4" />
            <path d="M12 17.2h.01" />
          </svg>
          아쉬웠어요
        </button>
      </div>

      {picked != null && !askReason && (
        <p className="p-micro" {...testId(TEST_IDS.feedbackThanks)}>
          의견 고마워요.
        </p>
      )}

      {askReason && (
        <div className="fb-reason" {...testId(TEST_IDS.negativeReasonSheet)}>
          <p className="fb-reason-q">어떤 점이 아쉬웠나요?</p>
          <div className="fb-reason-grid">
            {REASONS.map((reason) => (
              <button
                key={reason.code}
                type="button"
                className="fb-reason-btn"
                onClick={() => pickReason(reason.code)}
                {...testId(TEST_IDS.negativeReasonOption)}
              >
                {reason.label}
              </button>
            ))}
          </div>
          <button type="button" className="report" onClick={() => setAskReason(false)}>
            닫기
          </button>
        </div>
      )}
    </>
  );
}
