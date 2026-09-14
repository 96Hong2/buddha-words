import { TEST_IDS, testId } from '../../shared/testIds';

import './settings.css';

/** 국외 이전 고지에 들어가는 값. 쓰는 모델이 정해지면 이 상수 한 곳만 고친다 */
const TRANSFER = [
  { k: '받는 곳', v: '답변을 만드는 AI 모델 제공사 (해외)' },
  { k: '보내는 것', v: '적으신 고민 글' },
  { k: '왜 보내나요', v: '답변을 만들려고요' },
  { k: '얼마나 두나요', v: '답변을 만드는 동안만요' },
];

const CONTACT_EMAIL = 'help@buddhawords.kr';

export function PrivacyScreen() {
  return (
    <div className="set-screen" {...testId(TEST_IDS.privacy)}>
      <div className="set-pad">
        <h1 className="set-title">개인정보 안내</h1>
        <p className="set-sub">적으신 이야기를 어떻게 다루는지 적어 뒀어요</p>

        <section className="set-card set-doc">
          <h2 className="set-doc-title">무엇을 받나요</h2>
          <ul className="set-doc-list">
            <li>이름·연락처·계정을 받지 않아요. 토스가 미니앱마다 따로 만들어 주는 익명키 하나로만 구분해요.</li>
            <li>적으신 고민 글, 답변을 만들며 생기는 값(마음 태그·경전 번호), 앱을 쓴 기록을 다뤄요.</li>
          </ul>
        </section>

        <section className="set-card set-doc">
          <h2 className="set-doc-title">적은 글은 어디에 남나요</h2>
          <ul className="set-doc-list">
            <li>고민 글은 서버에 저장하지 않아요. 답변을 만드는 동안에만 쓰고 지워요.</li>
            <li>만들어진 답변은 보관함에서 다시 볼 수 있게 남아요. 이용권이 없으면 그날 자정까지예요.</li>
            <li>기기에는 쓰다 만 글(하루)과 간직한 말씀이 남아요. 앱을 지우면 함께 사라져요.</li>
          </ul>
        </section>

        <section className="set-card set-doc">
          <h2 className="set-doc-title">해외로 나가는 것</h2>
          <p className="set-doc-lead">답변을 만드는 일은 해외 서버에서 돌아가는 AI 모델이 해요.</p>
          {TRANSFER.map((row) => (
            <div className="set-kv" key={row.k}>
              <span className="set-kv-k">{row.k}</span>
              <span className="set-kv-v">{row.v}</span>
            </div>
          ))}
        </section>

        <section className="set-card set-doc">
          <h2 className="set-doc-title">앱을 쓴 기록</h2>
          <ul className="set-doc-list">
            <li>어느 화면을 봤는지, 글이 얼마나 길었는지를 구간 값으로만 남겨요.</li>
            <li>고민 글·답변 본문·경전 본문·익명키·기기 번호는 어떤 기록에도 싣지 않아요.</li>
          </ul>
        </section>

        <section className="set-card set-doc">
          <h2 className="set-doc-title">안전을 위해 잠깐 두는 것</h2>
          <ul className="set-doc-list">
            <li>사후 점검이나 신고에 걸린 답변만 7일 동안 따로 두고, 그 뒤 지워요.</li>
            <li>여기에도 고민 글은 들어가지 않아요. 답변과 사유 코드만 봐요.</li>
          </ul>
        </section>

        <section className="set-card set-doc">
          <h2 className="set-doc-title">이용약관</h2>
          <ul className="set-doc-list">
            <li>답변은 AI가 만든 글이에요. 전문가의 판단을 대신하지 않아요.</li>
            <li>경전 문장은 사람이 감수한 번역을 그대로 보여 드려요. 앱이 지어내지 않아요.</li>
            <li>마음 보관함 이용권은 한 번 결제하는 상품이고, 익명키에 붙어 기기를 바꿔도 이어져요.</li>
            <li>다른 사람에게 해가 되는 쓰임이 확인되면 이용이 제한될 수 있어요.</li>
          </ul>
        </section>

        <p className="set-hint">궁금한 것이 있으면 {CONTACT_EMAIL} 로 보내 주세요</p>
      </div>
    </div>
  );
}
