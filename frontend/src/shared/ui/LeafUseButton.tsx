/**
 * 연꽃을 쓰는 버튼과 그 아래 서는 광고 버튼.
 *
 * 이어가기 시트와 간직 시트가 **함께 쓴다.** 두 자리에 같은 선택지가 서는데 모양이나
 * 말투가 다르면 같은 앱으로 안 읽힌다. 광고 버튼 셋을 한 말투로 맞춰 둔 것과 같은
 * 이유로, 이쪽도 부품 하나를 나눠 쓴다. 도메인 둘이 쓰므로 자리는 `shared/ui` 다.
 */

import { useEffect, useRef, useState } from 'react';

import { TEST_IDS, testId } from '../testIds';

import { flyLeafTo, LEAF_FLIGHT_MS, LEAF_LAND_HOLD_MS } from './flyingLeaf';
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
 *
 * 누르면 홈 위쪽 칩에서 꽃 한 송이가 이 버튼으로 날아오고, 닿는 순간 버튼 안 숫자가
 * 한 칸 줄어든다. 그 숫자를 잠깐 보여 준 뒤에 실제 동작이 시작된다. 그 0.6초가
 * 「보낼 때마다 하나씩 쓰인다」를 말없이 알려 주는 유일한 자리다.
 * 이유는 `flyingLeaf.ts` 머리말에 있다.
 *
 * 날아가는 동안 버튼을 잠근다. 두 번 누르면 한 번에 두 송이가 나간다.
 */
export function LeafUseButton({
  count,
  action,
  disabled = false,
  onClick,
  testKey,
}: LeafUseButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const timers = useRef<number[]>([]);
  /** idle: 그대로 · flying: 꽃이 오는 중 · landed: 닿아서 숫자가 줄었다 */
  const [phase, setPhase] = useState<'idle' | 'flying' | 'landed'>('idle');

  // 날아가는 중에 화면이 바뀌면 타이머만 남는다. 걷어 둔다
  useEffect(
    () => () => {
      for (const id of timers.current) window.clearTimeout(id);
    },
    [],
  );

  /** 쓰고 나면 남는 수 */
  const left = count - 1;
  const busy = phase !== 'idle';

  function press() {
    if (busy) return;
    if (!flyLeafTo(ref.current)) {
      // 움직임을 원하지 않는 사람이거나 버튼 자리를 못 쟀다. 곧바로 한다
      onClick();
      return;
    }
    setPhase('flying');
    timers.current = [
      // 꽃이 **닿는 순간** 숫자가 준다. 누르자마자 줄면 날아오는 그림과 따로 논다
      window.setTimeout(() => setPhase('landed'), LEAF_FLIGHT_MS - 60),
      // 줄어든 숫자를 잠깐 보여 주고 나서 실제로 한다
      window.setTimeout(() => {
        setPhase('idle');
        onClick();
      }, LEAF_FLIGHT_MS + LEAF_LAND_HOLD_MS),
    ];
  }

  return (
    <button
      ref={ref}
      type="button"
      className={`leaf-use${phase === 'landed' ? ' leaf-use--landed' : ''}`}
      /*
        ⚠ 날아가는 동안 `disabled` 로 막지 않는다. 눌린 요소가 그 자리에서 비활성화되면
        **포커스가 body 로 빠진다.** 키보드·스위치·보이스오버로 누른 사람은 0.6초 동안
        시트 안에 설 자리를 잃는다. 두 번 눌리는 것은 `press()` 의 busy 가드가 막는다.
      */
      disabled={disabled}
      aria-disabled={busy || undefined}
      onClick={press}
      {...testId(TEST_IDS[testKey])}
    >
      <LotusIcon size={20} className="leaf-use__icon" />
      연꽃 한 송이로 {action}
      {/*
        「(1송이 남아요)」는 쓰기 전인지 후인지 안 갈린다. 두 송이 가진 사람이 그 말을 보면
        지금 한 송이뿐인 줄 알고 망설인다. **시제를 박는다.**
        마지막 한 송이면 숫자 대신 그 사실을 말한다. 「0송이 남아요」보다 먼저 읽힌다.
      */}
      {/*
        ⚠ 낭독기에는 한 가지로 고정해 읽힌다. 날아가는 동안 숫자가 바뀌는 것은 눈으로
        보는 장면이고, 그 사이에 이름이 두 번 바뀌면 오히려 방해다.

        **마지막 한 송이일 때는 보이는 글을 그대로 이름으로 쓴다.** 「쓰면 0송이 남아요」로
        덮으면 위 주석이 정한 결정이 낭독기에서만 뒤집히고, 보이는 말로 음성 조작도 안 된다.
      */}
      <span
        className="leaf-use__left"
        aria-label={left === 0 ? undefined : `쓰면 ${left}송이 남아요`}
      >
        {phase === 'landed'
          ? `(${left}송이 남았어요)`
          : left === 0
            ? '(마지막 한 송이)'
            : `(쓰면 ${left}송이 남아요)`}
      </span>
    </button>
  );
}

