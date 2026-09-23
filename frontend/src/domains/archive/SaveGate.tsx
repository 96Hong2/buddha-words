/**
 * 간직하기 앞에 서는 짧은 확인.
 *
 * 예전에는 셋까지 공짜로 담기고 넷째부터 이용권을 물었다. 지금은 개수 제한이 없고 대신
 * 광고 하나를 본다. 몇 개를 담았든 같은 값이라 「자리가 없다」는 말을 할 일이 없어졌다.
 *
 * **버튼을 누르자마자 광고를 띄우지 않는다.** 전면 광고는 화면을 통째로 덮어서, 예고 없이
 * 뜨면 사람은 자기가 무엇을 눌렀는지부터 잃는다. 한 장 물어보고 시작한다.
 *
 * 문구는 이어가기 시트와 같은 말투로 맞춘다: **몇 초짜리인지와 무엇을 얻는지를 버튼 한 줄에
 * 함께 적는다.** 앱 안에서 광고를 청하는 자리가 둘인데 말투가 다르면 같은 앱으로 안 읽힌다.
 *
 * 광고를 못 띄우는 기기·광고 그룹 id 가 없는 번들에서는 이 시트가 아예 열리지 않는다.
 * 부르는 쪽이 그때는 곧바로 간직한다. 광고 때문에 간직이 막히면 안 된다.
 *
 * 연꽃이 있으면 그 버튼이 주 버튼이고 광고가 아래로 내려간다. 이어가기 시트와 같은
 * 부품·같은 순서를 쓴다. 두 자리가 다르게 생기면 같은 앱으로 안 읽힌다.
 *
 * **나가는 버튼을 따로 두지 않는다.** 손잡이를 누르거나 바깥을 누르거나 뒤로가면 닫힌다.
 * 이어가기 시트가 이미 그렇게 생겼고, 공용 바텀시트도 같은 규칙이다.
 */

import { useEffect, useRef } from 'react';

import { useOverlayBackClose } from '../../app/providers';
import { useAnalytics } from '../../shared/analytics';
import { isArchivePassEnabled } from '../../shared/session/session';
import { TEST_IDS, testId } from '../../shared/testIds';
import { LeafAltAdButton, LeafCollectCta, LeafUseButton, Spinner } from '../../shared/ui';

import './archive.css';

export interface SaveGateProps {
  open: boolean;
  /** 답변 아이디. 로그에 싣는다 */
  answerId: string;
  onClose: () => void;
  /** 「보고 간직하기」를 눌렀다. 광고를 띄우고 간직하는 일은 부르는 쪽이 한다 */
  onWatch: () => void;
  /** 광고가 도는 중. 버튼을 두 번 누르지 못하게 한다 */
  pending?: boolean;
  /**
   * 보상을 받기 전에 광고를 닫았다. **그러면 시트를 닫지 않고 왜 안 담겼는지 말한다.**
   *
   * 한때 조용히 닫았다. 스스로 닫은 것을 실패라고 말할 일은 아니지만, 아무 말도 없으면
   * 담긴 줄 알고 보관함에 갔다가 없는 것을 발견한다. 이어가기 시트가 같은 자리에서
   * 같은 방식으로 말한다(`ContinueSheet` 의 bailed).
   */
  bailed?: boolean;
  /**
   * 「광고 없이 간직하기」를 눌렀다. 이용권 시트를 여는 일은 부르는 쪽이 한다.
   *
   * 이 자리에 두는 이유: 광고를 보기 싫은 사람이 지금 정확히 여기 서 있다. 개수 제한이
   * 없어지면서 이용권을 파는 자리가 사라졌는데, 팔 곳을 다시 찾느라 보관함에 배너를
   * 세우면 다시 읽으러 온 사람에게 파는 말을 먼저 건네게 된다.
   */
  onBuyPass?: () => void;
  /** 지금 가진 연꽃. 한 송이 이상이면 광고 대신 이것을 먼저 권한다 */
  leaves?: number;
  /**
   * 연꽃으로 간직한다. **연꽃을 빼는 일은 부르는 쪽이 한다.**
   * 못 뺐으면 간직하지 않고 그대로 둔다.
   */
  onUseLeaf?: () => void;
  /**
   * 연꽃을 모으러 간다. 이 시트를 닫고 모으기 시트를 여는 일은 부르는 쪽이 한다.
   * 이어가기 시트와 같은 부품·같은 자리다. 두 자리가 다르면 같은 앱으로 안 읽힌다.
   */
  onCollectLeaf?: () => void;
}

