/**
 * 공유 카드.
 *
 * 서버가 1080 × 1620 으로 렌더할 판을 화면에서도 같은 비율로 그린다.
 * 카드에는 부처 그림 · 경전 원문과 귀속 · 한 줄 풀이 · AI 소표기 · 워드마크 · CTA 가 들어간다.
 *
 * ── 왜 「오늘의 부처의 말」과 마음 태그가 카드에서 빠졌나 ──────────────────────
 *
 * 전에는 그 한마디가 카드의 가장 큰 글씨였다. 원문 문자열은 실리지 않았지만, 한마디는
 * 그 고민을 읽고 쓴 문장이라 상황이 그대로 비쳤다. 실제로 그려 본 카드가 이랬다.
 *
 *   #불안 #인정욕구 #분노
 *   「아이 소식으로 너를 재단하게 두지 마라. 남의 말은 너의 가치를 정하지 못한다.」
 *
 * 받는 사람은 이 두 줄로 보낸 사람이 아이 문제로 누구에게 무슨 말을 들었는지 읽는다.
 * 고민 원문을 싣지 않는다는 규칙의 목적이 문장 생성으로 우회된 것이다. 시트에 적어 둔
 * 「적은 이야기는 카드에 들어가지 않아요」도 글자로만 맞는 말이었다.
 *
 * 그래서 카드의 주인공을 **경전 구절**로 바꿨다. 남는 것은 전부 이 고민과
 * 무관하게 존재하던 글이다. 한 줄 풀이만 모델이 쓰는데, 그 자리는 「구절 자체의 뜻」을
 * 적는 첫 문장으로 못 박혀 있다(`prompts.py` PASS2 · `oneLineGloss`).
 *
 * 성장 고리를 버린 것은 아니다. 남과 다른 것이 바로 이 구절이라 카드가 오히려 제품을
 * 정확히 말한다. 한마디는 앱 안에서만 본다.
 *
 * **사용자가 적은 고민 원문은 어떤 경우에도 들어가지 않는다.** 받는 props 에 원문 자리가 없다.
 */

import { attributionLine, type Scripture } from '../../shared/api';
import { TEST_IDS, testId } from '../../shared/testIds';
import { sceneForScreen } from '../../shared/visual/scene';

import './share.css';

/** 금색 상자 안만 경전 원문이다. 감수 여부는 아래 소표기가 따로 말한다 */
const QUOTE_LABEL = '경전 원문';

/**
 * 서버가 구절마다 붙여 보내는 감수 문구.
 * 글자가 서버와 같아야 한다(`backend/app/domains/scripture/repo.py` 의 `_REVIEW_DONE`,
 * 스텁은 `shared/api/stubData.ts` 의 `SOURCE_NOTES.reviewed`).
 */
const REVIEWED_NOTE = '외부 문헌 감수에서 출처와 화자를 확인했어요.';

/**
 * 이 구절이 문헌 감수를 통과했나.
 *
 * 저본 문구에 감수 문장이 실려 있을 때만 참이다. 근거가 없으면 감수했다고 적지 않는다.
 * 카드는 앱 밖으로 나가 「부처의 말」 워드마크와 나란히 놓이는 그림이라, 초안 구절에
 * 감수 도장을 찍어 보내면 되돌릴 방법이 없다.
 */
export function isReviewed(scripture: Scripture): boolean {
  return scripture.source?.note?.includes(REVIEWED_NOTE) ?? false;
}

/** 감수 통과분에만 감수했다고 적는다. 미감수 문구는 경전 저장소가 쓰는 말과 같다 */
const REVIEWED_HEAD = '경전 원문은 사람이 감수했어요';
const DRAFT_HEAD = '문헌 감수는 아직 받지 않은 구절이에요';

/**
 * 카드 아래 소표기. 생성형 AI 고지를 겸한다.
 * 카드에서 AI 가 쓴 글은 한 줄 풀이 하나뿐이라 그것만 가리킨다.
 * 서버가 그리는 카드와 같은 문장이다(`backend/app/domains/share/card.py` 의 `ai_note`).
 */
export function aiNote(scripture: Scripture): string {
  return `${isReviewed(scripture) ? REVIEWED_HEAD : DRAFT_HEAD} · 한 줄 풀이는 AI 생성`;
}

/** 카드에 올리는 한 줄 풀이. 해설의 첫 문장을 96자까지만 쓴다. 모델을 다시 부르지 않는다 */
export function oneLineGloss(source: string): string {
  const text = source.trim().replace(/\s+/g, ' ');
  const stop = text.search(/[.!?]/);
  const first = stop >= 0 ? text.slice(0, stop + 1) : text;
  return first.length <= 96 ? first : `${first.slice(0, 95).trimEnd()}…`;
}

/**
 * 경전이 카드의 주인공이라 짧은 구절은 크게 세운다.
 * 말줄임 대신 글자 크기를 네 단계로 낮춘다. 감수 원문은 자르지 않는다.
 * 경계는 서버 렌더(`backend/app/domains/share/card.py` VERSE_STEPS)와 같은 값이다.
 */
function verseClass(text: string): string {
  if (text.length <= 60) return 'sh-card__verse--xl';
  if (text.length <= 110) return 'sh-card__verse--l';
  if (text.length <= 160) return 'sh-card__verse--m';
  return 'sh-card__verse--s';
}

export interface ShareCardProps {
  scripture: Scripture;
  /** 경전 해설. 첫 문장만 카드에 올라간다 */
  gloss: string;
  className?: string;
}

export function ShareCard({ scripture, gloss, className }: ShareCardProps) {
  const scene = sceneForScreen('shareCard');
  const glossLine = oneLineGloss(gloss);

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
          <div className="sh-card__quote">
            <p className="sh-card__qlab">{QUOTE_LABEL}</p>
            <p className={`sh-card__verse ${verseClass(scripture.text)}`}>{scripture.text}</p>
            <cite>{attributionLine(scripture)}</cite>
          </div>
          {glossLine === '' ? null : <p className="sh-card__gloss">{glossLine}</p>}
        </div>

        <p className="sh-card__ai">{aiNote(scripture)}</p>

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
              <path
                d="M6.6 18.8h10.8"
                stroke="var(--accent-rule)"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
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
