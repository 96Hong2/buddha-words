import { Fragment, useEffect, useState, type ReactNode } from 'react';

import { attributionLine, type Scripture, type Term } from '../../shared/api';
import { TEST_IDS, testId } from '../../shared/testIds';
import { useOverlayBackClose } from '../../app/providers';

type OpenSheet = { kind: 'origin' } | { kind: 'term'; term: Term } | null;

export interface ScriptureCardProps {
  scripture: Scripture;
  /** 요청2가 채우는 「이 말씀은 이런 뜻이에요」. 아직 없으면 경전만 그린다 */
  explanation?: string;
  terms?: Term[];
}

function ScriptureIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3.6c2.1 2.4 2.1 6.3 0 8.7-2.1-2.4-2.1-6.3 0-8.7z" />
      <path d="M12 12.3C9.6 11.6 6 9.9 4.6 7.2c3.2-.4 6.4 1.9 7.4 5.1z" />
      <path d="M12 12.3c2.4-.7 6-2.4 7.4-5.1-3.2-.4-6.4 1.9-7.4 5.1z" />
      <path d="M3.4 12.6c1.3 4.4 4.6 7 8.6 7s7.3-2.6 8.6-7" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 5.5C5 4.3 7 4 9 4.6c1.2.4 2.2 1 3 1.8.8-.8 1.8-1.4 3-1.8 2-.6 4-.3 6 .9v12c-2-1.2-4-1.5-6-.9-1.2.4-2.2 1-3 1.8-.8-.8-1.8-1.4-3-1.8-2-.6-4-.3-6 .9z" />
      <path d="M12 6.4v12" />
    </svg>
  );
}

/**
 * 조사의 첫 글자들. 용어 뒤에 이것이 오면 낱말이 거기서 끝난 것으로 본다.
 * 형태소 분석기를 넣지 않고 이만큼만 본다. 밑줄 하나 때문에 번들에 사전을 실을 일은 아니다.
 */
const PARTICLE_HEAD = '은는이가을를의에와과도로만큼처럼부터까지보다밖뿐마저조차라란이란야여요';

/**
 * 그 자리에 용어 밑줄을 쳐도 되나.
 *
 * **앞쪽**은 길이와 무관하게 본다. 앞 글자가 한글이면 그 자리는 남의 낱말 한가운데다.
 *
 * **뒤쪽은 한 글자 용어일 때만** 본다. 한국어는 조사가 뒤에 붙어서(「업을」·「업이」)
 * 뒤를 무조건 막으면 제 낱말도 놓친다. 그런데 한 글자는 남의 낱말 첫 글자와 너무 쉽게
 * 겹친다. 그래서 한 글자에 한해, 뒤에 한글이 오면 그것이 조사일 때만 통과시킨다.
 * 두 글자 이상은 뒤를 보지 않는다. 「인색하게」의 「인색」까지 놓치기 때문이다.
 *
 * 이게 없으면 「소중한」의 「소」에 밑줄이 쳐지고, 누르면 십우도의 소 풀이가 뜬다.
 * 시드에 한 글자 용어가 여덟 개 있다(업·소·문·섬·복·매·징).
 */
function marksWord(text: string, at: number, word: string): boolean {
  if (at > 0 && /[가-힣]/.test(text[at - 1])) return false;
  if (word.length > 1) return true;
  const next = text[at + word.length];
  if (next === undefined || !/[가-힣]/.test(next)) return true;
  return PARTICLE_HEAD.includes(next);
}

/**
 * 풀이 안의 용어를 점선 밑줄 버튼으로 바꾼다.
 * 같은 용어는 처음 나온 자리에서 한 번만 표시한다. 문단마다 반복되면 글이 읽히지 않는다.
 */
function markTerms(
  text: string,
  terms: Term[],
  used: Set<string>,
  onOpen: (term: Term) => void,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let rest = text;
  let seq = 0;

  for (;;) {
    let first: { term: Term; at: number } | null = null;
    for (const term of terms) {
      if (used.has(term.word)) continue;
      let at = rest.indexOf(term.word);
      while (at >= 0 && !marksWord(rest, at, term.word)) {
        at = rest.indexOf(term.word, at + 1);
      }
      if (at < 0) continue;
      if (first == null || at < first.at) first = { term, at };
    }

    if (first == null) {
      nodes.push(<Fragment key={`t${seq}`}>{rest}</Fragment>);
      return nodes;
    }

    const found = first;
    nodes.push(<Fragment key={`t${seq}`}>{rest.slice(0, found.at)}</Fragment>);
    seq += 1;
    nodes.push(
      <button
        key={`w${seq}`}
        type="button"
        className="term"
        onClick={() => onOpen(found.term)}
        {...testId(TEST_IDS.termChip)}
      >
        {found.term.word}
      </button>,
    );
    seq += 1;
    used.add(found.term.word);
    rest = rest.slice(found.at + found.term.word.length);
  }
}

