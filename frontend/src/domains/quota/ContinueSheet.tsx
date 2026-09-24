/**
 * 같은 날 두 번째 고민부터 전송을 누르면 먼저 열리는 시트.
 *
 * 출구는 하나다: 답변 받기. 나가는 길은 손잡이·바깥·뒤로가기다.
 * 「오늘 답변 다시 보기」와 「닫기」 버튼은 없앴다. 바깥을 누르면 닫히는 시트에 닫기 버튼을
 * 또 두면, 정작 눌러야 할 하나가 셋 중 하나로 보인다.
 *
 * 광고를 못 띄우는 기기에서는 이 시트를 열지 않고 그냥 이어간다. 부르는 쪽이
 * `useRewardedAd('continue').supported` 를 먼저 보고, 잊었더라도 여기서 한 번 더 막는다.
 *
 * ── 광고를 끝까지 봐야 이어간다 ─────────────────────────────────────
 *
 * 이 자리는 **보상형**이고 **`userEarnedReward` 가 왔을 때만** 답으로 넘어간다.
 * 공식 문서가 보상형의 대표 쓰임으로 「이어하기」를 들고, SDK 가이드가 `dismissed` 만으로는
 * 지급하지 말라고 못 박는다. 정책이 막는 「광고 소비를 보상과 직접 연결」은 **누르면 즉시
 * 보상** 같은 부당한 연결이지 이 구조가 아니다.
 *
 * 중간에 닫으면 답을 주지 않고 시트에 남는다. 한때 5초만 보면 답을 주었는데 그것이
 * `dismissed` 지급이라 규칙에 어긋났다. 전면형으로 바꿔 답을 떼어 놓은 판도 있었지만,
 * 광고를 볼 이유가 함께 사라지고 단가도 낮아 되돌렸다.
 *
 * `noFill` 은 **우리 쪽 사정**이라 막지 않고 그냥 이어간다. 광고를 못 받는 기기에서
 * 기능이 통째로 막히면 막다른 구조가 된다.
 *
 * **2026-09-24 부터 기본이 전면형이다.** 전면형에는 보상 이벤트가 없어 `dismissed` 로
 * 끝나므로 닫아도 이어간다. 보상형으로 되돌리려면 `VITE_AD_GATE_KIND=rewarded` 를 준다.
 * 통과 조건이 종류마다 다른 것은 `useRewardedAd` 의 `pass` 가 안다.
 *
 * ── 연꽃이 있으면 광고를 안 본다 ─────────────────────────────────────
 *
 * 연꽃 한 송이는 **미리 치러 둔 광고 한 편**이다. 가진 사람에게는 그 버튼이 주 버튼이고
 * 광고가 아래 보조로 내려간다. 순서를 뒤집으면 이미 값을 낸 사람 앞에 광고를 또 세우는
 * 화면이 되고, 그러면 연꽃을 미리 모을 이유가 그 자리에서 사라진다.
 *
 * 연꽃을 실제로 빼는 일은 **부르는 쪽(app 층)이 한다.** 여기서 빼면 시트가 닫히는 길과
 * 이어가는 길이 갈릴 때 빠진 연꽃이 어디에도 안 쓰인 채 사라진다.
 *
 * ── 여기서 바로 모으러 갈 수 있다 ─────────────────────────────────────
 *
 * 한때 「시트 위에 시트를 쌓지 않는다」를 지키려고 어디서 모으는지 한 줄만 적어 두었다.
 * 그 줄은 **읽어도 지금 할 수 있는 일이 아니었다.** 홈으로 돌아가 작은 칩을 찾아야 했고,
 * 쓰던 이야기를 놓칠까 봐 아무도 안 갔다. 이제 여기서 누르면 이 시트가 닫히고 모으기
 * 시트가 열리며, 닫으면 이 시트로 되돌아온다. **쌓지 않고 바꿔 끼운다.**
 * 오가는 일은 부르는 쪽(app 층)이 한다. 붙들어 둔 글이 거기 있기 때문이다.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useOverlayBackClose } from '../../app/providers';
import { useAnalytics } from '../../shared/analytics';
import { TEST_IDS, testId } from '../../shared/testIds';
import {
  BottomSheet,
  LeafAltAdButton,
  LeafCollectCta,
  LeafUseButton,
  Spinner,
} from '../../shared/ui';
import { adIsRewarded, adLead } from '../ads/placement';
import { useRewardedAd } from '../ads/useRewardedAd';

import './quota.css';

const TITLE = '이야기를 이어가 볼까요?';

/**
 * 버튼에 뭐라고 적나. **종류마다 다르다.**
 *
 * 보상형은 끝까지 봐야 답이 나오므로 얼마나 참아야 하는지 적는다(실기기 실측 30초).
 * 전면형은 닫아도 답이 나오고 길이도 문서에 없어 초를 적지 않는다. 근거 없는 수치를
 * 화면이 말하게 두지 않는다.
 *
 * ⚠ **「광고」라는 글자는 배지 하나로 끝낸다.** 라벨에 또 적으면 버튼 한 줄에 같은 말이
 * 두 번 선다. 한 화면에서 이 단어를 몇 번이나 읽게 되는지가 이 앱의 인상을 정한다
 * (2026-09-23 사용자 지적). 규칙이 요구하는 「무엇이 뜨는지 밝히기」는 배지로 충분하다.
 *
 * **배지는 문장 안에 선다**(「30초 [광고] 보고 답변 받기」). 끝에 붙이면 「30초 보고」의
 * 목적어가 문장 끝에 가서야 나오고, 낭독기는 그 순서 그대로 읽는다. 다른 세 자리
 * (간직·모으기·관점)가 이미 이 모양이다.
 */
