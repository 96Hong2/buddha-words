/**
 * 답이 나오지 않은 자리들. 실패 · 타임아웃 · 오프라인 · 예산 문 닫힘.
 *
 * 세 가지를 지킨다. 사용자를 탓하지 않는다. 나가는 길을 둘 둔다.
 * 그리고 적은 글을 어떤 실패에서도 지우지 않는다(세션을 비우는 코드가 여기에 없다).
 */

import type { ReactNode } from 'react';

import { ApiFailure, messageFor, type ErrorCode } from '../../shared/api';
import { TEST_IDS, testId } from '../../shared/testIds';
import { Button } from '../../shared/ui';

import { ERROR_COPY } from './copy';
import './safety.css';

export type FailureReason = ApiFailure['reason'];

const FAILURE_CODE: Record<FailureReason, ErrorCode> = {
  timeout: 'TIMEOUT',
  offline: 'OFFLINE',
  budget: 'BUDGET',
  too_fast: 'TOO_FAST',
  schema: 'SERVER',
  provider: 'SERVER',
};

/** 서버가 준 문자열이 아니라 우리가 고른 문장을 보여 준다 */
export function failureMessage(reason: FailureReason): string {
  return messageFor(FAILURE_CODE[reason]);
}

function CheckIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      className="sf-ic"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9.5 17 4 11.6" />
    </svg>
  );
}

function RetryIcon() {
  return (
    <svg
      className="sf-ic"
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 4v4.4h-4.4" />
    </svg>
  );
}

function OfflineIcon() {
  return (
    <svg
      className="sf-ic"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 4l18 16" />
      <path d="M5.2 9.2a13 13 0 0 1 3.6-2.2" />
      <path d="M13.4 7.1a13 13 0 0 1 5.4 2.1" />
      <path d="M8 12.6a8.6 8.6 0 0 1 2.2-1.2" />
      <path d="M16 12.6a8.6 8.6 0 0 0-1.6-1" />
      <path d="M12 17.8h.01" />
    </svg>
  );
}

export interface ErrorScreenProps {
  /** 없으면 무엇이 잘못됐는지 모르는 실패로 본다 */
  reason?: FailureReason;
  onRetry: () => void;
  onClose: () => void;
}

/**
 * 전면 안내형 실패 화면. 실패 · 60초 넘김 · 오프라인 · 예산 문 닫힘이 같은 자리를 쓴다.
 * 실패했을 때 가장 먼저 궁금한 것이 「내 횟수 날아갔나」라 그 답을 버튼보다 위에 둔다.
 */
export function ErrorScreen({ reason, onRetry, onClose }: ErrorScreenProps) {
  const lead = reason == null ? ERROR_COPY.lead : failureMessage(reason);

  return (
    <div className="sf-screen" role="alert" {...testId(TEST_IDS.errorState)}>
      <div className="sf-scroll">
        <div className="sf-state">
          <h2 className="sf-h-screen">{ERROR_COPY.title}</h2>
          <p className="sf-lead">{lead}</p>
          <div className="sf-state-note">
            <span className="sf-chip-note">
              <CheckIcon />
              {ERROR_COPY.quotaKept}
            </span>
          </div>
        </div>
      </div>

      <div className="sf-foot">
        <Button
          fullWidth
          className="sf-btn sf-btn--primary"
          leadingIcon={<RetryIcon />}
          onClick={onRetry}
          {...testId(TEST_IDS.retry)}
        >
          {ERROR_COPY.retry}
        </Button>
        <Button variant="ghost" fullWidth className="sf-btn sf-btn--ghost" onClick={onClose}>
          {ERROR_COPY.close}
        </Button>
      </div>
    </div>
  );
}

/**
 * 인터넷이 끊긴 자리. 화면을 덮지 않고 위에 두 줄만 얹는다.
 * 끊겼다는 사실보다 쓰던 글이 남아 있다는 사실을 먼저 읽히게 둔다.
 */
export function OfflineNotice() {
  return (
    <>
      <div className="sf-net-banner">
        <OfflineIcon />
        {ERROR_COPY.offlineBanner}
      </div>
      <div className="sf-keep">
        <CheckIcon size={18} />
        <p>{ERROR_COPY.offlineKept}</p>
      </div>
    </>
  );
}

export interface PartialAnswerNoticeProps {
  onRetry: () => void;
  /** 아직 채워질 자리가 있다는 표시. 안 주면 회색 줄 세 개를 그린다 */
  children?: ReactNode;
}

/** 요청2만 실패했을 때 답변 아래에 붙는 점선 카드. 받은 것을 도로 뺏지 않는다 */
export function PartialAnswerNotice({ onRetry, children }: PartialAnswerNoticeProps) {
  return (
    <div className="sf-half-fail">
      <h3 className="sf-h-mini">{ERROR_COPY.partialTitle}</h3>
      <p className="sf-p-body">{ERROR_COPY.partialBody}</p>
      <Button
        fullWidth
        className="sf-btn sf-btn--quiet"
        leadingIcon={<RetryIcon />}
        onClick={onRetry}
        {...testId(TEST_IDS.retry)}
      >
        {ERROR_COPY.partialRetry}
      </Button>
      {children ?? (
        <div className="sf-skeleton" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
      )}
    </div>
  );
}