export function SaveGate({
  open,
  answerId,
  onClose,
  onWatch,
  pending = false,
  bailed = false,
  onBuyPass,
  leaves = 0,
  onUseLeaf,
  onCollectLeaf,
}: SaveGateProps) {
  const analytics = useAnalytics();
  const sheetRef = useRef<HTMLDivElement>(null);

  /** 연꽃으로 지나갈 수 있나. 부르는 쪽이 길을 안 줬으면 없는 것으로 본다 */
  const hasLeaf = leaves > 0 && onUseLeaf != null;

  useOverlayBackClose(open, onClose);

  useEffect(() => {
    if (!open) return;
    analytics.log('save_gate_view', { answer_id: answerId }, { kind: 'impression' });
  }, [analytics, answerId, open]);

  useEffect(() => {
    if (!open) return;

    sheetRef.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="pw-root">
      <div className="pw-dim" onClick={onClose} {...testId(TEST_IDS.sheetDim)} />
      <div
        ref={sheetRef}
        className="pw-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-gate-title"
        tabIndex={-1}
        {...testId(TEST_IDS.saveGate)}
      >
        {/*
          ⚠ **손잡이가 곧 닫기다.** 아래에 「다음에」 버튼이 따로 서 있었는데, 나가는 길이
          이미 셋(손잡이·바깥·뒤로가기)인 자리에 넷째를 세운 것이라 눌러야 할 버튼 하나가
          둘 중 하나로 보였다. 그 버튼이 차지하던 높이가 그대로 간직 버튼과 모으기 카드
          사이의 빈칸이기도 했다(2026-09-23 사용자 지적). 공용 바텀시트가 쓰는 규칙과
          같은 규칙이다(`BottomSheet` 머리말).
        */}
        <button
          type="button"
          className="pw-grabber"
          aria-label="닫기"
          onClick={onClose}
          {...testId(TEST_IDS.sheetClose)}
        >
          <span className="pw-grabber__grip" aria-hidden="true" />
        </button>

        {/* 「30초 광고」는 버튼 한 곳에서만 말한다. 제목까지 같은 말을 하면 광고 안내가 두 겹이다 */}
        <h2 className="pw-title" id="save-gate-title">
          보관함에 간직할까요?
        </h2>
        {/*
          연꽃이 있으면 「개수 제한이 없다」는 줄을 뺀다. 세 문장이 되면 읽기 전에 눈이
          먼저 지친다. 둘 중 지금 고르는 데 쓰이는 것은 연꽃 쪽이다.
        */}
        <p className="pw-sub">
          {hasLeaf
            ? '담아 두면 앱을 닫아도 남아요. 모아 둔 연꽃으로 바로 담을 수 있어요.'
            : '담아 두면 앱을 닫아도 남아요. 몇 개를 담든 개수 제한은 없어요.'}
        </p>

        <div className="pw-actions">
          {/* 연꽃이 있으면 이쪽이 주 버튼이다. 없으면 아래 광고 버튼이 그대로 주 버튼이다 */}
          {hasLeaf && onUseLeaf != null && (
            <LeafUseButton
              count={leaves}
              action="간직하기"
              disabled={pending}
              onClick={onUseLeaf}
              testKey="leafSpendSave"
            />
          )}

          {/*
            이어가기 시트와 같은 말투다. **초를 적는다.** 얼마나 참아야 하는지 모르는 채로
            전면 광고를 만나면 사람은 중간에 닫고, 그러면 간직도 안 된 채로 끝난다.
          */}
          {hasLeaf ? (
            /*
              라벨을 고정한다. 한때 pending 일 때 「광고를 여는 중이에요」로 바꿨는데,
              이 부품이 라벨 뒤에 「광고」 배지를 늘 붙여서 「광고를 여는 중이에요 [광고]」가
              됐다. 진행 상태는 아래 안내 줄이 맡는다. 이어가기 시트와 같은 방식이다.
            */
            <LeafAltAdButton
              lead="30초"
              label="보고 간직하기"
              disabled={pending}
              busy={pending}
              /* 여기서 도는 것은 광고다. 이야기를 살펴보는 자리는 이어가기 시트다 */
              busyLabel="준비하고 있어요"
              onClick={onWatch}
              testKey="saveGateWatch"
            />
          ) : (
            <button
              type="button"
              className="arch-btn arch-btn--primary arch-btn--lg"
              disabled={pending}
              onClick={onWatch}
              {...testId(TEST_IDS.saveGateWatch)}
            >
              {pending ? (
                <>
                  {/* 흐려지기만 하면 멈춘 것으로 읽힌다. 도는 표를 함께 둔다 */}
                  <Spinner className="arch-btn__spin" />
                  준비하고 있어요
                </>
              ) : (
                <>
                  {/* 다른 두 자리와 같은 모양이다. 「광고」는 글자이자 배지다 */}
                  30초{' '}
                  <span className="arch-ad-tag" {...testId(TEST_IDS.adBadge)}>
                    광고
                  </span>{' '}
                  보고 간직하기
                </>
              )}
            </button>
          )}
        </div>

        {/*
          한 줄 안내. **지금 무슨 일이 도는 중인지**만 맡고 평소에는 비운다.

          어디서 얻는지는 아래 모으기 카드가 말한다. 한때 이 줄이 늘 서서 버튼이 이미
          한 말을 되풀이했고, 그 탓에 한 화면에서 「광고」를 두 번 읽게 됐다
          (2026-09-23 사용자 지적). 이어가기 시트와 같은 방식으로 맞춘다.
        */}
        {/* 리전은 늘 서 있는다. 이유는 ContinueSheet 의 같은 자리 주석 */}
        <p className="pw-leaf-note" role="status">
          {pending
            ? '불러오고 있어요'
            : bailed
              ? // 무엇이 모자랐는지만 말한다. 「끝까지」는 사람마다 다르게 읽힌다
                '보상을 받기 전에 닫아서 담기지 않았어요'
              : ''}
        </p>

        {/*
          연꽃을 모으러 가는 자리. 이어가기 시트와 같은 부품이다. 한때 「홈 위쪽 연꽃을
          미리 모아 두면」이라고 글로만 적었는데, 읽어도 지금 할 수 있는 일이 아니었다.
        */}
        {onCollectLeaf != null && (
          <LeafCollectCta
            count={leaves}
            action="담아요"
            disabled={pending}
            onClick={onCollectLeaf}
          />
        )}

        {/* 파는 말은 작게 아래에 둔다. 광고를 보는 쪽이 이 화면의 기본 길이다 */}
        {isArchivePassEnabled() && onBuyPass != null && (
          <button
            type="button"
            className="pw-quiet"
            onClick={onBuyPass}
            {...testId(TEST_IDS.saveGateBuy)}
          >
            이용권으로 기다리지 않고 간직하기
          </button>
        )}
      </div>
    </div>
  );
}
