import { TEST_IDS, testId } from '../../shared/testIds';

import './settings.css';
import { readableAddress, useOpenLink } from '../../shared/lib/useOpenLink';

/**
 * 창구 목록. 정본은 통합 개발 계획 M4 의 창구 표다.
 *
 * 두 층을 섞지 않는다. 복지부가 「정신건강상담전화(1577-0199), 생명의 전화(1588-9191) 등을
 * 모두 109 로 대체했다」고 적었기 때문에, 109·마들랜 아래층에 역할별 창구를 따로 둔다.
 */
interface Line {
  name: string;
  /** 전화번호 또는 이야기하는 방법 */
  how: string;
  desc: string;
  /** 걸 수 있는 번호. 글로 하는 창구는 없다 */
  tel?: string;
  icon: 'call' | 'chat';
}

const FIRST: Line[] = [
  {
    name: '자살예방상담전화',
    how: '109',
    desc: '24시간 · 걸면 상담원과 바로 이야기해요',
    tel: '109',
    icon: 'call',
  },
  {
    name: '자살예방 SNS 상담 마들랜',
    how: '문자 · 카카오톡',
    desc: '말로 하기 어려우면 글로 이야기할 수 있어요',
    icon: 'chat',
  },
];

const BY_ROLE: Line[] = [
  {
    name: '정신건강상담전화',
    how: '1577-0199',
    desc: '마음이 계속 힘들 때. 24시간 열려 있어요',
    tel: '1577-0199',
    icon: 'call',
  },
  {
    name: '청소년전화',
    how: '1388',
    desc: '열아홉 살 아래라면 여기로. 24시간 열려 있어요',
    tel: '1388',
    icon: 'call',
  },
  {
    name: '여성긴급전화',
    how: '1366',
    desc: '가정이나 연인 사이의 폭력을 겪고 있을 때요',
    tel: '1366',
    icon: 'call',
  },
];

function LineIcon({ kind }: { kind: Line['icon'] }) {
  return (
    <span className="set-line-icon" aria-hidden="true">
      {kind === 'call' ? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6.6 3.5h3l1.5 3.8-2 1.3a12 12 0 0 0 5.3 5.3l1.3-2 3.8 1.5v3a2 2 0 0 1-2.2 2A16.6 16.6 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2Z" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 12.5a7.5 7.5 0 0 1-10.8 6.7L4 20.5l1.4-4.9A7.5 7.5 0 1 1 20 12.5Z" />
        </svg>
      )}
    </span>
  );
}

function LineBody({ line }: { line: Line }) {
  return (
    <>
      <LineIcon kind={line.icon} />
      <span className="set-line-text">
        <span className="set-line-name">{line.name}</span>
        <span className="set-line-how">{line.how}</span>
        <span className="set-line-desc">{line.desc}</span>
      </span>
    </>
  );
}

function Lines({ items }: { items: Line[] }) {
  const { open, failed } = useOpenLink();

  return (
    <div className="set-list">
      {items.map((line) =>
        line.tel != null ? (
          <a
            className="set-line"
            key={line.name}
            href={`tel:${line.tel}`}
            onClick={(event) => open(event, `tel:${line.tel}`)}
          >
            <LineBody line={line} />
          </a>
        ) : (
          <div className="set-line" key={line.name}>
            <LineBody line={line} />
          </div>
        ),
      )}
      {failed != null && (
        <p className="set-line-failed" {...testId(TEST_IDS.channelFailed)}>
          바로 연결하지 못했어요. <b>{readableAddress(failed)}</b>로 직접 걸어 주세요.
        </p>
      )}
    </div>
  );
}

export function HelpLinesScreen() {
  return (
    <div className="set-screen" {...testId(TEST_IDS.helpLines)}>
      <div className="set-pad">
        <h1 className="set-title">도움받을 곳</h1>
        <p className="set-sub">마음이 많이 힘들 때 바로 이야기할 수 있어요</p>

        <p className="set-group">24시간 바로 이야기할 수 있어요</p>
        <Lines items={FIRST} />

        <p className="set-group">상황에 따라 찾을 수 있어요</p>
        <Lines items={BY_ROLE} />

        <div className="set-urgent">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 4.5 2.8 19.5h18.4L12 4.5Z" />
            <path d="M12 10v4" />
            <path d="M12 17.2h.01" />
          </svg>
          <p className="set-urgent-text">지금 위험한 상황이라면 112 또는 119</p>
        </div>
      </div>
    </div>
  );
}
