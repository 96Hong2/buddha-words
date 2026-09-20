import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';

import { TEST_IDS, testId } from '../../shared/testIds';

import './settings.css';

/** 국외 이전 고지에 들어가는 값. 쓰는 모델이 정해지면 이 상수 한 곳만 고친다 */
const TRANSFER = [
  { k: '받는 곳', v: '답변을 만드는 AI 모델 제공사 (해외)' },
  { k: '보내는 것', v: '적으신 고민 글' },
  { k: '왜 보내나요', v: '답변을 만들려고요' },
  { k: '얼마나 두나요', v: '답변을 만드는 동안만요' },
];

/**
 * 개인정보 안내와 이용약관이 **한 문서**다.
 *
 * 설정에는 줄이 둘이지만 둘 다 여기로 온다. 읽을 글이 짧아 화면을 가를 이유가 없다.
 * 대신 제목이 둘을 다 말하고, 「이용약관」으로 들어오면(`#terms`) 그 절로 바로 내려간다.
 * 예전에는 약관을 눌렀는데 「개인정보 안내」라는 제목이 뜨고, 약관은 한참 아래에 있었다.
 */
export function PrivacyScreen() {
  const { hash } = useLocation();
  const terms = useRef<HTMLElement>(null);

  useEffect(() => {
    if (hash !== '#terms') return;
    terms.current?.scrollIntoView({ block: 'start' });
  }, [hash]);

  return (
    <div className="set-screen" {...testId(TEST_IDS.privacy)}>
      <div className="set-pad">
        <h1 className="set-title">개인정보 안내와 이용약관</h1>
        <p className="set-sub">
          적으신 이야기를 어떻게 다루는지, 그리고 지켜 주실 것을 적어 뒀어요
        </p>

        <section className="set-card set-doc">
          <h2 className="set-doc-title">무엇을 받나요</h2>
          <ul className="set-doc-list">
            <li>
              이름·연락처·계정을 받지 않아요. 토스가 미니앱마다 따로 만들어 주는 익명키 하나로만
              구분해요.
            </li>
            <li>
              적으신 고민 글, 답변을 만들며 생기는 값(마음 태그·경전 번호), 앱을 쓴 기록을 다뤄요.
            </li>
          </ul>
        </section>

        <section className="set-card set-doc">
          <h2 className="set-doc-title">적은 글은 어디에 남나요</h2>
          <ul className="set-doc-list">
            <li>
              고민 글은 파일이나 기록으로 남기지 않아요. 답변을 이어서 만드는 데만 쓰려고 서버가
              30분 동안 들고 있다가 지워요.
            </li>
            <li>
              만들어진 답변도 서버에 남기지 않아요. 간직하지 않은 답변은 앱을 닫으면 다시 볼 수
              없어요.
            </li>
            {/* 공유 링크를 만들면 그 내용이 서버에 30일 남는다. 위의 「답변도 서버에
                남기지 않아요」와 어긋나므로 예외를 여기서 밝힌다. 무엇이 남는지는 공유할 때
                고른 범위에 따라 다르고, 고르는 화면(ShareSheet)도 같은 말을 한다 */}
            <li>
              다만 공유 링크를 만들면 그 링크에 담길 내용이 서버에 남아요. 링크를 받은 사람에게
              보여 주려고요. 30일이 지나면 링크와 같이 사라져요.
            </li>
            <li>
              「경전 구절만」으로 보내면 경전 문장과 풀이 한 줄이 남아요. 이 글은 적으신
              이야기와 무관하게 원래 있던 글이라, 받는 사람에게 사정이 드러나지 않아요.
            </li>
            <li>
              「답변 전체」로 보내면 그 답변의 풀이와 조언까지 함께 남아요. 적으신 글 자체가
              담기지는 않지만, <b>풀이는 그 이야기를 읽고 쓴 글이라 무슨 일이 있었는지 받는
              사람이 짐작할 수 있어요.</b> 보내기 전에 어떤 글이 가는지 화면에서 보여 드려요.
            </li>
            <li>
              간직하기를 누른 답변만 그 기기 안에 남아요. 경전과 풀이, 지금 할 수 있는 것까지 함께
              남아서 보관함에서 다시 펼쳐 볼 수 있어요.
            </li>
            <li>
              간직한 답변에 적으신 글이 그대로 담기지는 않아요. 다만 답변이 그 이야기를 되짚어 쓴
              대목은 답변의 일부라 함께 남아요.
            </li>
            <li>
              보관함에서 「보관함에서 지우기」를 누르면 그 자리에서 지워져요. 앱을 지워도 함께
              사라져요.
            </li>
            <li>
              입력칸에 적던 글은 보내고 난 뒤에도 하루 동안 기기에 남아요. 앱을 다시 열면 그 글이
              입력칸에 그대로 있고, 지우고 새로 적으면 바로 사라져요.
            </li>
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
            <li>설정에서 고른 값(글자 크기·알림 시간)도 함께 남아요.</li>
            <li>고민 글·답변 본문·경전 본문·익명키·기기 번호는 어떤 기록에도 싣지 않아요.</li>
          </ul>
        </section>

        <section className="set-card set-doc">
          <h2 className="set-doc-title">불편한 답변을 알려 주실 때</h2>
          <ul className="set-doc-list">
            <li>답변 아래 「이 답변이 불편했어요」를 누르면 답변 번호와 사유 코드만 보내요.</li>
            <li>고민 글도 답변 본문도 함께 가지 않아요.</li>
          </ul>
        </section>

        <section className="set-card set-doc" id="terms" ref={terms}>
          <h2 className="set-doc-title">이용약관</h2>
          <ul className="set-doc-list">
            <li>답변은 AI가 만든 글이에요. 전문가의 판단을 대신하지 않아요.</li>
            {/* 감수를 통과한 것은 399구절 중 16구절이다. 약관 자리라 더 강한 약속으로 읽히므로
                구절마다 다른 것을 한 줄로 단정하지 않는다. 감수 여부는 「원문 보기」가 말한다 */}
            <li>
              경전 문장은 문헌에서 옮긴 번역을 그대로 보여 드려요. 앱이 지어내지 않아요. 문헌 감수를
              받았는지는 구절마다 「원문 보기」에 적어 두었어요.
            </li>
            <li>
              마음 보관함 이용권은 한 번 결제하는 상품이에요. 토스에 남은 구매 내역으로 확인하기
              때문에 앱을 다시 깔아도 이어지고, 설정에서 직접 다시 확인할 수 있어요.
            </li>
            <li>다른 사람에게 해가 되는 쓰임이 확인되면 이용이 제한될 수 있어요.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
