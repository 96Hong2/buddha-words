/**
 * 연꽃을 쓰는 버튼과 그 아래 서는 광고 버튼.
 *
 * 이어가기 시트와 간직 시트가 **함께 쓴다.** 두 자리에 같은 선택지가 서는데 모양이나
 * 말투가 다르면 같은 앱으로 안 읽힌다. 광고 버튼 셋을 한 말투로 맞춰 둔 것과 같은
 * 이유로, 이쪽도 부품 하나를 나눠 쓴다. 도메인 둘이 쓰므로 자리는 `shared/ui` 다.
 */

import { TEST_IDS, testId } from '../testIds';

import { LotusIcon } from './LotusIcon';
import './leaf.css';

export interface LeafUseButtonProps {
  /** 지금 가진 연꽃. 한 송이 이상일 때만 이 버튼을 그린다 */
  count: number;
  /** 「연꽃 한 송이로 」 뒤에 붙는 말. 예: `답변 받기` */
  action: string;
  disabled?: boolean;
  onClick: () => void;
  /** 자리마다 다른 셀렉터. e2e 가 둘을 갈라 본다 */
  testKey: 'leafSpendContinue' | 'leafSpendSave';
}

/**
 * 「연꽃 한 송이로 ~하기」.
 *
 * **쓰고 나면 몇 송이 남는지를 누르기 전에 적는다.** 마지막 한 송이를 쓰는 것인지 모른 채
 * 눌렀다가, 다음 이야기에서 광고를 만나면 그때서야 알게 된다.
 */
export function LeafUseButton({
  count,
  action,
  disabled = false,
  onClick,
  testKey,
}: LeafUseButtonProps) {
  const left = count - 1;

  return (
    <button
      type="button"
      className="leaf-use"
      disabled={disabled}
      onClick={onClick}
      {...testId(TEST_IDS[testKey])}
    >
      <LotusIcon size={20} className="leaf-use__icon" />
      연꽃 한 송이로 {action}
      {/*
        「(1송이 남아요)」는 쓰기 전인지 후인지 안 갈린다. 두 송이 가진 사람이 그 말을 보면
        지금 한 송이뿐인 줄 알고 망설인다. **시제를 박는다.**
        마지막 한 송이면 숫자 대신 그 사실을 말한다. 「0송이 남아요」보다 먼저 읽힌다.
      */}
      <span className="leaf-use__left">
        {left === 0 ? '(마지막 한 송이)' : `(쓰면 ${left}송이 남아요)`}
      </span>
    </button>
  );
}

export interface LeafAltAdButtonProps {
  /** 버튼에 적는 말. 자리마다 다르다 */
  label: string;
  disabled?: boolean;
  onClick: () => void;
  testKey: 'continueWatch' | 'saveGateWatch';
}

/**
 * 연꽃이 있을 때 **아래로 내려가는** 광고 버튼.
 *
 * 순서를 뒤집지 않는다. 이미 값을 치러 둔 사람 앞에 광고를 먼저 세우면, 연꽃을 모을
 * 이유가 그 자리에서 사라진다. 「광고」라는 글자는 여기서도 배지로 남긴다.
 */
export function LeafAltAdButton({
  label,
  disabled = false,
  onClick,
  testKey,
}: LeafAltAdButtonProps) {
  return (
    <button
      type="button"
      className="leaf-alt"
      disabled={disabled}
      onClick={onClick}
      {...testId(TEST_IDS[testKey])}
    >
      {/* 광고임을 라벨과 아이콘 둘로 밝힌다(계획 1.6 「광고 기술 규칙」) */}
      <span className="leaf-alt__play" aria-hidden="true">
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        >
          <rect x="3.2" y="5.2" width="17.6" height="13.6" rx="3" />
          <path d="M10.6 9.6l4.6 2.6-4.6 2.6z" fill="currentColor" stroke="none" />
        </svg>
      </span>
      {label}{' '}
      <span className="leaf-alt__badge" {...testId(TEST_IDS.adBadge)}>
        광고
      </span>
    </button>
  );
}
