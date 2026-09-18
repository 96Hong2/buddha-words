import { TEST_IDS, testId } from '../../shared/testIds';

/**
 * 홈 입력 묶음에 붙는 조각들.
 *
 * 오늘의 한마디·회고는 daily 도메인이 정본이라 여기 두지 않는다.
 *
 * 예전에 여기 있던 「방금 물어본 이야기의 답이 준비됐어요」 복귀 카드는 없앴다.
 * 답을 **이미 다 보고** 뒤로 온 사람에게도 똑같이 떠서, 본 것을 보러 가라고 매번 권했다.
 * 답으로 돌아가는 길은 보관함의 「오늘 나눈 이야기」가 이미 준다.
 */

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

export interface DraftConfirmProps {
  open: boolean;
  onAnswer: (choice: 'clear' | 'keep') => void;
}

/**
 * 답을 받고 돌아왔는데 쓰던 글이 그대로 남아 있을 때 한 번 묻는다.
 *
 * 그 글은 **방금 보낸 글**이다. 새 이야기를 쓰려고 온 사람 앞에 지난 이야기가 놓여 있으면,
 * 지우고 쓰든 이어 쓰든 먼저 그것부터 치워야 한다. 조용히 지우면 이어 쓰려던 사람이 글을
 * 잃고, 조용히 두면 새로 쓰려던 사람이 매번 손으로 지운다. 그래서 한 번 묻는다.
 *
 * ── 왜 시트가 아닌가 ────────────────────────────────────────────────────
 *
 * 처음에는 덮개가 있는 바텀시트로 만들었다. 그랬더니 **홈에 들어서는 순간 화면을 덮고**,
 * 답하기 전에는 보관함 탭도 설정 탭도 눌리지 않았다. 이 저장소의 절대 규칙 7번이
 * 「진입 즉시 바텀시트 없음」인데 그 선을 정면으로 넘는다. 물어보라는 요구는 답을 강요하라는
 * 뜻이 아니다. 그래서 입력칸 바로 위에 카드로 세운다. 지나가는 사람은 그냥 지나간다.
 *
 * 기본은 남기는 쪽이다. 아무것도 누르지 않으면 글은 그대로 있다. 지우는 것은 되돌릴 수 없다.
 */
export function DraftConfirm({ open, onAnswer }: DraftConfirmProps) {
  if (!open) return null;

  return (
    <div className="draft-ask" role="group" aria-label="쓰시던 이야기" {...testId(TEST_IDS.draftConfirm)}>
      <p className="draft-ask__title">쓰시던 이야기가 남아 있어요</p>
      <div className="draft-ask__buttons">
        <button
          type="button"
          className="draft-ask__btn"
          onClick={() => onAnswer('clear')}
          {...testId(TEST_IDS.draftConfirmClear)}
        >
          지우고 새로 쓰기
        </button>
        <button
          type="button"
          className="draft-ask__btn draft-ask__btn--keep"
          onClick={() => onAnswer('keep')}
          {...testId(TEST_IDS.draftConfirmKeep)}
        >
          이어서 쓰기
        </button>
      </div>
    </div>
  );
}
