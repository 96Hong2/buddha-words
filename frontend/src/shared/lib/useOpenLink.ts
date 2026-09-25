import { useCallback } from 'react';

import { useBridge } from '../../app/providers';

/**
 * 앱 밖으로 나가는 주소를 여는 한 줄.
 *
 * ⚠ **`<a href>` 만으로는 토스 앱 안에서 안 열린다.** 미니앱은 웹뷰에서 돌고, 웹뷰는
 * `tel:` · `mailto:` 처럼 자기가 모르는 스킴을 조용히 버린다. 눌러도 아무 일이 없다.
 * 2026-09-25 심사가 이 이유로 반려했다.
 *
 * `<a>` 는 그대로 둔다. 화면을 읽어 주는 도구가 이것을 링크로 읽어야 하고, 길게 눌러
 * 주소를 복사하는 길도 살아 있어야 한다. 누를 때만 기본 동작을 막고 브릿지로 보낸다.
 */
export function useOpenLink(): (event: { preventDefault(): void }, url: string) => void {
  const bridge = useBridge();

  return useCallback(
    (event, url) => {
      event.preventDefault();
      void bridge.openURL(url);
    },
    [bridge],
  );
}
