import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { useBridge, useOverlay } from './providers';
import { isTabRoot, parentOf } from './router/routes';

/**
 * 시스템 뒤로가기 한 곳.
 *
 * ⚠ 구독하는 순간 플랫폼 기본 뒤로가기가 막힌다. 그래서 여기서 전부 처리한다.
 * 1. 열린 오버레이가 있으면 그것부터 닫는다.
 * 2. 탭 루트(홈)면 미니앱을 닫는다.
 * 3. 그 밖에는 상위 화면으로 간다. 모르는 경로는 홈으로.
 */
export function BackHandler() {
  const bridge = useBridge();
  const overlay = useOverlay();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const handleBack = useCallback(() => {
    if (overlay.closeTop()) return;

    // 탭 루트는 위로 갈 자리가 없다. 먼저 걸러야 한다.
    // parentOf 는 어떤 경로에도 홈을 돌려주므로 뒤에 두면 여기에 닿지 못한다.
    if (isTabRoot(pathname)) {
      void bridge.closeApp().catch(() => {
        // 닫기에 실패해도 할 수 있는 게 없다. 화면은 그대로 둔다.
      });
      return;
    }

    // 하위 화면은 상위로, 모르는 경로는 홈으로. 둘 다 parentOf 가 정한다.
    navigate(parentOf(pathname), { replace: true });
  }, [bridge, navigate, overlay, pathname]);

  const latest = useRef(handleBack);
  useEffect(() => {
    latest.current = handleBack;
  }, [handleBack]);

  useEffect(() => {
    // 네이티브 리스너는 한 번만 붙인다. 화면이 바뀔 때마다 떼었다 붙이지 않는다.
    return bridge.subscribeBackPress(() => latest.current());
  }, [bridge]);

  return null;
}
