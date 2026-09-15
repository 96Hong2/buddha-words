import { useLayoutEffect, type ChangeEvent, type RefObject } from 'react';

import { TEST_IDS, testId } from '../../shared/testIds';

const PLACEHOLDER = '오늘 있었던 일, 요즘 드는 생각, 무엇이든 좋아요';

export interface ConcernFieldProps {
  value: string;
  onChange: (text: string) => void;
  /** 홈이 쥐고 있는 참조. 진입 카드를 닫은 뒤 이 칸으로 초점을 옮긴다 */
  fieldRef: RefObject<HTMLTextAreaElement | null>;
  onFocusChange: (focused: boolean) => void;
}

/**
 * 고민 입력칸.
 *
 * 쓰는 만큼 자라고, 한계에 닿으면 칸 안에서 스크롤한다. 방금 친 줄이 늘 보여야 하기 때문이다.
 * 높이의 위아래 한계(132 · 236)는 concern.css 의 min-height · max-height 가 쥔다.
 * 여기서는 내용 높이만 넣고 브라우저가 그 사이로 잘라내게 둔다.
 */
export function ConcernField({ value, onChange, fieldRef, onFocusChange }: ConcernFieldProps) {
  useLayoutEffect(() => {
    const el = fieldRef.current;
    if (el == null) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [fieldRef, value]);

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    onChange(event.target.value);
  }

  return (
    <textarea
      {...testId(TEST_IDS.concernField)}
      ref={fieldRef}
      className="field"
      value={value}
      onChange={handleChange}
      onFocus={() => onFocusChange(true)}
      onBlur={() => onFocusChange(false)}
      placeholder={PLACEHOLDER}
      aria-label={PLACEHOLDER}
    />
  );
}
