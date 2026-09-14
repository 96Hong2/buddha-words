/**
 * 하루 천장에 닿았을 때. 이어가기 4회를 다 쓴 자리다.
 *
 * 막혔다는 말 대신 다시 올 시각을 준다. 광고를 한 번 더 권하지 않는다.
 */

import { useEffect, useRef } from 'react';

import { useAnalytics } from '../../shared/analytics';
import { TEST_IDS, testId } from '../../shared/testIds';

import './quota.css';

export interface ExhaustedNoticeProps {
  /** 오늘 이어간 횟수. 로그에만 쓴다 */
  continuesUsed: number;
}

export function ExhaustedNotice({ continuesUsed }: ExhaustedNoticeProps) {
  const analytics = useAnalytics();
  const logged = useRef(false);

  useEffect(() => {
    if (logged.current) return;
    logged.current = true;
    analytics.log('second_question_start', {
      continues_used: continuesUsed,
      gate: 'exhausted',
    });
  }, [analytics, continuesUsed]);

  return (
    <p className="quota-exhausted" role="status" {...testId(TEST_IDS.exhausted)}>
      오늘은 여기까지예요. 내일 다시 이야기해요
    </p>
  );
}
