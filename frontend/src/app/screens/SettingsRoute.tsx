/**
 * 설정 조립.
 *
 * 설정 화면에 연꽃 줄 하나를 붙이려고 둔 자리다. 연꽃은 `domains/leaf` 것이고 설정은
 * `domains/settings` 라, 도메인끼리 들여오지 않기로 한 규칙에 따라 잇는 일을 app 층이
 * 맡는다. 홈이 `HomeScreen` 에 오늘의 한마디와 되짚기를 꽂아 주는 것과 같은 모양이다.
 */

import { useState } from 'react';

import { useRewardedAd } from '../../domains/ads/useRewardedAd';
import { LeafSheet, useLeafCount } from '../../domains/leaf';
import { SettingsScreen } from '../../domains/settings/SettingsScreen';

export function SettingsRoute() {
  const [leafOpen, setLeafOpen] = useState(false);
  const leafCount = useLeafCount();
  /*
    못 모으는 기기에 모으라고 적지 않는다. 판정이 끝나기 전(`ready` 가 false)에는
    모을 수 있는 쪽으로 본다. 반대로 두면 설정을 여는 순간 「모을 수 없어요」가 깜빡
    떴다가 바뀐다. 모으기 시트가 같은 자리에서 같은 판단을 한다.
  */
  const ad = useRewardedAd('collect');

  return (
    <>
      <SettingsScreen
        leafCount={leafCount}
        leafCollectable={!ad.ready || ad.supported}
        onOpenLeaf={() => setLeafOpen(true)}
      />
      {/* 홈에서 여는 것과 같은 시트다. 모으고 나서도 닫히지 않고 그대로 남는다 */}
      <LeafSheet open={leafOpen} onClose={() => setLeafOpen(false)} />
    </>
  );
}
