import { useOverlayBackClose } from '../../app/providers';
import type { DailyQuote } from '../../shared/api';
import { TEST_IDS, testId } from '../../shared/testIds';
import { sceneForScreen } from '../../shared/visual/scene';

/** 오늘 이미 띄웠는지 적어 두는 자리. 값은 마지막으로 띄운 날짜(YYYY-MM-DD) 하나다 */
const SEEN_KEY = 'buddha.entryCard.v1';

/** 진입 카드를 닫은 방법. 넷 중 무엇으로 닫았는지 그대로 로그에 실린다 */
export type EntryCardDismiss = 'cta' | 'close' | 'backdrop' | 'back';

/** 오늘 아직 안 띄웠나. 저장소가 막혀 있으면 띄우는 쪽으로 간다 */
export function entryCardPending(dateISO: string): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) !== dateISO;
  } catch {
    return true;
  }
}

export function markEntryCardSeen(dateISO: string): void {
  try {
    localStorage.setItem(SEEN_KEY, dateISO);
  } catch {
    // 못 남겨도 화면은 그대로 돈다. 다음에 한 번 더 보일 뿐이다.
  }
}

export interface EntryCardProps {
  quote: DailyQuote;
  /** 하루 한 번 안내는 진입 카드에만 붙는다. 홈 카드로 다시 열었을 때는 맞지 않는 말이다 */
  showDailyNote: boolean;
  onDismiss: (how: EntryCardDismiss) => void;
}

/**
 * 하루 첫 진입에 한 번 뜨는 오늘의 한마디 카드.
 *
 * 바텀시트가 아니라 화면 가운데 카드라 배경에 입력창이 그대로 비친다.
 * 닫기 버튼 · 바깥 · 뒤로가기 · 「이야기 시작하기」 넷 중 무엇으로든 닫힌다.
 */
export function EntryCard({ quote, showDailyNote, onDismiss }: EntryCardProps) {
  const scene = sceneForScreen('dailyQuote');

  useOverlayBackClose(true, () => onDismiss('back'));

  return (
    <>
      {/* 바깥을 눌러도 닫힌다. 키보드·스크린리더는 아래 닫기 버튼과 뒤로가기로 닫는다 */}
      <div
        {...testId(TEST_IDS.sheetDim)}
        className="entry-dim"
        aria-hidden="true"
        onClick={() => onDismiss('backdrop')}
      />
      <div
        {...testId(TEST_IDS.entryCard)}
        className="entry-card"
        role="dialog"
        aria-modal="true"
        aria-label="오늘의 한마디"
      >
        <button
          {...testId(TEST_IDS.entryCardClose)}
          className="ec-close"
          type="button"
          aria-label="닫기"
          onClick={() => onDismiss('close')}
        >
          <svg
            width="19"
            height="19"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        <div className="ec-stage" style={{ background: scene?.backdrop }}>
          {scene != null && <img src={scene.src} alt="" />}
        </div>

        <p className="ec-k">오늘의 한마디</p>
        <p className="ec-verse">{quote.line}</p>
        <p className="ec-gloss">{quote.scripture.text}</p>
        <p className="ec-cite">{quote.scripture.citation}</p>

        <button
          {...testId(TEST_IDS.entryCardCta)}
          className="ec-cta"
          type="button"
          onClick={() => onDismiss('cta')}
        >
          이야기 시작하기
        </button>
        {showDailyNote && <p className="ec-foot">하루에 한 번만 보여 드려요</p>}
      </div>
    </>
  );
}