const AD_IS_REWARDED = adIsRewarded('continue');

/**
 * 연꽃이 있을 때 **아래로 내려가는** 광고 버튼에 적는 말.
 *
 * 「광고」라는 글자는 여기서도 배지 하나가 맡는다. 라벨에 또 적으면 한 줄에 같은 말이
 * 두 번 선다. **배지가 들어설 자리를 앞뒤로 갈라 넘긴다.** 주 버튼과 같은 모양이라야
 * 연꽃을 가진 사람과 안 가진 사람이 같은 문장을 읽는다.
 */
const AD_ALT_LEAD = adLead('continue');
const AD_ALT_LABEL = '보고 답변 받기';

export interface ContinueSheetProps {
  open: boolean;
  /** 오늘 이미 이어간 횟수. 로그에만 쓴다 */
  continuesUsed: number;
  /**
   * 지금 붙들고 있는 이야기의 번호. **노출 로그를 한 번만 찍으려고 받는다.**
   *
   * 연꽃을 모으러 갔다 오면 이 시트가 실제로 닫혔다 다시 열린다. 열림만 보고 세면
   * 같은 이야기 하나에 노출이 둘로 찍히고, 그 값이 광고 퍼널의 분모라 **연꽃을 모은
   * 사람일수록 전환율이 낮게 집계된다.** 새 이야기일 때만 부르는 쪽이 이 값을 올린다.
   */
  storySeq?: number;
  /**
   * 이 이야기를 서버가 아직 보고 있나. **그동안 버튼을 잠근다.**
   *
   * 서버는 위기를 사용량보다 먼저 본다. 잠그지 않으면 분류기만 잡는 위기 글을 쓴
   * 사람이 30초 광고를 끝까지 보고 나서야 창구를 만난다. 계획 1.6 이 「절대 광고를
   * 두지 않는 곳」으로 위기 화면을 적어 둔 자리다.
   */
  checking?: boolean;
  onClose: () => void;
  /** 답을 만들기 시작한다. 광고는 아직 떠 있을 수 있다 */
  onContinue: () => void;
  /** 지금 가진 연꽃. 한 송이 이상이면 광고 대신 이것을 먼저 권한다 */
  leaves?: number;
  /**
   * 연꽃으로 이어간다. **연꽃을 빼는 일은 부르는 쪽이 한다.**
   * 못 뺐으면(그 사이에 잔액이 0 이 됐다) 이어가지 않고 그대로 둔다.
   */
  onUseLeaf?: () => void;
  /**
   * 연꽃을 모으러 간다. 이 시트를 닫고 모으기 시트를 여는 일은 부르는 쪽이 한다.
   * 안 주면 모으러 가는 자리를 그리지 않는다(모을 길이 없는 판).
   */
  onCollectLeaf?: () => void;
}

