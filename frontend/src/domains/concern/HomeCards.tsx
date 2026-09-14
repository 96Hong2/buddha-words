import { TEST_IDS, testId } from '../../shared/testIds';

/**
 * 홈 위쪽에 붙는 두 조각.
 *
 * 오늘의 한마디·회고 카드는 daily 도메인이 정본이라 여기 두지 않는다.
 */

/** 답이 준비됐다는 복귀 카드. 위에 하나뿐이다 */
export function ReturnCard({ onOpen }: { onOpen: () => void }) {
  return (
    <div {...testId(TEST_IDS.returnCard)} className="recall">
      <p>
        방금 물어본 이야기의
        <br />
        답이 준비됐어요
      </p>
      <button type="button" onClick={onOpen}>
        답 보러 가기
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m9.5 6 6 6-6 6" />
        </svg>
      </button>
    </div>
  );
}

/** 앱을 다시 열었을 때 쓰던 글이 남아 있다는 사실을 알린다 */
export function DraftNotice({ onClear }: { onClear: () => void }) {
  return (
    <div {...testId(TEST_IDS.draftCard)} className="draft">
      이어서 쓸 수 있게 남겨 뒀어요
      <button type="button" onClick={onClear}>
        지우기
      </button>
    </div>
  );
}
