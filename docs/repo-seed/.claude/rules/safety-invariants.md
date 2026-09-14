# 안전 불변식

- LLM 출력 스키마(`LlmPass1` · `LlmPass2` · `LlmLight` · `LlmExtension`)에 경전 본문 필드를 추가하지 않는다. `scriptureIds` 만. 서버가 화이트리스트로 검증하고 DB 에서 본문을 채운다.
- 요청 2 는 `pending` 행의 구절 id 를 읽는다. 클라이언트 값이 다르면 400.
- `raw_text` 류 컬럼·로그·이벤트 파라미터에 고민 원문을 넣지 않는다. 예외는 사용자가 켠 동의 스위치 뒤 `consultations.raw_text` 하나.
- crisis 는 어느 층(rules · classifier · pass1 safetyFlag)이든 올리면 올라간다. 내리는 코드를 만들지 않는다. crisis 면 pass1·pass2 를 부르지 않고 `ApiCrisis` 를 준다.
- 위기 화면 문구·창구 번호는 `domains/safety/copy.ts` 고정 파일이다. LLM 이 만들지 않는다. 자해 방법·수단을 묘사하지 않는다.
- 거절 문구(`ApiInvalid.messageKey`)는 고정 집합 4종. 매번 생성하지 않는다.
- 병명·진단·치료·처방 어휘는 프롬프트 금지어와 사후 검사 둘 다에 있다. 사후 검사는 막지 않고 로그만.
