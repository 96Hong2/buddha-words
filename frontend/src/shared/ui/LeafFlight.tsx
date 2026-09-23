/**
 * 날아가는 연꽃 한 송이. 앱 껍데기에 한 번 마운트된다.
 *
 * 왜 여기 있는지는 `flyingLeaf.ts` 머리말에 적어 두었다. 이 파일은 그 신호를 그린다.
 */

import { useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

import { clearLeafFlight, LEAF_FLIGHT_MS, readLeafFlight, subscribeLeafFlight } from './flyingLeaf';
import { LotusIcon } from './LotusIcon';
import './leaf.css';

export function LeafFlight() {
  const flight = useSyncExternalStore(subscribeLeafFlight, readLeafFlight, () => null);

  useEffect(() => {
    if (flight == null) return;
    // 애니메이션이 끝나면 스스로 치운다. `animationend` 만 믿지 않는다. 탭이 뒤로
    // 넘어가 있으면 그 이벤트가 안 와서 꽃이 화면에 남는다
    const timer = window.setTimeout(clearLeafFlight, LEAF_FLIGHT_MS + 80);
    return () => window.clearTimeout(timer);
  }, [flight]);

  if (flight == null || typeof document === 'undefined') return null;

  return createPortal(
    <span
      key={flight.seq}
      className="leaf-fly"
      aria-hidden="true"
      style={
        {
          left: `${flight.fromX}px`,
          top: `${flight.fromY}px`,
          '--leaf-fly-dx': `${flight.toX - flight.fromX}px`,
          '--leaf-fly-dy': `${flight.toY - flight.fromY}px`,
          '--leaf-fly-ms': `${LEAF_FLIGHT_MS}ms`,
        } as React.CSSProperties
      }
    >
      <LotusIcon size={44} className="leaf-fly__icon" />
    </span>,
    document.body,
  );
}
