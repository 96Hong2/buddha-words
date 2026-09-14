/**
 * 공유 카드.
 *
 * 서버가 1080 × 1620 으로 렌더할 판을 화면에서도 같은 비율로 그린다.
 * 카드에는 부처 그림 · 마음 태그 · 오늘의 부처의 말 · 경전 원문과 출처 · 한 줄 풀이 ·
 * 「현대적 풀이」 소표기 · 워드마크 · CTA 가 들어간다.
 *
 * **사용자가 적은 고민 원문은 어떤 경우에도 들어가지 않는다.** 받는 props 에 원문 자리가 없다.
 */

import type { EmotionTag, Scripture } from '../../shared/api';
import { TEST_IDS, testId } from '../../shared/testIds';
import { sceneForScreen } from '../../shared/visual/scene';

import './share.css';

/** 태그 칩의 우리말과 색. 두려움·지침 계열은 세이지, 관계·욕구 계열은 연꽃 */
const TAG: Record<EmotionTag, { label: string; tone: 'lotus' | 'sage' }> = {
  anxiety: { label: '불안', tone: 'sage' },
  comparison: { label: '비교', tone: 'lotus' },
  approval: { label: '인정욕구', tone: 'lotus' },
  attachment: { label: '집착', tone: 'lotus' },
  anger: { label: '분노', tone: 'lotus' },
  regret: { label: '후회', tone: 'lotus' },
  loneliness: { label: '외로움', tone: 'lotus' },
  emptiness: { label: '공허', tone: 'sage' },
  confusion: { label: '혼란', tone: 'sage' },
  fatigue: { label: '지침', tone: 'sage' },
  other: { label: '마음', tone: 'sage' },
};

/** 넷째 칩부터는 줄이 접혀 한마디 자리를 먹는다 */
const MAX_TAGS = 3;

/** 카드에 올리는 한 줄 풀이. 해설의 첫 문장을 96자까지만 쓴다. 모델을 다시 부르지 않는다 */
export function oneLineGloss(source: string): string {
  const text = source.trim().replace(/\s+/g, ' ');
  const stop = text.search(/[.!?]/);
  const first = stop >= 0 ? text.slice(0, stop + 1) : text;
  return first.length <= 96 ? first : `${first.slice(0, 95).trimEnd()}…`;
}

/** 말줄임 대신 글자 크기를 세 단계로 낮춘다 */
function lineClass(message: string): string {
  if (message.length <= 24) return 'sh-card__line--l';
  if (message.length <= 34) return 'sh-card__line--m';
  return 'sh-card__line--s';
}

export interface ShareCardProps {
  tags: readonly EmotionTag[];
  /** 오늘의 부처의 말. 경구체 한두 문장 */
  buddhaMessage: string;
  scripture: Scripture;
  /** 경전 해설. 첫 문장만 카드에 올라간다 */
  gloss: string;
  className?: string;
}

export function ShareCard({ tags, buddhaMessage, scripture, gloss, className }: ShareCardProps) {
  const scene = sceneForScreen('shareCard');

  return (
    <div
      className={className == null ? 'sh-card' : `sh-card ${className}`}
      style={scene == null ? undefined : { background: scene.backdrop }}
      {...testId(TEST_IDS.shareCard)}
    >
      <div className="sh-card__veil" aria-hidden="true" />
      <div className="sh-card__in">
        <div className="sh-card__body">
          {scene == null ? null : <img className="sh-card__face" src={scene.src} alt="" />}
          <div className="sh-card__chips">
            {tags.slice(0, MAX_TAGS).map((tag) => (
              <span key={tag} className={`sh-card__chip sh-card__chip--${TAG[tag].tone}`}>
                #{TAG[tag].label}
              </span>
            ))}
          </div>
          <p className={`sh-card__line ${lineClass(buddhaMessage)}`}>{buddhaMessage}</p>
          <div className="sh-card__quote">
            <p>{scripture.text}</p>
            <cite>{scripture.citation}</cite>
          </div>
          <p className="sh-card__gloss">{oneLineGloss(gloss)}</p>
        </div>

        <p className="sh-card__ai">부처의 가르침을 오늘의 언어로 풀어쓴 말 · AI 생성</p>

        <div className="sh-card__brand">
          <span className="sh-card__mark">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 4.2c2.7 2.2 4.2 4.6 4.2 6.9A4.2 4.2 0 0 1 12 15.3a4.2 4.2 0 0 1-4.2-4.2c0-2.3 1.5-4.7 4.2-6.9Z"
                fill="var(--accent-rule)"
              />
              <path
                d="M3.6 13.6c3.1-.9 5.6-.3 7.4 1.4-1.8 1.7-4.3 2.3-7.4 1.4Zm16.8 0c-3.1-.9-5.6-.3-7.4 1.4 1.8 1.7 4.3 2.3 7.4 1.4Z"
                fill="var(--accent)"
              />
              <path d="M6.6 18.8h10.8" stroke="var(--accent-rule)" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </span>
          <div>
            <div className="sh-card__wordmark">부처의 말</div>
            <p className="sh-card__tagline">나도 내 고민에 맞는 말을 받아보기</p>
          </div>
        </div>
      </div>
    </div>
  );
}
