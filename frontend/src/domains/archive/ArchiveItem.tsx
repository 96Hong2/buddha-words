import type { EmotionTag } from '../../shared/api';
import { TEST_IDS, testId } from '../../shared/testIds';
import { sceneForTheme } from '../../shared/visual/scene';

import type { SavedAnswer } from './archiveStore';

/**
 * 마음 태그의 한글 이름과 칩 색.
 * 색은 계열을 말한다. fear 는 두려움 계열, bond 는 관계·욕구 계열, plain 은 그 밖이다.
 * 태그마다 색이 달라지면 신호가 아니라 장식이 된다.
 */
const TAGS: Record<EmotionTag, { ko: string; tone: 'fear' | 'bond' | 'plain' }> = {
  anxiety: { ko: '불안', tone: 'fear' },
  confusion: { ko: '혼란', tone: 'fear' },
  comparison: { ko: '비교', tone: 'bond' },
  approval: { ko: '인정', tone: 'bond' },
  attachment: { ko: '집착', tone: 'bond' },
  loneliness: { ko: '외로움', tone: 'bond' },
  anger: { ko: '분노', tone: 'plain' },
  regret: { ko: '후회', tone: 'plain' },
  emptiness: { ko: '공허', tone: 'plain' },
  fatigue: { ko: '지침', tone: 'plain' },
  other: { ko: '마음', tone: 'plain' },
};

const DATE_FORMAT = new Intl.DateTimeFormat('ko-KR', {
  month: 'long',
  day: 'numeric',
  weekday: 'long',
});

export interface ArchiveItemProps {
  item: SavedAnswer;
  /** 오늘 나눈 이야기 자리에 놓을 때. 날짜 옆에 「오늘」이 붙는다 */
  today?: boolean;
}

export function ArchiveItem({ item, today = false }: ArchiveItemProps) {
  const scene = sceneForTheme(item.visualTheme);

  return (
    <article className="arch-card" {...testId(TEST_IDS.archiveItem)}>
      <div className="arch-body">
        <div className="arch-meta">
          <span className="arch-date">{DATE_FORMAT.format(item.savedAt)}</span>
          {today && <span className="arch-badge-today">오늘</span>}
        </div>
        <p className="arch-line">{item.line}</p>
        <div className="arch-tags">
          {item.tags.map((tag) => (
            <span key={tag} className={`arch-tag arch-tag--${TAGS[tag].tone}`}>
              #{TAGS[tag].ko}
            </span>
          ))}
        </div>
      </div>
      <span className="arch-thumb" style={{ background: scene.backdrop }}>
        <img className="buddha-v2" src={scene.src} alt="" />
      </span>
    </article>
  );
}
