import { useNavigate } from 'react-router';

import type { ApiLight } from '../../shared/api';
import { sceneForScreen } from '../../shared/visual/scene';
import { TEST_IDS, testId } from '../../shared/testIds';
import { ROUTES } from '../../app/router';

export interface LightAnswerProps {
  answer: ApiLight;
}

/**
 * 가벼운 입력에 주는 답.
 *
 * 「올바른 고민을 입력해주세요」로 쳐내지 않는다. 경전·간직·공유·광고가 없고,
 * 끝에 진짜 고민을 세 줄 쓰도록 이끄는 고정 문구가 붙는다.
 */
export function LightAnswer({ answer }: LightAnswerProps) {
  const navigate = useNavigate();
  const scene = sceneForScreen('lightAnswer');
  const paragraphs = answer.message.split(/\n+/).filter((line) => line.trim() !== '');

  return (
    <div className="ans" {...testId(TEST_IDS.light)}>
      <div className="simple">
        <div className="light-card">
          <img src={scene?.src} alt="찻잔을 든 부처" />
          {paragraphs.map((line, index) => (
            <p key={index}>{line}</p>
          ))}
          <div className="light-cta" {...testId(TEST_IDS.lightCta)}>
            조금 더 진지한 고민이 있다면 세 줄 정도 이야기해보세요.
            <br />
            훨씬 깊게 같이 볼 수 있어요.
          </div>
        </div>
        <p className="p-micro">이 답변은 AI 가 만들었어요 · 사용 횟수를 세지 않아요</p>
      </div>

      <div className="foot">
        <button type="button" className="btn btn--solid" onClick={() => navigate(ROUTES.home)}>
          이야기 이어서 쓰기
        </button>
      </div>
    </div>
  );
}
