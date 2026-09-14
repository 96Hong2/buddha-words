/**
 * 홈 입력 묶음 아래 「오늘의 한마디」 카드.
 *
 * 고민이 없는 날에도 들어올 이유가 되는 자리다. 날짜로 고른 감수 구절 하나라 모델을 부르지
 * 않는다. 카드에는 한 줄 경구만 보이고, 경전 본문과 출처는 눌러서 여는 시트에 있다.
 */

import { useEffect, useRef } from 'react';

import { useAnalytics } from '../../shared/analytics';
import type { DailyQuote } from '../../shared/api';
import { TEST_IDS, testId } from '../../shared/testIds';
import { sceneForScreen } from '../../shared/visual/scene';

import './daily.css';

const SURFACE = 'home_card';

export interface DailyQuoteCardProps {
  quote: DailyQuote;
  /** 시트를 연다 */
  onOpen: () => void;
}

export function DailyQuoteCard({ quote, onOpen }: DailyQuoteCardProps) {
  const analytics = useAnalytics();
  const scene = sceneForScreen('dailyQuote');
  const seen = useRef('');

  useEffect(() => {
    if (seen.current === quote.quoteId) return;
    seen.current = quote.quoteId;
    analytics.log(
      'daily_quote_impression',
      { quote_id: quote.quoteId, surface: SURFACE },
      { kind: 'impression' },
    );
  }, [analytics, quote.quoteId]);

  function open(): void {
    analytics.log(
      'daily_quote_open',
      { quote_id: quote.quoteId, surface: SURFACE },
      { kind: 'click' },
    );
    onOpen();
  }

  return (
    <button type="button" className="daily-card" onClick={open} {...testId(TEST_IDS.dailyCard)}>
      {scene == null ? null : <img className="daily-card__face" src={scene.src} alt="" />}
      <span className="daily-card__text">
        <span className="daily-card__key">오늘의 한마디</span>
        <span className="daily-card__line">{quote.line}</span>
      </span>
    </button>
  );
}
