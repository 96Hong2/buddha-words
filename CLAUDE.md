# 부처의 말 · 에이전트 안내

고민을 쓰면 **사람이 감수한 법구경 구절**을 근거로 상황을 풀어 주고 오늘 할 일 하나를 주는 앱인토스 WebView 미니앱이다.
성공 기준은 퍼널이다: 장난으로 들어옴 → 「답이 꽤 괜찮네」 → 진짜 고민 → 저장 → 공유.

## 정본이 어디 있나

| 무엇 | 파일 | 규칙 |
| --- | --- | --- |
| 입력 라우터 (5분류) | `spec/router.ts` + `router.fixtures.json` | 바꾸면 `node --experimental-strip-types spec/router.test.ts` 25/25 |
| 답변 스키마 | `spec/answer.schema.json` | LLM 출력에 경전 본문 필드 없음 |
| 이벤트 | `spec/events.ts` | 여기 없는 이벤트는 보내지 않는다 |
| 이미지 매핑 | `spec/visual-theme.ts` | 표정 고정, 자세 × 시간대 |
| 프롬프트 | `backend/app/integrations/llm/prompts.py` | 배포 산출물. 바꾸면 콘솔 사전 검토 |
| 제품 결정 | `docs/plan/00-통합-개발-계획.md` | 충돌하면 이 문서가 이긴다 |
| 디자인 토큰 | `frontend/src/shared/styles/tokens.css` | 램프(`--c-*`) 직접 사용 금지, 의미 토큰만 |

## 절대 규칙 (어기면 심사 반려 또는 개인정보 사고)

1. 경전은 LLM 이 만들지 않는다. id 만 고르고 서버가 DB 에서 채운다.
2. 고민 원문은 저장·로그·이벤트 어디에도 싣지 않는다.
3. crisis 판정은 위로만 간다. crisis 면 LLM 본 답변을 부르지 않는다. 문구는 `domains/safety/copy.ts` 고정.
4. 광고는 `AdPlacement` 네 자리(`generation` · `extension` · `continue` · `save`)뿐. 보상은 `userEarnedReward` 에서만. 입력·위기 화면에 광고 없음. **첫 답까지는 어느 자리에서도 안 띄운다**(`isFirstStory`). `generation` 은 심사 위험이 있어 `VITE_FLAG_GENERATION_AD=off` 로 끈다.
5. 모델 id 와 프롬프트를 환경변수로 갈아 끼우는 코드를 만들지 않는다.
6. 문구는 해요체. 「상담·치료·진단·처방·업보·죄」를 쓰지 않는다. 「오늘의 부처의 말」만 경구체.
7. 진입 즉시 바텀시트 없음. 모든 시트는 닫기·바깥·뒤로가기 셋으로 닫힌다.

## 작업 순서

1. 관련 도메인 폴더(`frontend/src/domains/<x>` · `backend/app/domains/<x>`)와 `spec/` 을 먼저 읽는다.
2. 구현한다. 도메인 밖으로 나가는 의존은 `shared/` 를 거친다.
3. 검증은 e2e 한 겹: `frontend/e2e/` 스펙을 실제 화면으로 돌린다. 목으로 격리한 단위 테스트는 만들지 않는다.
4. 실패해야 하는 검증을 skip 하거나 기대값을 실제 출력에서 베끼지 않는다.

## 검증 명령

```
node --experimental-strip-types spec/router.test.ts   # 라우터 픽스처 25/25 (루트에서)
npm run check:spec                                     # spec/ ↔ docs/spec/ diff, events grep, 스키마 검증 (frontend/)
npm run e2e                                            # 화면 한 겹, frontend/e2e (frontend/, 익명키 격리 fixture 필수)
```

자세한 규칙은 `.claude/rules/` 에 있다. 이 파일은 50줄 안에 유지한다.
