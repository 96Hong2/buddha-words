import { useCallback, useState } from 'react';

import { useBridge } from '../../app/providers';

/**
 * 주소에서 사람이 읽고 손으로 쓸 수 있는 부분만 꺼낸다.
 *
 * 못 열었을 때 화면이 보여 줄 것이 이것이다. `tel:1577-0199` 를 그대로 보여 주면
 * 사람이 그걸 번호로 못 읽는다.
 */
export function readableAddress(url: string): string {
  if (url.startsWith('tel:')) return url.slice(4);
  if (url.startsWith('mailto:')) return url.slice(7);
  return url;
}

export interface OpenLink {
  /** `<a>` 의 onClick 에 그대로 건다 */
  open: (event: { preventDefault(): void }, url: string) => void;
  /**
   * 못 연 주소. 열렸으면 `null` 이다.
   *
   * 화면은 이 값이 있으면 **주소를 글자로 보여 줘야 한다.** 그래야 사람이 손으로 건다.
   */
  failed: string | null;
}

/**
 * 앱 밖으로 나가는 주소를 여는 한 줄.
 *
 * ⚠ **`<a href>` 만으로는 토스 앱 안에서 안 열린다.** 미니앱은 웹뷰에서 돌고, 웹뷰는
 * `tel:` · `mailto:` 처럼 자기가 모르는 스킴을 조용히 버린다. 눌러도 아무 일이 없다.
 * 2026-09-25 심사가 이 이유로 반려했다.
 *
 * `<a>` 는 그대로 둔다. 화면을 읽어 주는 도구가 이것을 링크로 읽어야 하고, 길게 눌러
 * 주소를 복사하는 길도 살아 있어야 한다. 누를 때만 기본 동작을 막고 브릿지로 보낸다.
 *
 * ⚠ **기본 동작을 막았으므로 브릿지가 못 열면 정말로 아무 일도 안 일어난다.** 그건 반려된
 * 판과 똑같은 증상이다. 그래서 실패를 삼키지 않고 `failed` 로 올린다. 부르는 화면은
 * 이 값을 반드시 그린다. 특히 **위기 창구에서 번호를 못 보면 사람이 다친다.**
 */
export function useOpenLink(): OpenLink {
  const bridge = useBridge();
  const [failed, setFailed] = useState<string | null>(null);

  const open = useCallback(
    (event: { preventDefault(): void }, url: string) => {
      event.preventDefault();
      void bridge
        .openURL(url)
        .then((ok) => setFailed(ok ? null : url))
        .catch(() => setFailed(url));
    },
    [bridge],
  );

  return { open, failed };
}
