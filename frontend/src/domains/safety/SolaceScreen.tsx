/**
 * 위로 전용 답변. 위기 안내를 보고 글쓴이가 스스로 눌렀을 때만 열린다.
 *
 * 들은 것을 비추는 문장 · 경전 하나 · 몸으로 할 수 있는 아주 작은 것 하나까지다.
 * 상황 해석 · 행동 지침 · 마음 태그 · 광고 · 공유 · 간직이 없고 사용 횟수를 세지 않는다.
 * 도움받을 수 있는 곳은 답변 위와 아래에 항상 붙는다.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';

import { SOLACE_FALLBACK } from '@spec/router.ts';

import { ROUTES } from '../../app/router';
import { useAnalytics } from '../../shared/analytics';
import { useSession } from '../../shared/session';
import { TEST_IDS, testId } from '../../shared/testIds';
import { Button } from '../../shared/ui';

import { ChannelBands } from './ChannelList';
import { resolveChannels, SOLACE_COPY } from './copy';
import './safety.css';

export function SolaceScreen() {
  const navigate = useNavigate();
  const analytics = useAnalytics();
  const { response } = useSession();

  const solace = response != null && response.responseType === 'solace' ? response : null;
  const blocked = useRef(false);

  useEffect(() => {
    if (solace == null) {
      // 응답이 아예 없을 때만 되돌린다. 종류가 바뀌는 중이면 그 화면으로 가는 길목이라
      // 여기서 홈으로 보내면 목적지가 뒤집힌다(navigate 가 트랜지션이라 상태가 먼저 반영된다).
      if (response == null) navigate(ROUTES.home, { replace: true });
      return;
    }
    if (solace.fallbackUsed !== true || blocked.current) return;
    blocked.current = true;
    analytics.log('solace_blocked', { reason: 'forbidden_phrase' });
  }, [analytics, navigate, response, solace]);

  const onRewrite = useCallback(() => {
    // 적은 글은 그대로 둔다. 홈으로 돌아가면 입력창에 남아 있다.
    analytics.log('crisis_exit', { level: 'distress', exit: 'rewrite' }, { kind: 'click' });
    navigate(ROUTES.home);
  }, [analytics, navigate]);

  if (solace == null) return null;

  const channels = resolveChannels(solace.channels);
  const [first, ...rest] = channels;
  const above = first != null ? [first] : [];
  const below = rest.length > 0 ? rest : above;
  // 금지어 검사에 걸린 답변은 통째로 버리고 고정 문구만 그린다. 화면에 사고를 알리지 않는다.
  const fallback = solace.fallbackUsed === true;

  return (
    <div className="sf-screen" {...testId(TEST_IDS.solace)}>
      <div className="sf-scroll">
        <div className="sf-body sf-solace">
          <ChannelBands channels={above} level="distress" place="top" />

          <div className="sf-sc-card">
            <p className="sf-sc-open" {...testId(TEST_IDS.solaceOpening)}>
              {fallback ? SOLACE_FALLBACK : solace.opening}
            </p>
            <blockquote>{solace.scripture.text}</blockquote>
            <p className="sf-sc-cite">
              {solace.scripture.citation}
              {SOLACE_COPY.citeSuffix}
            </p>
            {!fallback && (
              <p className="sf-sc-close" {...testId(TEST_IDS.solaceClosing)}>
                {solace.closing}
              </p>
            )}
          </div>

          <ChannelBands channels={below} level="distress" place="bottom" />

          <p className="sf-sc-micro">
            {SOLACE_COPY.micro[0]}
            <br />
            {SOLACE_COPY.micro[1]}
          </p>
        </div>
      </div>

      <div className="sf-foot">
        <Button variant="ghost" fullWidth className="sf-btn sf-btn--ghost" onClick={onRewrite}>
          {SOLACE_COPY.rewrite}
        </Button>
      </div>
    </div>
  );
}
