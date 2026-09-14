# 광고와 사용량

- 광고 자리는 `AdPlacement = 'extension' | 'continue'` 둘뿐이다. 새 자리를 만들려면 `docs/plan/00-통합-개발-계획.md` 1.6절을 먼저 고친다.
- 금지 자리: 고민 작성 중 · 첫 제출 직후 · 답변 블록 사이 · 경전과 분석 사이 · 대기 화면 · 위기 화면 · INVALID 화면.
- `loadFullScreenAd` → `loaded` → `showFullScreenAd`. 사전 로드. 한 화면에서 광고 그룹 하나만, 순차 로드.
- 보상은 `userEarnedReward` 에서만 지급한다. `dismissed` 는 취소다. 서버는 보상 토큰을 검증한 뒤에만 Extension 을 생성하거나 이어가기를 허용한다.
- 광고 버튼 라벨에 「광고 보고」가 들어가고 광고 아이콘이 붙는다. 「광고 클릭하면」 류 문구 금지. 광고 컨테이너 안에 우리 글자 없음.
- 광고를 못 띄우는 상황(`isSupported()` false · no fill · 이 기기 광고 끄기)에서는 Extension CTA 를 숨기고 이어가기는 시트 없이 허용한다. 광고 때문에 기능을 막지 않는다.
- 사용량: 하루 첫 NORMAL·DEEP 무료 → 이어가기 4회(광고) → 천장 5회. LIGHT 하루 10회 소프트 상한. INVALID·CRISIS 는 세지 않는다. 기준 시각은 사용자 시간대 자정. 성공한 생성만 센다. 확인이 아니라 예약(`pending` 행 + 멱등키).
- 개발·QA 광고 ID 는 `ait-ad-test-rewarded-id`. 실광고 ID 로 테스트하지 않는다.
