/**
 * 홈 맨 위에 서는 잔액 칩. 누르면 모으기 시트가 열린다.
 *
 * **0 장일 때도 숨기지 않는다.** 없다는 것도 정보다. 감추면 연잎이라는 것이 있다는
 * 사실까지 함께 사라져서, 정작 이어가기 시트에서 처음 만난 사람은 그것이 무엇인지
 * 모른 채 고르게 된다. 설정 화면의 알림 줄을 늘 그리는 것과 같은 판단이다.
 */

import { type MouseEvent } from 'react';

import { TEST_IDS, testId } from '../../shared/testIds';
import { LeafIcon } from '../../shared/ui';
import '../../shared/ui/leaf.css';

import { useLeafCount } from './useLeaves';

export interface LeafChipProps {
  onOpen: () => void;
}

export function LeafChip({ onOpen }: LeafChipProps) {
  const count = useLeafCount();

  /*
    누르는 동안 입력칸의 초점을 빼앗지 않는다. 초점이 빠지면 홈 제목이 두 줄로 펴지면서
    아래가 통째로 밀리고, 누르던 것이 손가락 밑에서 비켜난다. 예시 칩과 같은 처리다.
  */
  function keepFocus(event: MouseEvent) {
    event.preventDefault();
  }

  return (
    <button
      type="button"
      className={count > 0 ? 'leaf-chip' : 'leaf-chip leaf-chip--empty'}
      onMouseDown={keepFocus}
      onClick={onOpen}
      aria-label={`연잎 ${count}장. 눌러서 모으기`}
      {...testId(TEST_IDS.leafChip)}
    >
      <LeafIcon size={18} className="leaf-chip__icon" />
      <span aria-hidden="true">{count}</span>
    </button>
  );
}
