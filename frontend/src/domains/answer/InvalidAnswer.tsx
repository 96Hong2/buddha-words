import { useEffect } from 'react';
import { useNavigate } from 'react-router';

import { useAnalytics } from '../../shared/analytics';
import type { ApiInvalid, InvalidMessageKey } from '../../shared/api';
import { sceneForScreen } from '../../shared/visual/scene';
import { TEST_IDS, testId } from '../../shared/testIds';
import { ROUTES } from '../../app/router';

/**
 * 고정 문구 4종. 모델을 부르지 않고 여기서 고른다.
 * 둘째 줄은 넷 다 같다. 나가는 길을 매번 같은 문장으로 알려 준다.
 */
const NEXT_STEP = '요즘 머릿속에서 가장 신경 쓰이는 일을 하나만 적어보세요.';

const MESSAGES: Record<InvalidMessageKey, string> = {
  playful: '이건 마음 고민이라기보다는 장난에 가까운 것 같네요 😌',
  empty: '아직 아무것도 적히지 않았어요 😌',
  injection: '제가 어떻게 만들어졌는지보다, 오늘 마음에 걸리는 일을 듣고 싶어요 😌',
  repetition: '같은 말이 이어져 있어서 무엇이 걸리는지 잘 모르겠어요 😌',
};

export interface InvalidAnswerProps {
  answer: ApiInvalid;
}

/** 쳐내는 화면이 아니다. 나가는 길이 있고 사용 횟수가 줄지 않는다 */
export function InvalidAnswer({ answer }: InvalidAnswerProps) {
  const analytics = useAnalytics();
  const navigate = useNavigate();
  const scene = sceneForScreen('invalid');

  useEffect(() => {
    analytics.log('invalid_input', { message_key: answer.messageKey });
  }, [analytics, answer.messageKey]);

  return (
    <div className="ans" {...testId(TEST_IDS.invalid)}>
      <div className="simple">
        <div className="light-card">
          <img src={scene?.src} alt="합장한 부처" />
          <p>{MESSAGES[answer.messageKey]}</p>
          <p>{NEXT_STEP}</p>
        </div>
        <p className="p-micro">사용 횟수를 세지 않아요</p>
      </div>

      <div className="foot">
        <button
          type="button"
          className="btn btn--solid"
          onClick={() => navigate(ROUTES.home)}
          {...testId(TEST_IDS.invalidRetry)}
        >
          다시 써볼게요
        </button>
      </div>
    </div>
  );
}
