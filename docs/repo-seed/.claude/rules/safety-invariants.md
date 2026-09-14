# 안전 불변식

- LLM 출력 스키마(`LlmPass1` · `LlmPass2` · `LlmLight` · `LlmExtension`)에 경전 본문 필드를 추가하지 않는다. `scriptureIds` 만. 서버가 화이트리스트로 검증하고 DB 에서 본문을 채운다.
- 요청 2 는 `pending` 행의 구절 id 를 읽는다. 클라이언트 값이 다르면 400.
- `raw_text` 류 컬럼·로그·이벤트 파라미터에 고민 원문을 넣지 않는다. 예외는 사용자가 켠 동의 스위치 뒤 `consultations.raw_text` 하나.
- crisis 는 어느 층(rules · classifier · pass1 safetyFlag)이든 올리면 올라간다. 내리는 코드를 만들지 않는다. crisis 면 pass1·pass2 를 부르지 않고 `ApiCrisis` 를 준다.
- 위기 화면 문구·창구 번호는 `domains/safety/copy.ts` 고정 파일이다. LLM 이 만들지 않는다. 자해 방법·수단을 묘사하지 않는다.

## 위기 두 결과 위로 답변 (v0.3.1)

- `crisisLevel` 은 `acute` 와 `distress` 둘뿐이다. `acute` 는 방법·수단을 찾는 물음(`CRISIS_METHOD`)과 강한 패턴(계획·시도·유서·수단)이다.
- **`solace` 로 가는 문은 `escalateToSolace()` 하나다.** rules 도 classifier 도 `solace` 를 직접 반환하지 않는다. 다른 자리에서 `route = 'solace'` 를 대입하는 코드를 만들지 않는다.
- 그 함수는 `distress` 만 통과시킨다. `acute` 를 통과시키는 분기·플래그·환경변수를 두지 않는다. 픽스처가 이것을 지킨다.
- 프론트가 혼자 열지 못한다. 서버가 같은 원문으로 다시 판정해 `canContinue: true` 를 준 경우에만 연다. 클라이언트가 보낸 `canContinue` 를 신뢰하지 않는다.
- `ApiSolace` 는 `ApiAnswer` 와 다른 타입이다. 분석 섹션·행동 목록·태그·광고·Extension·공유를 담지 않는다. 두 타입을 합치지 않는다.
- 위로 답변은 생성 뒤 `SOLACE_FORBIDDEN` 을 지나야 나간다. 걸리면 **문장을 고치지 않고 통째로 버린 뒤** `SOLACE_FALLBACK` 으로 바꾸고 `solace_blocked` 를 남긴다. 재생성을 시도하지 않는다.
- 창구 카드는 위로 답변의 위와 아래에 항상 붙는다. 조건부로 감추지 않는다.
- 위기 화면과 위로 답변에서 사용자가 적은 글을 지우지 않는다. 화면을 닫으면 입력창에 그대로 남는다. 원문은 기기 안에만 있고 서버는 저장하지 않는다.
- 사용 횟수를 세지 않는다. 위기·위로는 `quota` 를 건드리지 않는다.
- 거절 문구(`ApiInvalid.messageKey`)는 고정 집합 4종. 매번 생성하지 않는다.
- 병명·진단·치료·처방 어휘는 프롬프트 금지어와 사후 검사 둘 다에 있다. 사후 검사는 막지 않고 로그만.
