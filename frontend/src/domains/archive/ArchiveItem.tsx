import type { EmotionTag } from '../../shared/api';
import { TEST_IDS, testId } from '../../shared/testIds';
import { sceneForTheme } from '../../shared/visual/scene';

import type { SavedAnswer } from './archiveStore';

/**
 * 마음 태그의 한글 이름과 칩 색.
 * 색은 계열을 말한다. fear 는 두려움 계열, bond 는 관계·욕구 계열, plain 은 그 밖이다.
 * 태그마다 색이 달라지면 신호가 아니라 장식이 된다.
 *
 * 이름은 답변 화면 칩(`domains/answer/AnswerBody.tsx`)·`spec/visual-theme.ts` 와 같은 말을 쓴다.
 * 보관함은 몇 달 뒤에 다시 열어 보는 자리라, 그날의 마음에 붙은 이름이 여기서만 달라지면
 * 같은 답변이 두 이름을 갖는다. 실제로 fatigue 가 답변에서는 「피로」, 여기서는 「지침」이었고
 * approval 은 「인정욕구」와 「인정」이었다.
 */
export const TAGS: Record<EmotionTag, { ko: string; tone: 'fear' | 'bond' | 'plain' }> = {
  anxiety: { ko: '불안', tone: 'fear' },
  confusion: { ko: '혼란', tone: 'fear' },
  comparison: { ko: '남과 견주는 마음', tone: 'bond' },
  approval: { ko: '인정받고 싶은 마음', tone: 'bond' },
  attachment: { ko: '아직 남은 마음', tone: 'bond' },
  loneliness: { ko: '외로움', tone: 'bond' },
  anger: { ko: '분노', tone: 'plain' },
  regret: { ko: '후회', tone: 'plain' },
  emptiness: { ko: '공허', tone: 'plain' },
  fatigue: { ko: '지친 마음', tone: 'plain' },
  other: { ko: '복잡한 마음', tone: 'plain' },
};

export const DATE_FORMAT = new Intl.DateTimeFormat('ko-KR', {
  month: 'long',
  day: 'numeric',
  weekday: 'long',
});

/** 눌러서 다음으로 간다는 표시 */
export function ChevronIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9.5 5.5l7 6.5-7 6.5" />
    </svg>
  );
}

/**
 * 마음 태그 칩 줄. 카드와 상세가 같은 모양을 쓴다.
 * 카드가 `button` 이라 안쪽은 전부 `span` 이다. 블록 요소를 넣으면 브라우저가 판을 다시 짠다.
 */
export function TagChips({ tags }: { tags: EmotionTag[] }) {
  if (tags.length === 0) return null;
  return (
    <span className="arch-tags">
      {tags.map((tag) => (
        <span key={tag} className={`arch-tag arch-tag--${TAGS[tag].tone}`}>
          #{TAGS[tag].ko}
        </span>
      ))}
    </span>
  );
}

/** 즐겨찾기 별. 켜면 채우고 끄면 선만 남는다 */
function StarIcon({ on }: { on: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={on ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 4l2.5 5.1 5.6.8-4.05 3.95.95 5.55L12 16.8l-5.05 2.6.95-5.55L3.85 9.9l5.6-.8z" />
    </svg>
  );
}

export interface ArchiveItemProps {
  item: SavedAnswer;
  /** 오늘 나눈 이야기 자리에 놓을 때. 날짜 옆에 「오늘」이 붙는다 */
  today?: boolean;
  /** 누르면 답변 전체를 펼친다 */
  onOpen: () => void;
  /**
   * 즐겨찾기를 켜고 끈다. 주지 않으면 별을 그리지 않는다.
   * 「오늘 나눈 이야기」는 아직 기기에 없는 답이라 켤 자리가 없다.
   */
  onToggleFavorite?: () => void;
}

/**
 * 간직한 말씀 한 장.
 *
 * 카드 전체가 눌리는 `button` 이다. 예전에는 `article` 이라 눌러도 아무 일이 없었다.
 *
 * 즐겨찾기 별은 그 버튼 **밖**에 둔다. 버튼 안에 버튼을 넣을 수 없기도 하고, 안에 두면
 * 별을 누르려던 손가락이 카드를 열어 버린다. 그래서 카드를 감싸는 자리를 하나 두고
 * 별을 그 위에 얹는다.
 */
export function ArchiveItem({ item, today = false, onOpen, onToggleFavorite }: ArchiveItemProps) {
  const scene = sceneForTheme(item.visualTheme);
  const on = item.favorite === true;

  return (
    <div className="arch-row">
      <button type="button" className="arch-card" onClick={onOpen} {...testId(TEST_IDS.archiveItem)}>
        <span className="arch-body">
          <span className="arch-meta">
            <span className="arch-date">{DATE_FORMAT.format(item.savedAt)}</span>
            {today && <span className="arch-badge-today">오늘</span>}
          </span>
          <span className="arch-line">{item.line}</span>
          <TagChips tags={item.tags} />
          <span className="arch-card-cta">
            답변 다시 보기
            <ChevronIcon />
          </span>
        </span>
        <span className="arch-thumb" style={{ background: scene.backdrop }}>
          <img className="buddha-v2" src={scene.src} alt="" />
        </span>
      </button>

      {onToggleFavorite != null && (
        <button
          type="button"
          className={on ? 'arch-fav is-on' : 'arch-fav'}
          aria-pressed={on}
          aria-label={on ? '즐겨찾기 해제' : '즐겨찾기에 넣기'}
          onClick={onToggleFavorite}
          {...testId(TEST_IDS.archiveFavorite)}
        >
          <StarIcon on={on} />
        </button>
      )}
    </div>
  );
}