export function ContinueSheet({
  open,
  continuesUsed,
  storySeq = 0,
  checking = false,
  onClose,
  onContinue,
  leaves = 0,
  onUseLeaf,
  onCollectLeaf,
}: ContinueSheetProps) {
  const analytics = useAnalytics();
  const ad = useRewardedAd('continue');
  /** 노출을 이미 센 이야기 번호. -1 은 아직 아무것도 안 셌다는 뜻이다 */
  const logged = useRef(-1);

  useOverlayBackClose(open, onClose);

  useEffect(() => {
    if (!open || logged.current === storySeq) return;
    logged.current = storySeq;
    analytics.log('second_question_start', {
      continues_used: continuesUsed,
      gate: 'ad_continue',
    });
  }, [analytics, continuesUsed, open, storySeq]);

  // 광고를 띄울 수 없는 기기라면 시트가 길을 막고 서 있는 셈이다. 조용히 비켜 준다.
  useEffect(() => {
    // 확인이 끝나기 전에 지나가면 답이 이미 만들어지는 중인데 같은 키로 또 보낸다
    if (!open || checking || !ad.ready || ad.supported) return;
    onClose();
    onContinue();
  }, [ad.ready, ad.supported, checking, onClose, onContinue, open]);

  /** 중간에 닫았다. 답을 주지 않으므로 왜 안 넘어가는지 그 자리에 적는다 */
  const [bailed, setBailed] = useState(false);

  /** 연꽃으로 지나갈 수 있나. 부르는 쪽이 길을 안 줬으면 없는 것으로 본다 */
  const hasLeaf = leaves > 0 && onUseLeaf != null;

  const watch = useCallback(async (): Promise<void> => {
    setBailed(false);
    const outcome = await ad.pass();

    // 광고가 안 온 것은 우리 쪽 사정이다. 막지 않고 그냥 보낸다
    if (outcome === 'noFill') {
      analytics.log('ad_skipped', { placement: 'continue', reason: 'no_fill' });
      onContinue();
      return;
    }

    /*
      통과 조건은 종류마다 다르고 그 판정은 `pass` 가 한다. 보상형은 끝까지 본 사람만,
      전면형은 닫아도 통과다. 여기서 종류를 다시 보면 한쪽을 빠뜨렸을 때 아무도 못 지나간다.
    */
    if (outcome === 'passed') {
      onContinue();
      return;
    }

    setBailed(true);
  }, [ad, analytics, onContinue]);

  return (
    <BottomSheet open={open} onClose={onClose} ariaLabel={TITLE} className="continue-sheet">
      <div {...testId(TEST_IDS.continueSheet)}>
        <h2 className="continue-sheet__title">{TITLE}</h2>
        {/*
          횟수를 적지 않는다. 하루 천장을 없앴으므로 「오늘 N번 더」는 거짓이 됐다.
          그 문구는 광고를 보고도 막히는 줄 알게 만들었다(2026-09-20 사용자 지적).
        */}
        <p className="continue-sheet__sub">
          {/*
            ⚠ 이 시트에서는 「광고 없이」·「무료」를 쓰지 않는다. 계획 X25 가 막는
            「베푼 것을 세는 문장」과 한 글자도 안 겹치게 `flows.spec.ts` 가 지키는 자리다.
            연꽃을 가진 사람이 보는 줄도 예외가 아니다(2026-09-22, 모으러 가는 길이
            생기면서 이 분기가 두 번 탭이면 닿는 주 경로가 됐다).
          */}
          {hasLeaf
            ? '모아 둔 연꽃으로 바로 이어갈 수 있어요'
            : '짧은 영상이 끝나면 바로 이어 드릴게요'}
        </p>

        <div className="continue-sheet__actions">
          {/*
            연꽃이 있으면 이쪽이 주 버튼이다. 광고는 아래 보조로 내려간다.
            없으면 이 자리에 아무것도 그리지 않고 광고 버튼이 그대로 주 버튼으로 남는다.
          */}
          {hasLeaf && onUseLeaf != null && (
            <LeafUseButton
              count={leaves}
              action="답변 받기"
              disabled={ad.showing || checking}
              onClick={onUseLeaf}
              testKey="leafSpendContinue"
            />
          )}

          {hasLeaf ? (
            <LeafAltAdButton
              lead={AD_ALT_LEAD}
              label={AD_ALT_LABEL}
              disabled={ad.showing || checking}
              busy={checking}
              busyLabel="이야기를 살펴보고 있어요"

              onClick={() => {
                void watch();
              }}
              testKey="continueWatch"
            />
          ) : (
            <button
              type="button"
              className="continue-sheet__ad"
              disabled={ad.showing || checking}
              onClick={() => {
                void watch();
              }}
              {...testId(TEST_IDS.continueWatch)}
            >
              {/*
                ── 잠겨 있는 동안 버튼이 스스로 말한다 ───────────────────────────

                보낸 이야기를 서버가 보는 1~3초 동안 이 버튼이 잠긴다. 예전에는 흐려지기만
                해서 **앱이 멈춘 것처럼 보였다**(2026-09-22 사용자 지적). 도는 표와 함께
                지금 무엇을 하는 중인지 버튼 안에 적는다.

                이때 「광고」 배지를 떼는 것은 안전하다. 잠긴 버튼은 눌리지 않아서 광고가
                뜰 수 없고, 풀리는 순간 라벨이 곧바로 「30초 보고 답변 받기」로 돌아온다.
                누르는 순간 무엇이 뜨는지 라벨이 말해야 한다는 규칙은 그대로 지켜진다.
              */}
              {checking ? (
                <Spinner className="continue-sheet__spin" />
              ) : (
                <span className="continue-sheet__play" aria-hidden="true">
                  <svg
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  >
                    <rect x="3.2" y="5.2" width="17.6" height="13.6" rx="3" />
                    <path d="M10.6 9.6l4.6 2.6-4.6 2.6z" fill="currentColor" stroke="none" />
                  </svg>
                </span>
              )}
              {/*
                「광고」라는 글자가 버튼 안에 있어야 한다. 누르는 순간 무엇이 뜨는지
                밝히지 않으면 앱인토스 심사 규칙에 닿는다. 그 말은 **배지 하나가** 맡고,
                배지는 문장 안에 선다(「30초 [광고] 보고 답변 받기」).

                보상형에만 초를 적는다. 전면형은 길이가 문서에 없고 닫아도 답이 나온다.

                ⚠ **잠긴 동안에는 배지를 떼어 둔다.** 「이야기를 살펴보고 있어요 [광고]」는
                지금 광고가 도는 중이라는 말로 읽힌다(2026-09-23 사용자 지적). 그때 도는
                것은 서버 쪽 확인이고 광고는 눌리지도 않았다. 위 주석이 말한 그대로다.
              */}
              <span className="continue-sheet__ad-label">
                {checking ? (
                  '이야기를 살펴보고 있어요'
                ) : AD_IS_REWARDED ? (
                  <>
                    30초{' '}
                    <span className="continue-sheet__badge" {...testId(TEST_IDS.adBadge)}>
                      광고
                    </span>{' '}
                    보고 답변 받기
                  </>
                ) : (
                  <>
                    <span className="continue-sheet__badge" {...testId(TEST_IDS.adBadge)}>
                      광고
                    </span>{' '}
                    보고 답변 받기
                  </>
                )}
              </span>
            </button>
          )}
        </div>

        {/*
          ⚠ `role` 을 조건으로 붙이지 않는다. 라이브 리전은 **내용이 바뀌기 전에** 이미
          접근성 트리에 있어야 읽힌다. 역할과 글이 같은 순간에 생기면 안 읽는 기기가 있다.
        */}
        <p className="continue-sheet__note" role="status">
          {/*
            이 줄은 **지금 무슨 일이 일어나는 중인지**만 맡는다. 평소에는 비운다.

            한때 여기에 「광고를 끝까지 보면 바로 이어져요」 같은 안내가 늘 서 있었다.
            버튼이 이미 하는 말을 한 번 더 하는 줄이었고, 그 한 화면에서 「광고」를
            세 번 읽게 만들던 주범이다(2026-09-23 사용자 지적).

            ⚠ 이 시트에서는 「광고 없이」·「무료」를 쓰지 않는다. 계획 X25 가 막는
            「베푼 것을 세는 문장」과 한 글자도 안 겹치게 `flows.spec.ts` 가 지킨다.
          */}
          {checking
            ? '보내신 이야기를 살펴보는 중이에요. 곧 열려요'
            : ad.showing
              ? '불러오고 있어요'
              : bailed
                ? // 무엇이 모자랐는지만 말한다. 「끝까지」는 사람마다 다르게 읽힌다
                  '보상을 받기 전에 닫아서 이어지지 않았어요'
                : ''}
        </p>

        {/*
          연꽃을 모으러 가는 자리. 광고 버튼 **아래**다. 지금 답을 받으러 온 사람에게
          먼저 권할 일이 아니고, 「이번에는 광고를 보고 다음부터는 안 봐도 된다」는
          순서로 읽히는 것이 맞다.
        */}
        {onCollectLeaf != null && (
          <LeafCollectCta
            count={leaves}
            action="이어가요"
            disabled={ad.showing || checking}
            onClick={onCollectLeaf}
          />
        )}
      </div>
    </BottomSheet>
  );
}
