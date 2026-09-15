import type { MouseEvent } from 'react';

import { TEST_IDS, testId } from '../../shared/testIds';

/** 처음 온 사람이 무엇을 써도 되는지 한눈에 알게 하는 예시. 누르면 그대로 입력칸에 들어간다 */
const EXAMPLES = ['요즘 불안해요', '사람 때문에 화가 나요', '선택을 못 하겠어요'];

export interface ExampleChipsProps {
  onPick: (text: string) => void;
  /** 칩을 누르는 동안 입력칸의 초점을 놓지 않는다. 놓으면 제목이 펴지면서 칩이 밀린다 */
  onKeepFocus: (event: MouseEvent) => void;
}

export function ExampleChips({ onPick, onKeepFocus }: ExampleChipsProps) {
  return (
    <div className="chips">
      {EXAMPLES.map((example) => (
        <button
          key={example}
          {...testId(TEST_IDS.exampleChip)}
          type="button"
          className="chip"
          onMouseDown={onKeepFocus}
          onClick={() => onPick(example)}
        >
          {example}
        </button>
      ))}
    </div>
  );
}
