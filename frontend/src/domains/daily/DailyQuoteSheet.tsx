/**
 * 「오늘의 한마디」 카드를 누르면 열리는 시트.
 *
 * 경전 번역문은 서버가 준 문장을 그대로 그린다. 여기서 모델을 부르지 않는다.
 * 손잡이·바깥·뒤로가기로 닫히고, 「나도 이야기해보기」는 닫으면서 입력창으로 보낸다.
 */

import { useOverlayBackClose } from '../../app/providers';
import type { DailyQuote } from '../../shared/api';
import { TEST_IDS, testId } from '../../shared/testIds';
import { BottomSheet } from '../../shared/ui';
import { artForScreen } from '../../shared/visual/scene';

import './daily.css';

const TITLE = '오늘의 한마디';

export interface DailyQuoteSheetProps {
  open: boolean;
  quote: DailyQuote;
  onClose: () => void;
  /** 「나도 이야기해보기」. 입력창으로 초점을 옮긴다 */
  onStart: () => void;
}

export function DailyQuoteSheet({ open, quote, onClose, onStart }: DailyQuoteSheetProps) {
  useOverlayBackClose(open, onClose);
  const art = artForScreen('dailyQuote');

  return (
    <BottomSheet open={open} onClose={onClose} ariaLabel={TITLE} className="daily-sheet">
      <div {...testId(TEST_IDS.dailySheet)}>
        <img className="daily-sheet__art" src={art.src} alt={art.alt} />
        <h2 className="daily-sheet__title">{TITLE}</h2>
        <p className="daily-sheet__verse">{quote.line}</p>
        <p className="daily-sheet__cite">{quote.scripture.citation}</p>
        <div className="daily-sheet__origin">
          <p>{quote.scripture.text}</p>
        </div>
        <button
          type="button"
          className="daily-sheet__cta"
          onClick={() => {
            onClose();
            onStart();
          }}
        >
          나도 이야기해보기
        </button>
        <p className="daily-sheet__hint">
          뒤로가기, 바깥 어두운 곳, 닫기 버튼 모두로 나갈 수 있어요
        </p>
      </div>
    </BottomSheet>
  );
}