export interface LeafAltAdButtonProps {
  /** 버튼에 적는 말. 자리마다 다르다 */
  label: string;
  disabled?: boolean;
  /**
   * 잠긴 이유가 「지금 뭔가 돌고 있어서」인가. 그러면 그렇게 보이게 한다.
   * 무엇이 도는 중인지는 자리마다 다르므로 `busyLabel` 로 받는다. 한 자리 말을 여기
   * 박아 두면 다른 자리가 거짓말을 한다(간직 시트가 「이야기를 살펴보고 있어요」라고
   * 적은 적이 있다. 그때 돌던 것은 광고였다).
   */
  busy?: boolean;
  busyLabel?: string;
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
  busy = false,
  busyLabel = '',
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
      {/*
        광고임을 라벨과 아이콘 둘로 밝힌다(계획 1.6 「광고 기술 규칙」).
        돌고 있는 동안에는 재생 아이콘 자리에 도는 표가 서고 라벨만 바뀐다.
        **「광고」 배지는 어느 쪽에서도 지우지 않는다.** 규칙에 조건이 없다.
      */}
      {busy ? (
        <Spinner className="leaf-alt__spin" />
      ) : (
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
      )}
      {busy ? busyLabel : label}{' '}
      <span className="leaf-alt__badge" {...testId(TEST_IDS.adBadge)}>
        광고
      </span>
    </button>
  );
}

export interface LeafCollectCtaProps {
  /** 지금 가진 연꽃 */
  count: number;
  /**
   * 「미리 모아 두면 바로 」 뒤에 붙는 말. 예: `이어가요`
   *
   * ⚠ **이어가기 시트에서는 「광고 없이」·「무료」를 쓸 수 없다.** 계획 X25 가 막는
   * 「베푼 것을 세는 문장」과 한 글자도 안 겹치게 `flows.spec.ts` 가 문자열로 지킨다.
   * 그래서 이 말은 부르는 쪽이 정한다. 한 자리에 박아 두면 그 규칙이 다시 깨진다.
   */
  action: string;
  /** 연꽃 모으기로 간다 */
  onClick: () => void;
  disabled?: boolean;
}

/**
 * 「연꽃 모아 두기」로 가는 자리.
 *
 * ── 왜 한 줄 안내가 아니라 누를 수 있는 카드인가 ──────────────────────
 *
 * 전에는 광고 버튼 아래에 「홈 위쪽 연꽃을 미리 모아 두면 다음엔 바로 이어갈 수 있어요」가
 * 작은 회색 글씨로 있었다. 읽어도 **지금 할 수 있는 일이 아니었다.** 홈으로 돌아가
 * 작은 칩을 찾아 눌러야 했고, 그 사이 쓰던 이야기를 놓칠까 봐 아무도 안 갔다.
 * 그래서 누르면 바로 모으기로 가고, 모으고 나면 이 시트로 되돌아온다.
 * (2026-09-22 사용자 지시: 「좀 더 강조해줘. 바로 이동도 가능하게」)
 *
 * 광고 버튼보다 아래, 그리고 테두리 한 겹으로만 세운다. 주 버튼과 같은 무게로 두면
 * 지금 답을 받으러 온 사람 앞에 갈림길을 하나 더 세우는 셈이다.
 */
export function LeafCollectCta({ count, action, onClick, disabled = false }: LeafCollectCtaProps) {
  const has = count > 0;

  return (
    <button
      type="button"
      className="leaf-get"
      disabled={disabled}
      onClick={onClick}
      {...testId(TEST_IDS.leafCollectCta)}
    >
      <span className="leaf-get__art" aria-hidden="true">
        <LotusIcon size={26} className="leaf-get__icon" />
      </span>
      <span className="leaf-get__text">
        <span className="leaf-get__title">
          {has ? '연꽃을 더 모아 둘까요?' : `미리 모아 두면 바로 ${action}`}
        </span>
        {/*
          ⚠ 여기서 「무료」·「광고 없이 드려요」를 쓰지 않는다. 계획 X25 가 막는
          「베푼 것을 세는 문장」과 겹치지 않게 한다.

          **지금 가진 수만 적는다.** 얻는 방법은 눌러서 들어가면 그 화면의 버튼이
          한 줄로 말한다. 여기까지 적으면 같은 화면에서 「광고」를 한 번 더 읽게 되고,
          가운뎃점으로 두 문장을 이어 붙인 모양도 읽기 나쁘다(2026-09-23 사용자 지적).
        */}
        <span className="leaf-get__desc">
          지금 <b>{count}송이</b>
        </span>
      </span>
      <span className="leaf-get__go">
        모으기
        <svg
          viewBox="0 0 24 24"
          width="15"
          height="15"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M9.5 5.5l6.5 6.5-6.5 6.5" />
        </svg>
      </span>
    </button>
  );
}

/**
 * 「지금 무언가 돌고 있다」는 표.
 *
 * 버튼이 잠기는 자리마다 이것을 함께 둔다. 회색으로 흐려지기만 하면 사람은 앱이 멈춘
 * 줄로 읽는다. 실기기에서 실제로 그렇게 읽혔다(2026-09-22 사용자 지적).
 */
export function Spinner({ className }: { className?: string }) {
  return <span className={className == null ? 'spin' : `spin ${className}`} aria-hidden="true" />;
}
