import { useEffect, useState } from 'react';

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

export interface DraftClearProps {
  /** 지금 쓰여 있는 글자 수. 0 이면 그리지 않는다 */
  chars: number;
  /** 지우기를 눌러 확인이 열렸다. 로그를 찍는 쪽이 받는다 */
  onOpen: () => void;
  /** 답했다. `clear` 면 부르는 쪽이 글을 비운다 */
  onAnswer: (choice: 'clear' | 'cancel') => void;
}

/**
 * 쓰던 글을 통째로 지우는 자리.
 *
 * ── 왜 이렇게 작은가 ──────────────────────────────────────────────────
 *
 * 이 버튼이 하는 일은 되돌릴 수 없다. 그런데 손가락은 전송 버튼 근처를 오간다. 크고
 * 또렷하게 만들면 「이야기 보내기」를 누르려던 사람이 쓴 글을 날린다. 그래서 세 겹으로 막는다.
 *
 *   1. 작고 조용하게. 색은 본문보다 옅고 굵기도 주지 않는다
 *   2. 전송 버튼과 **반대쪽 끝**(입력칸 오른쪽 위)에 둔다
 *   3. 눌러도 바로 지우지 않는다. 그 자리에서 한 번 더 묻는다
 *
 * 그렇다고 숨기지는 않는다. 「지우고 새로 쓰기」는 답을 받고 돌아온 자리에서만 물어봐서,
 * 그 순간을 놓치면 쓴 글을 손으로 지우는 수밖에 없었다. 여기는 **언제나** 있다.
 *
 * 묻는 카드는 덮개를 쓰지 않는다. 진입 즉시 바텀시트를 세우지 않는 것이 이 저장소의
 * 절대 규칙이고, 답을 강요하지 않는 것도 같은 뜻이다.
 */
export function DraftClear({ chars, onOpen, onAnswer }: DraftClearProps) {
  const [asking, setAsking] = useState(false);

  /**
   * 누르는 동안 입력칸의 초점을 붙잡는다.
   *
   * 초점이 빠지면 제목이 한 줄에서 두 줄로 펴지고 아래가 통째로 밀린다. 그러면 누르던
   * 버튼이 손가락 밑에서 비켜나 **눌리지 않는다.** 마우스를 내린 자리와 뗀 자리가 달라
   * click 이 아예 생기지 않는 것이라, 사람 눈에는 「눌렀는데 아무 일도 없다」로 보인다.
   * 전송 버튼과 예시 칩이 같은 이유로 같은 처리를 하고 있다.
   */
  const keepFocus = (event: { preventDefault: () => void }) => {
    event.preventDefault();
  };

  // 글이 사라지면 물어보던 것도 함께 닫는다. 빈 칸 앞에 「지울까요」가 남아 있으면 안 되고,
  // 다시 쓰기 시작했을 때 되살아나도 안 된다
  useEffect(() => {
    if (chars === 0) setAsking(false);
  }, [chars]);

  if (chars === 0) return null;

  if (!asking) {
    return (
      <div className="draft-clear">
        <button
          type="button"
          className="draft-clear__btn"
          onMouseDown={keepFocus}
          onClick={() => {
            setAsking(true);
            onOpen();
          }}
          {...testId(TEST_IDS.draftClear)}
        >
          전체 지우기
        </button>
      </div>
    );
  }

  return (
    <div className="draft-clear-ask" role="group" aria-label="쓰신 글 지우기">
      <p className="draft-clear-ask__title">쓰신 글을 모두 지울까요?</p>
      <p className="draft-clear-ask__desc">한 번 지우면 되돌릴 수 없어요</p>
      <div className="draft-clear-ask__buttons">
        {/* 되돌릴 수 없는 쪽을 뒤에 둔다. 읽는 순서에서도 「그대로 두기」가 먼저다 */}
        <button
          type="button"
          className="draft-clear-ask__btn draft-clear-ask__btn--keep"
          onMouseDown={keepFocus}
          onClick={() => {
            setAsking(false);
            onAnswer('cancel');
          }}
          {...testId(TEST_IDS.draftClearCancel)}
        >
          그대로 두기
        </button>
        <button
          type="button"
          className="draft-clear-ask__btn draft-clear-ask__btn--clear"
          onMouseDown={keepFocus}
          onClick={() => {
            setAsking(false);
            onAnswer('clear');
          }}
          {...testId(TEST_IDS.draftClearConfirm)}
        >
          지우기
        </button>
      </div>
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
      {/*
        되돌릴 수 없는 쪽을 뒤에 둔다. 읽는 순서·포커스 순서에서 지우기가 먼저 오면
        스크린리더 사용자는 삭제를 먼저 듣는다.
      */}
      <div className="draft-ask__buttons">
        <button
          type="button"
          className="draft-ask__btn draft-ask__btn--keep"
          onClick={() => onAnswer('keep')}
          {...testId(TEST_IDS.draftConfirmKeep)}
        >
          이어서 쓰기
        </button>
        <button
          type="button"
          className="draft-ask__btn"
          onClick={() => onAnswer('clear')}
          {...testId(TEST_IDS.draftConfirmClear)}
        >
          지우고 새로 쓰기
        </button>
      </div>
    </div>
  );
}
