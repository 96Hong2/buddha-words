/**
 * 방금 나간 로그를 눈으로 보는 자리. **개발에서만 산다.**
 *
 * `import.meta.env.DEV` 는 vite 가 빌드 때 `false` 로 갈아 끼우므로 운영 번들에서는
 * 이 화면도 수집기도 통째로 지워진다. 그래서 이 비교는 여기서 직접 적는다.
 *
 * 무엇을 보려고 만들었나. 셋이다.
 * 1. **중복** 같은 이벤트가 스크롤·리렌더마다 다시 나가는지
 * 2. **누락** 눌렀는데 아무것도 안 나가는 자리가 있는지
 * 3. **개인정보** 페이로드에 고민 원문·답변 본문이 섞여 들어갔는지
 *
 * 특히 3번이 이 화면의 존재 이유다. 코드 리뷰로는 놓치기 쉽고, 여기서는 한눈에 보인다.
 */

import { useEffect, useState } from 'react';

import { debugSink, type DebugRecord } from '../../shared/analytics';
import { TEST_IDS, testId } from '../../shared/testIds';

import './debug.css';

/** 값이 길면 원문이 섞여 들어갔다는 뜻이다. 눈에 띄게 잘라서 보여 준다 */
const LONG = 60;

function Row({ record }: { record: DebugRecord }) {
  const params = Object.entries(record.params).filter(([, value]) => value !== undefined);
  const time = new Date(record.at).toLocaleTimeString('ko-KR', { hour12: false });

  return (
    <li className="dbg-row">
      <p className="dbg-head">
        <b>{record.name}</b>
        <span className="dbg-kind">{record.kind}</span>
        <span className="dbg-time">{time}</span>
      </p>
      <dl className="dbg-params">
        {params.map(([key, value]) => {
          const text = typeof value === 'string' ? value : JSON.stringify(value);
          const long = text.length > LONG;
          return (
            <div key={key}>
              <dt>{key}</dt>
              <dd className={long ? 'dbg-long' : undefined}>
                {long ? `${text.slice(0, LONG)}… (${text.length}자 · 원문이 섞였는지 본다)` : text}
              </dd>
            </div>
          );
        })}
      </dl>
    </li>
  );
}

export function DebugEventsScreen() {
  const [, bump] = useState(0);

  useEffect(() => {
    if (debugSink == null) return;
    return debugSink.subscribe(() => bump((n) => n + 1));
  }, []);

  const sink = debugSink;
  if (sink == null) return null;
  const records = sink.list();

  return (
    <main className="dbg" {...testId(TEST_IDS.debugEvents)}>
      <div className="dbg-bar">
        <h1>이벤트 {records.length}건</h1>
        <button type="button" onClick={() => sink.clear()}>
          비우기
        </button>
      </div>
      {records.length === 0 ? (
        <p className="dbg-empty">아직 아무것도 안 나갔어요. 화면을 눌러 보세요.</p>
      ) : (
        <ul className="dbg-list">
          {records.map((record) => (
            <Row key={String(record.params.event_id ?? record.at)} record={record} />
          ))}
        </ul>
      )}
    </main>
  );
}
