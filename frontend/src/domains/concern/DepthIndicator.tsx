import { depthIndicator } from '@spec/router.ts';

import { cx } from '../../shared/lib/cx';
import { TEST_IDS, testId } from '../../shared/testIds';

const DOTS = [0, 1, 2];

/**
 * 입력창 아래 점 셋 + 문구.
 *
 * 맥락을 더 쓰게 만드는 장치이지 라우팅 규칙이 아니다. 판정과 문구는 spec/router.ts 의
 * depthIndicator() 가 전부 정하고, 여기서는 어떤 색으로 칠할지만 정한다.
 * dots 가 칠할 개수 그 자체라 0 → 1 → 2 → 3 으로 한 칸씩 차오른다.
 * 마지막 칸이 차는 순간에만 세이지에서 금색으로 한 번 바뀐다.
 */
export function DepthIndicator({ text }: { text: string }) {
  const { dots, label } = depthIndicator(text);
  const isDeep = dots === DOTS.length;
  const filled = dots;

  return (
    <div className="meter">
      <div className="dots" aria-hidden="true" {...testId(TEST_IDS.depthDots)}>
        {DOTS.map((index) => (
          <i key={index} className={cx(index < filled && (isDeep ? 'gold' : 'on'))} />
        ))}
      </div>
      <span className={cx('meter-label', isDeep && 'deep')} {...testId(TEST_IDS.depthLabel)}>
        {label}
      </span>
    </div>
  );
}
