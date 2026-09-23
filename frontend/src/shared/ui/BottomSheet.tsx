import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { cx } from '../lib/cx';

import { trapTab } from './focusTrap';
import { useSheetDrag } from './sheetDrag';

import './sheet.css';
import { TEST_IDS, testId } from '../testIds';

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  /** 딤·Esc·손잡이로 닫을 수 있는지. 저장 중처럼 닫히면 안 될 때만 false. */
  dismissible?: boolean;
  /**
   * 시트 높이.
   *
   * - `auto`  내용만큼. 짧은 시트의 기본이다.
   * - `tall`  화면 위쪽까지 늘 같은 높이로 연다. **고칠 것이 많은 시트에 쓴다.**
   *
   * 내용만큼 여는 시트에서 칸이 여럿이면, 화면에 보이는 자리가 손바닥만 해서 아래 저장
   * 버튼이 접힌 아래로 밀린다. 그 버튼을 못 찾아 고치다 만 사람이 실제로 있었다.
   */
  size?: 'auto' | 'tall';
  /** 제목이 없을 때 스크린리더가 읽을 이름. */
  ariaLabel?: string;
  className?: string;
}

/**
 * 바텀시트.
 *
 * **닫기 X 를 두지 않는다.** 손잡이를 누르거나 아래로 밀면 닫힌다. 딤·Esc·시스템 뒤로가기도
 * 그대로다. 오른쪽 위 X 는 토스가 그리는 미니앱 닫기 버튼과 같은 자리·같은 모양이라,
 * 시트를 닫으려다 앱을 닫는 일이 실기기에서 실제로 있었다.
 *
 * 손잡이가 곧 닫기 버튼이다. 별도의 버튼을 두면 화면에 닫는 자리가 둘이 되고,
 * 키보드·스크린리더에는 손잡이가 잡히지 않아 닫을 길이 없어진다.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
  dismissible = true,
  size = 'auto',
  ariaLabel,
  className,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  // 아래로 밀어 닫기. 배선은 간직 시트와 한 곳에서 나눠 쓴다
  const { drag, handlers, handleClick } = useSheetDrag(sheetRef, onClose, dismissible);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    sheetRef.current?.focus();

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && dismissible) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !sheetRef.current) return;
      // 시트 밖으로 포커스가 새지 않게 앞뒤를 이어 붙인다. 규칙은 오버레이와 한 곳에 있다.
      trapTab(sheetRef.current, event);
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus();
    };
  }, [open, dismissible, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="pk-sheet-root">
      <div
        className="pk-sheet-dim"
        onClick={dismissible ? onClose : undefined}
        {...testId(TEST_IDS.sheetDim)}
      />
      <div
        ref={sheetRef}
        className={cx(
          'pk-sheet',
          size === 'tall' && 'pk-sheet--tall',
          drag.dragging && 'pk-sheet--dragging',
          className,
        )}
        style={drag.offset > 0 ? { transform: `translateY(${drag.offset}px)` } : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={title ? undefined : ariaLabel}
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        {...handlers}
      >
        {dismissible ? (
          /*
              손잡이가 곧 닫기다. 누르면 닫히고 아래로 밀어도 닫힌다.
              `touch-action: none` 이 없으면 브라우저가 세로 손짓을 스크롤로 먼저 가져간다.
            */
          <button
            type="button"
            data-sheet-handle=""
            className="pk-sheet__handle pk-sheet__handle--hit"
            aria-label="닫기"
            {...testId(TEST_IDS.sheetClose)}
            onClick={handleClick}
          >
            <span className="pk-sheet__grip" aria-hidden="true" />
          </button>
        ) : (
          <div className="pk-sheet__handle">
            <span className="pk-sheet__grip" aria-hidden="true" />
          </div>
        )}
        {title ? (
          <div className="pk-sheet__header">
            <div className="pk-sheet__title" id={titleId}>
              {title}
            </div>
          </div>
        ) : null}
        <div className="pk-sheet__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