/** 묶음 B. 경전 원문과 출처, 그리고 그 뜻을 쉽게 푼 글이 한 카드에 들어간다 */
export function ScriptureCard({ scripture, explanation, terms = [] }: ScriptureCardProps) {
  const [sheet, setSheet] = useState<OpenSheet>(null);

  useOverlayBackClose(sheet != null, () => setSheet(null));

  useEffect(() => {
    if (sheet == null) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setSheet(null);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [sheet]);

  const seen = new Set<string>();
  const paragraphs = (explanation ?? '').split(/\n+/).filter((line) => line.trim() !== '');
  // 뜻풀이는 요청2가 채운다. 아직 없으면 경전 한 장만 두고 흰 카드를 씌우지 않는다
  const hasExplanation = paragraphs.length > 0;
  // 누가 한 말인가. 값은 데이터가 정하고 화면은 그대로 그린다
  const attribution = attributionLine(scripture);
  // 귀속 줄이 이미 출처 그대로면 시트에서 같은 줄을 두 번 그리지 않는다
  const showLocation = scripture.citation !== attribution;
  // 저본 칸. **문장은 서버가 완성해서 준다.** 여기서 원문 언어나 감수 상태를 보고 말을
  // 지으면, 한문에서 옮긴 육조단경 아래에 「영역본을 옮겼다」가 붙는다. 실제로 그랬다
  const source = scripture.source;
  const origin =
    source?.originalText != null && source.originalText !== ''
      ? { label: source.originalLabel ?? '원문', text: source.originalText }
      : null;
  const hasCredit =
    origin != null ||
    [source?.base, source?.note, source?.license].some((part) => part != null && part !== '');

  return (
    <section
      className={hasExplanation ? 'block card' : 'block'}
      {...testId(TEST_IDS.scriptureCard)}
    >
      <div className={hasExplanation ? 'scripture scripture--inset' : 'scripture'}>
        <div className="sec-head">
          <span className="ico">
            <ScriptureIcon />
          </span>
          <h2>이 고민과 닿아 있는 실제 가르침</h2>
        </div>
        <p className="text" {...testId(TEST_IDS.scriptureText)}>
          {scripture.text}
        </p>
        <p className="cite" {...testId(TEST_IDS.scriptureCitation)}>
          {attribution}
        </p>
        <button type="button" className="src-btn" onClick={() => setSheet({ kind: 'origin' })}>
          원문 보기
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      {hasExplanation && (
        <div {...testId(TEST_IDS.explanation)}>
          <div className="sec-head" style={{ marginTop: 'var(--s-5)' }}>
            <span className="ico">
              <BookIcon />
            </span>
            <h2>이 말씀은 이런 뜻이에요</h2>
          </div>
          {paragraphs.map((line, index) => (
            <p className="body" key={index}>
              {markTerms(line, terms, seen, (term) => setSheet({ kind: 'term', term }))}
            </p>
          ))}
        </div>
      )}

      {sheet != null && (
        <>
          <div className="dim" onClick={() => setSheet(null)} {...testId(TEST_IDS.sheetDim)} />

          {sheet.kind === 'origin' ? (
            <div className="sheet" role="dialog" aria-modal="true" aria-label="경전 원문">
              <div className="grip" aria-hidden="true" />
              <h3>경전 원문</h3>
              <p className="cite">{attribution}</p>
              <p className="lab">한국어 번역</p>
              <div className="orig">
                <p>{scripture.text}</p>
              </div>
              {origin != null && (
                <>
                  <p className="lab">{origin.label}</p>
                  <div className="orig orig--source" {...testId(TEST_IDS.scriptureOriginal)}>
                    <p lang="zh-Hant">{origin.text}</p>
                  </div>
                </>
              )}
              {showLocation && (
                <>
                  <p className="lab">경전에서의 자리</p>
                  <p className="meta">{scripture.citation}</p>
                </>
              )}
              {hasCredit && (
                <>
                  <p className="lab">옮긴 저본</p>
                  <p className="meta" {...testId(TEST_IDS.scriptureCredit)}>
                    {source?.base != null && source.base !== '' && (
                      <>
                        <b>{source.base}</b>
                        <br />
                      </>
                    )}
                    {source?.note}
                    {source?.license != null && source.license !== '' && (
                      <>
                        <br />
                        {source.license}
                      </>
                    )}
                  </p>
                </>
              )}
              <button
                type="button"
                className="btn btn--ghost btn--wide"
                onClick={() => setSheet(null)}
                {...testId(TEST_IDS.sheetClose)}
              >
                닫기
              </button>
              <p className="close-hint">
                뒤로가기, 바깥 어두운 곳, 닫기 버튼 모두로 나갈 수 있어요
              </p>
            </div>
          ) : (
            <div
              className="sheet"
              role="dialog"
              aria-modal="true"
              aria-label={sheet.term.word}
              {...testId(TEST_IDS.termSheet)}
            >
              <div className="grip" aria-hidden="true" />
              <h3>{sheet.term.word}</h3>
              <p className="gloss">{sheet.term.gloss}</p>
              <button
                type="button"
                className="btn btn--ghost btn--wide"
                onClick={() => setSheet(null)}
                {...testId(TEST_IDS.sheetClose)}
              >
                닫기
              </button>
              <p className="close-hint">
                뒤로가기, 바깥 어두운 곳, 닫기 버튼 모두로 나갈 수 있어요
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
