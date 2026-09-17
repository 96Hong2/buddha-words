/**
 * 답변을 어디까지 읽고 어디서 나갔나.
 *
 * `answer_read_50/70/90` 은 스크롤 비율로 이미 재고 있다. 여기가 더하는 것은 둘이다.
 *
 * 1. **어느 블록까지 갔나**(`answer_section_view`). 비율은 「절반쯤 읽었다」만 말해 주고,
 *    「경전에서 멈췄나 행동에서 멈췄나」는 말해 주지 않는다. 고칠 자리를 찾으려면 뒤엣것이 필요하다.
 * 2. **얼마나 보다 나갔나**(`answer_exit`). 답을 받자마자 3초 만에 나간 것과 1분 읽고 나간 것은
 *    다른 일이다. 앞엣것이 많으면 답이 사람에게 닿지 않은 것이다.
 *
 * 관찰만 한다. 화면에 아무것도 더하지 않고, 사용자에게 아무것도 묻지 않는다.
 *
 * `IntersectionObserver` 하나로 블록 전부를 본다. 블록마다 옵저버를 만들면 스크롤 성능이 준다.
 */

import { useEffect, useRef } from 'react';

import { dwellBucket, useAnalytics } from '../../shared/analytics';

/** 답변 블록. `spec/events.ts` 의 section 열거값과 같아야 한다 */
export type AnswerSection =
  | 'tags'
  | 'message'
  | 'scripture'
  | 'explanation'
  | 'analysis'
  | 'action'
  | 'closing'
  | 'cta';

/** 블록을 가리키는 표. DOM 속성 하나로 어느 블록인지 말한다 */
export const SECTION_ATTR = 'data-answer-section';

export interface Consumption {
  /** 화면을 떠나는 이유를 미리 적어 둔다. 공유·간직·새 고민을 누르면 그 값이 실린다 */
  markExit: (exit: 'back' | 'new_concern' | 'share' | 'save' | 'other') => void;
}

export function useAnswerConsumption(
  answerId: string,
  route: string,
  /** 지금까지 읽은 최대 비율. AnswerScreen 이 스크롤로 재고 있는 값을 빌려 온다 */
  maxRead: () => number,
): Consumption {
  const analytics = useAnalytics();
  const enteredAt = useRef(Date.now());
  const exitReason = useRef<'back' | 'new_concern' | 'share' | 'save' | 'other'>('other');

  useEffect(() => {
    enteredAt.current = Date.now();
    exitReason.current = 'other';

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const section = entry.target.getAttribute(SECTION_ATTR);
          if (section == null) continue;
          analytics.log(
            'answer_section_view',
            { answer_id: answerId, route, section },
            // 같은 블록이 다시 보여도 한 번만 센다. 위아래로 훑으면 몇 번이고 다시 들어온다
            { kind: 'impression', once: `section:${answerId}:${section}` },
          );
          observer.unobserve(entry.target);
        }
      },
      // 블록 위쪽 4분의 1이 보이면 도달로 본다. 스치듯 지나간 것과 가르려는 것이 아니라
      // 「거기까지 내려갔나」를 보는 값이다
      { threshold: 0.25 },
    );

    for (const node of document.querySelectorAll(`[${SECTION_ATTR}]`)) observer.observe(node);
    return () => observer.disconnect();
  }, [analytics, answerId, route]);

  useEffect(() => {
    const started = enteredAt.current;
    return () => {
      analytics.log('answer_exit', {
        answer_id: answerId,
        route,
        max_read_bucket: readBucket(maxRead()),
        dwell_bucket_s: dwellBucket(Date.now() - started),
        exit: exitReason.current,
      });
    };
    // maxRead 는 값을 읽는 함수라 의존성에 넣지 않는다. 넣으면 매 렌더마다 나가는 로그가 된다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analytics, answerId, route]);

  return {
    markExit: (exit) => {
      exitReason.current = exit;
    },
  };
}

/** 읽은 비율을 굵은 칸으로 나눈다. 정확한 퍼센트는 남기지 않는다 */
function readBucket(percent: number): string {
  if (percent < 25) return '<25';
  if (percent < 50) return '25-49';
  if (percent < 70) return '50-69';
  if (percent < 90) return '70-89';
  return '90+';
}
