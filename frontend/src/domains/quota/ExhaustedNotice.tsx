/**
 * 하루 천장에 닿았을 때. 이어가기 4회를 다 쓴 자리다.
 *
 * 여기에 광고를 두지 않는다. 광고 자리는 답변 끝과 이어가기 둘뿐이고 이 자리는 그 둘이 아니다.
 * 대신 다시 열리는 시각과 오늘 할 수 있는 일을 준다. 막다른 화면으로 두지 않는다.
 *
 * 이용권은 간직 자리 제한을 푸는 것이지 오늘 횟수를 푸는 것이 아니다. 그렇게 읽히지 않게 적는다.
 * 산 뒤에 나눈 이야기가 저절로 쌓이지도 않는다. 간직하기를 누른 것만 남는다.
 * 보관함 화면·이용권 시트와 같은 말로 적는다.
 */

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router';

import { ROUTES } from '../../app/router';
import { useAnalytics } from '../../shared/analytics';
import { isArchivePassEnabled, useSession } from '../../shared/session/session';
import { TEST_IDS, testId } from '../../shared/testIds';

import { hoursUntilReset } from './quota';

import './quota.css';

/**
 * 누른 순간 입력칸에서 초점이 빠지면 홈 제목이 두 줄로 펴지면서 아래가 통째로 밀린다.
 * 누르던 버튼이 손가락 밑에서 비켜나 엉뚱한 곳이 눌린다. 그래서 초점을 붙잡아 둔다.
 * 키보드로 타고 온 초점은 그대로라 탭 이동에는 영향이 없다.
 */
function keepFocus(event: MouseEvent): void {
  event.preventDefault();
}

export interface ExhaustedNoticeProps {
  /** 오늘 이어간 횟수. 로그에만 쓴다 */
  continuesUsed: number;
  /** 오늘의 한마디를 여는 길. 오늘 구절이 아직 안 왔으면 주지 않는다 */
  onOpenDailyQuote?: () => void;
}

export function ExhaustedNotice({ continuesUsed, onOpenDailyQuote }: ExhaustedNoticeProps) {
  const analytics = useAnalytics();
  const navigate = useNavigate();
  const { response, archivePass } = useSession();
  const logged = useRef(false);
  // 화면에 뜬 순간을 기준으로 센다. 다시 그릴 때마다 숫자가 흔들리면 읽는 사람이 헷갈린다
  const [hours] = useState(() => hoursUntilReset());

  useEffect(() => {
    if (logged.current) return;
    logged.current = true;
    analytics.log('second_question_start', {
      continues_used: continuesUsed,
      gate: 'exhausted',
    });
  }, [analytics, continuesUsed]);

  // 오늘 받은 답이 아직 이 세션에 있을 때만 그 길을 준다. 없는 길을 그려 두지 않는다
  const hasAnswer = response != null && response.responseType === 'answer';
  const offerPass = isArchivePassEnabled() && archivePass !== 'owned';

  return (
    <section className="quota-wall" role="status" {...testId(TEST_IDS.exhausted)}>
      <p className="quota-wall__title">오늘은 여기까지예요</p>
      <p className="quota-wall__reset">내일 0시에 다시 열려요. 지금부터 약 {hours}시간 뒤예요</p>

      <div className="quota-wall__acts">
        {hasAnswer && (
          <button
            type="button"
            className="quota-wall__act"
            onMouseDown={keepFocus}
            onClick={() => void navigate(ROUTES.answer)}
          >
            오늘 받은 답변 다시 보기
          </button>
        )}

        {onOpenDailyQuote != null && (
          <button
            type="button"
            className="quota-wall__act"
            onMouseDown={keepFocus}
            onClick={onOpenDailyQuote}
          >
            오늘의 한마디 보기
          </button>
        )}

        <button
          type="button"
          className="quota-wall__act"
          onMouseDown={keepFocus}
          onClick={() => void navigate(ROUTES.archive)}
        >
          보관함 열어보기
        </button>
      </div>

      {offerPass && (
        <p className="quota-wall__pass">
          마음 보관함 이용권(₩4,900)이 있으면 간직할 수 있는 개수에 제한이 없어요. 오늘 나눌 수 있는
          이야기 수가 늘어나지는 않아요.
        </p>
      )}

      <p className="quota-wall__foot">오늘 하루를 잘 넘긴 것만으로 충분해요</p>
    </section>
  );
}
