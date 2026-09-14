import { useEffect, useState } from 'react';

import { useBridge, useIdentity } from '../../app/providers';
import { readAdOptOut, writeAdOptOut } from '../../shared/lib/adOptOut';
import { useSession } from '../../shared/session';
import { TEST_IDS, testId } from '../../shared/testIds';

import './settings.css';

const EDITION: Record<string, string> = {
  toss: '운영',
  sandbox: '테스트',
  browser: '브라우저',
};

/** 없는 값을 지어내지 않는다. 브라우저에서는 빈 문자열이 온다 */
function orDash(value: string): string {
  return value === '' ? '-' : value;
}

export function AppInfoScreen() {
  const bridge = useBridge();
  const { state } = useIdentity();
  const { response } = useSession();
  const [adOptOut, setAdOptOut] = useState(false);

  useEffect(() => {
    let alive = true;
    void readAdOptOut(bridge.storage).then((value) => {
      if (alive) setAdOptOut(value);
    });
    return () => {
      alive = false;
    };
  }, [bridge]);

  async function toggleAdOptOut(): Promise<void> {
    const next = !adOptOut;
    const ok = await writeAdOptOut(bridge.storage, next);
    // 저장에 실패하면 켜진 것처럼 보이면 안 된다. 실제로 남은 값만 화면에 그린다.
    if (ok) setAdOptOut(next);
  }

  /** 익명키는 앞 6자만 보여 준다. 전부 적으면 화면 캡쳐가 곧 식별자가 된다 */
  const anonKey = state.status === 'ready' ? `${state.identity.key.slice(0, 6)}…` : '-';
  const quota = response != null && 'quota' in response ? response.quota : undefined;
  const exhausted = quota?.exhausted === true;

  return (
    <div className="set-screen" {...testId(TEST_IDS.appInfo)}>
      <div className="set-pad">
        <h1 className="set-title">앱 정보</h1>
        <p className="set-sub">문제가 생겼을 때 이 화면을 캡쳐해 보내 주세요</p>

        <div className="set-card">
          <div className="set-kv">
            <span className="set-kv-k">판</span>
            <span className="set-kv-v">
              {EDITION[bridge.environment] ?? bridge.environment}
              {bridge.environment === 'sandbox' && <span className="set-badge-sandbox">sandbox</span>}
            </span>
          </div>
          <div className="set-kv">
            <span className="set-kv-k">앱 버전</span>
            <span className="set-kv-v">{__APP_VERSION__}</span>
          </div>
          <div className="set-kv">
            <span className="set-kv-k">토스 앱 버전</span>
            <span className="set-kv-v">{orDash(bridge.appVersion)}</span>
          </div>
          <div className="set-kv">
            <span className="set-kv-k">배포 ID</span>
            <span className="set-kv-v set-kv-v--mono">{orDash(bridge.deploymentId)}</span>
          </div>
          <div className="set-kv">
            <span className="set-kv-k">익명키 앞 6자</span>
            <span className="set-kv-v set-kv-v--mono">{anonKey}</span>
          </div>
          <div className="set-kv">
            <span className="set-kv-k">오늘 답변</span>
            <span className="set-kv-v">
              <span className={`set-badge-open${exhausted ? ' set-badge-open--closed' : ''}`}>
                {exhausted ? '오늘은 다 썼어요' : '열려 있어요'}
              </span>
            </span>
          </div>

          <div className="set-switch-row">
            <span className="set-text" id="ad-opt-out-label">
              <span className="set-item-title">이 기기에서 광고 끄기</span>
              <span className="set-item-desc">만든 사람과 테스터가 자기 광고를 만나지 않게 해요</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={adOptOut}
              aria-labelledby="ad-opt-out-label"
              className={`set-switch${adOptOut ? ' set-switch--on' : ''}`}
              onClick={() => void toggleAdOptOut()}
              {...testId(TEST_IDS.adOptOut)}
            >
              <span className="set-switch-knob" aria-hidden="true" />
            </button>
          </div>
        </div>

        <p className="set-hint">위 값들은 화면에만 보여 주고 로그로도 서버로도 보내지 않아요</p>
      </div>
    </div>
  );
}
