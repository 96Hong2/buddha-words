/**
 * 설정 조립.
 *
 * 설정 화면에 연꽃 줄 하나를 붙이려고 둔 자리다. 연꽃은 `domains/leaf` 것이고 설정은
 * `domains/settings` 라, 도메인끼리 들여오지 않기로 한 규칙에 따라 잇는 일을 app 층이
 * 맡는다. 홈이 `HomeScreen` 에 오늘의 한마디와 되짚기를 꽂아 주는 것과 같은 모양이다.
 */

import { useState } from 'react';

import { LeafSheet, useLeafCount } from '../../domains/leaf';
import { SettingsScreen } from '../../domains/settings/SettingsScreen';

export function SettingsRoute() {
  const [leafOpen, setLeafOpen] = useState(false);
  const leafCount = useLeafCount();

  return (
    <>
      <SettingsScreen leafCount={leafCount} onOpenLeaf={() => setLeafOpen(true)} />
      {/* 홈에서 여는 것과 같은 시트다. 모으고 나서도 닫히지 않고 그대로 남는다 */}
      <LeafSheet open={leafOpen} onClose={() => setLeafOpen(false)} />
    </>
  );
}
