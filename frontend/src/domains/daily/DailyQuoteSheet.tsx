/**
 * 「오늘의 한마디」 카드를 누르면 열리는 시트.
 *
 * 경전 번역문은 서버가 준 문장을 그대로 그린다. 여기서 모델을 부르지 않는다.
 * 손잡이·바깥·뒤로가기로 닫히고, 「나도 이야기해보기」는 닫으면서 입력창으로 보낸다.
 *
 * 한마디와 원문은 성격이 달라 따로 세운다. 한마디는 AI 가 오늘의 말로 풀어쓴 문장이고
 * 아래 블록이 경전 원문이다. 예전에는 한마디 바로 밑에 출처가 붙어 있어서, 경전에 저 문장이
 * 그대로 적혀 있는 것처럼 읽혔다. 출처는 원문 쪽으로 내리고 한마디에는 AI 표시를 붙였다.
 */

import { useOverlayBackClose } from '../../app/providers';
import { attributionLine, type DailyQuote } from '../../shared/api';
import { TEST_IDS, testId } from '../../shared/testIds';
import { BottomSheet } from '../../shared/ui';
import { artForScreen } from '../../shared/visual/scene';

import './daily.css';

const TITLE = '오늘의 한마디';
const AI_NOTE = '불교의 가르침을 오늘의 언어로 풀었어요';
const ORIGIN_LABEL = '경전 원문';

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
        <p className="daily-sheet__ai">{AI_NOTE}</p>

        <p className="daily-sheet__lab">{ORIGIN_LABEL}</p>
        <div className="daily-sheet__origin">
          <p>{quote.scripture.text}</p>
        </div>
        <p className="daily-sheet__cite">{attributionLine(quote.scripture)}</p>
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
