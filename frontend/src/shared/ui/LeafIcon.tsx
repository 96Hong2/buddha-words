/**
 * 연잎 한 장.
 *
 * 연꽃이 아니라 **잎**이다. 꽃은 이 앱에서 이미 장식으로 쓰고 있어서, 재화까지 꽃이면
 * 화면에 같은 모양이 두 뜻으로 선다. 잎은 물 위에 떠서 무언가를 받쳐 주는 것이라
 * 「모아 두었다가 쓴다」와도 맞는다.
 *
 * ── 왜 이렇게 그렸나 ─────────────────────────────────────────────────────
 *
 * 처음에는 잎맥을 굵고 진하게 그려 원을 여섯 조각으로 잘랐더니, 18px 칩에서 잎이 아니라
 * 자른 피자처럼 보였다. 지금은 셋을 바꿨다.
 *
 *   틈을 넓혔다      연잎의 가장 큰 특징이다. 12시 방향 20도를 비운다
 *   잎맥을 줄였다    가장자리까지 닿지 않게 하고 옅게 깐다. 작을수록 사라져야 하는 무늬다
 *   배꼽을 찍었다    잎자루가 붙는 자리. 방사형의 중심이 어디인지 이것이 말한다
 *
 * 색은 여기서 정하지 않는다. `currentColor` 를 따라가므로 놓이는 자리가 정한다.
 */

export interface LeafIconProps {
  /** 한 변의 픽셀. 정사각이다 */
  size?: number;
  className?: string;
}

export function LeafIcon({ size = 20, className }: LeafIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      {/* 잎 몸통. 12시 방향에 물이 드나드는 틈 하나를 둔다 */}
      <path d="M12 12 L13.55 3.23 A8.9 8.9 0 1 1 10.45 3.23 Z" fill="currentColor" />

      {/* 잎맥 다섯. 가장자리에 닿지 않게 끊어 무늬로만 남긴다 */}
      <g
        stroke="var(--surface, #fff)"
        strokeWidth="0.9"
        strokeLinecap="round"
        opacity="0.38"
        fill="none"
      >
        <path d="M13.39 11.2 L17.54 8.8" />
        <path d="M11.67 10.43 L10.67 5.74" />
        <path d="M10.41 11.83 L5.63 11.33" />
        <path d="M11.35 13.46 L9.4 17.85" />
        <path d="M13.19 13.07 L16.76 16.28" />
      </g>

      {/* 잎자루가 붙는 배꼽 */}
      <circle cx="12" cy="12" r="1.05" fill="var(--surface, #fff)" opacity="0.5" />
    </svg>
  );
}
