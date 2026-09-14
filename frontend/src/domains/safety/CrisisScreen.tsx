/**
 * 위기 안내. 경전도 행동도 광고도 그림도 없이 도움받을 수 있는 곳만 한 화면에 담는다.
 *
 * 결이 둘이다. 고통을 말한 글(distress)에만 「그래도 이야기를 들어주세요」가 붙고,
 * 방법·수단을 찾는 글(acute)에는 그 묶음이 통째로 없다. 서버가 준 canContinue 를
 * 화면이 뒤집지 않는다. 눌러도 서버가 같은 원문으로 다시 판정해야 위로 답변이 열린다.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { ROUTES } from '../../app/router';
import { BUCKETS, useAnalytics } from '../../shared/analytics';
import { ApiFailure, useApiClient } from '../../shared/api';
import { useSession } from '../../shared/session';
import { TEST_IDS, testId } from '../../shared/testIds';
import { Button } from '../../shared/ui';

import { ChannelList } from './ChannelList';
import { CRISIS_COPY } from './copy';
import { failureMessage } from './ErrorScreens';
import './safety.css';

const ELAPSED_EDGES = [2000, 5000, 10000, 20000, 40000];

function elapsedBucket(ms: number): string {
  const index = ELAPSED_EDGES.findIndex((edge) => ms < edge);
  return BUCKETS.elapsed_ms[index === -1 ? BUCKETS.elapsed_ms.length - 1 : index];
}

function WarningIcon() {
  return (
    <svg
      className="sf-ic sf-urgent-ic"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 4.5 2.8 19.5h18.4L12 4.5Z" />
      <path d="M12 10v4" />
      <path d="M12 17.2h.01" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6.5 9.2 17.3 4 12.1" />
    </svg>
  );
}

export function CrisisScreen() {
  const navigate = useNavigate();
  const analytics = useAnalytics();
  const client = useApiClient();
  const { sent, response, setResponse } = useSession();

  const crisis = response != null && response.responseType === 'crisis' ? response : null;
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const detected = useRef(false);

  useEffect(() => {
    if (crisis == null) {
      // 위로 답변으로 넘어가는 중에도 여기가 한 번 더 그려진다. navigate 가 트랜지션이라
      // setResponse 가 먼저 반영되기 때문이다. 그때 홈으로 보내면 목적지가 뒤집힌다.
      if (response == null) navigate(ROUTES.home, { replace: true });
      return;
    }
    if (detected.current) return;
    detected.current = true;
    analytics.log('crisis_detected', {
      level: crisis.crisisLevel,
      minor: crisis.flags?.minor ?? false,
      abuse: crisis.flags?.abuse ?? false,
    });
  }, [analytics, crisis, navigate, response]);

  const onContinue = useCallback(async () => {
    if (crisis == null || pending) return;
    analytics.log('crisis_continue_click', { level: crisis.crisisLevel }, { kind: 'click' });
    setPending(true);
    setFailure(null);
    const startedAt = Date.now();
    try {
      const next = await client.continueAfterCrisis({ text: sent });
      setResponse(next);
      if (next.responseType === 'solace') {
        analytics.log('solace_generated', { elapsed_bucket_ms: elapsedBucket(Date.now() - startedAt) });
        navigate(ROUTES.solace);
        return;
      }
      // 서버가 다시 판정해 거부했다. 위기 안내에 그대로 남는다.
    } catch (error) {
      setFailure(error instanceof ApiFailure ? failureMessage(error.reason) : failureMessage('provider'));
    } finally {
      setPending(false);
    }
  }, [analytics, client, crisis, navigate, pending, sent, setResponse]);

  const onClose = useCallback(() => {
    if (crisis != null) {
      analytics.log('crisis_exit', { level: crisis.crisisLevel, exit: 'close' }, { kind: 'click' });
    }
    // 적은 글은 지우지 않는다. 세션을 비우지 않고 홈으로만 돌아간다.
    navigate(ROUTES.home);
  }, [analytics, crisis, navigate]);

  if (crisis == null) return null;

  const canContinue = crisis.crisisLevel === 'distress' && crisis.canContinue;

  return (
    <div className="sf-screen" {...testId(TEST_IDS.crisis)}>
      <div className="sf-scroll">
        <div className="sf-crisis-top">
          <h2 className="sf-h-screen">{CRISIS_COPY.title}</h2>
          <p className="sf-lead">{CRISIS_COPY.lead}</p>
        </div>

        <div className="sf-body">
          <ChannelList channels={crisis.channels} level={crisis.crisisLevel} />

          <div className="sf-urgent">
            <WarningIcon />
            <p className="sf-p-body">{CRISIS_COPY.urgent}</p>
          </div>

          {canContinue && (
            <div className="sf-crisis-more">
              <p className="sf-p-body">{CRISIS_COPY.continueNote}</p>
              <Button
                variant="ghost"
                fullWidth
                className="sf-btn sf-btn--ghost"
                disabled={pending}
                onClick={() => void onContinue()}
                {...testId(TEST_IDS.crisisContinue)}
              >
                {CRISIS_COPY.continueCta}
              </Button>
              {failure != null && <p className="sf-crisis-failure">{failure}</p>}
            </div>
          )}

          <p className="sf-crisis-keep">
            <CheckIcon />
            {CRISIS_COPY.draftKept}
          </p>
        </div>
      </div>

      <div className="sf-foot">
        <Button fullWidth className="sf-btn sf-btn--primary" onClick={onClose} {...testId(TEST_IDS.crisisClose)}>
          {CRISIS_COPY.close}
        </Button>
      </div>
    </div>
  );
}
