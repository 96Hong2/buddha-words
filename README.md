# 부처의 말

고민을 쓰면 **사람이 감수한 경전 구절**을 근거로 그 상황을 풀어 주고, 오늘 해 볼 수 있는 일 하나를 알려 주는 [앱인토스](https://developers-apps-in-toss.toss.im) WebView 미니앱.

명언을 하나 뽑아 주는 앱이 아니다. 성공 기준은 이 퍼널이다.

> 장난으로 들어옴 → 「답이 꽤 괜찮네」 → 「내 진짜 고민도 써볼까」 → 「이건 저장하고 싶다」 → 「친구한테 이 문장은 보내고 싶다」

**제품 코드가 붙어 있다.** 프론트(React·WebView)와 백엔드(FastAPI)가 이어져 있고 실제 OpenAI 모델이 답을 쓴다.
고민 입력·라우터·답변·위기 안내·보관·공유·광고 자리까지 화면으로 돌아간다. 판은 **v0.3**(2026-09-14)이다.

남은 것은 코드가 아니라 사람과 외부다. **경전 구절 대부분이 아직 감수 전이고**, 실기기 QA와 콘솔 제출이 남았다.
지금 숫자는 `데이터와 검사` 절의 명령을 직접 돌려 확인한다.

---

## 무엇부터 읽나

| 하고 싶은 것 | 여는 것 |
| --- | --- |
| 제품이 뭔지 한 번에 보고 싶다 | `docs/PRD v0.3 (수익화·라우터 개편·라이브목업).html` 을 내려받아 브라우저로 연다. 폰 목업을 눌러 볼 수 있다 |
| 무엇을 언제 만드는지 | [`docs/plan/00-통합-개발-계획.md`](docs/plan/00-통합-개발-계획.md) **충돌하면 이 문서가 이긴다** |
| 입력을 어떻게 분류하나 | [`spec/router.ts`](spec/router.ts) + [`spec/router.fixtures.json`](spec/router.fixtures.json) |
| 답변이 어떤 모양인가 | [`spec/answer.schema.json`](spec/answer.schema.json) |
| 서버가 무엇을 내려주나 | `backend/app/api/routes.py` 의 `/concern`·`/concern/pass2`·`/daily`·`/share` |
| 화면이 어떻게 갈라지나 | `frontend/src/domains/` (ads·answer·archive·concern·daily·quota·safety·settings·share) |
| 화면 시안을 하나씩 | `design/index.html` (갤러리). 이미지가 상대 경로라 저장소를 받아서 연다 |
| AI 에게 코드를 시킬 때 | 루트의 [`CLAUDE.md`](CLAUDE.md)·[`AGENTS.md`](AGENTS.md) 와 `.claude/rules/` 여섯 장 |

정본 순서는 **통합 개발 계획 > `spec/` > PRD > 시안** 이다.
`spec/` 이 코드 정본이고 `docs/spec/` 은 문서에서 링크하려고 둔 사본이다. **고쳤으면 양쪽을 같이 고친다.** CI 가 diff 0 을 검사한다.
`docs/plan/01~06` 은 폐기된 원안이라 각 문서 맨 위 배너를 먼저 읽는다.

---

## 이 제품의 규칙 일곱

어기면 심사에서 반려되거나 개인정보 사고가 난다. 전문은 [`CLAUDE.md`](CLAUDE.md).

1. **경전은 LLM 이 만들지 않는다.** 모델은 구절 id 만 고르고 본문은 서버가 데이터에서 채운다.
2. **고민 원문을 저장·로그·이벤트·공유카드 어디에도 싣지 않는다.**
3. **위기 신호는 위로만 간다.** 방법을 묻는 글(acute)은 모델에 닿지 않고 고정 창구 안내로 간다.
4. **광고는 두 자리뿐이다.** 답변이 끝난 뒤와 같은 날 두 번째 고민 앞. 첫 답변에는 광고가 없다.
5. **모델 id 와 프롬프트는 배포 산출물이다.** 환경변수로 갈아 끼우지 않는다(플랫폼 AI 운영 요건).
6. **문구는 해요체.** 「상담·치료·진단·처방」을 쓰지 않는다. 경구체는 「오늘의 부처의 말」에만.
7. **가벼운 입력을 쳐내지 않는다.** 「점심 뭐 먹지?」는 실패가 아니라 앱의 캐릭터를 보여 줄 기회다.

---

## 폴더

```
spec/                     코드 정본. router · answer.schema · events · visual-theme · 픽스처
backend/                  FastAPI 서버
  app/api/                라우트와 의존성
  app/domains/            answer · quota · routing · safety · scripture · share
  app/integrations/llm/   OpenAI 어댑터 · 프롬프트 · 예산 · MODELS.md
  tests/                  pytest
frontend/                 React WebView 앱 (Vite)
  src/domains/            화면 단위 도메인 아홉
  src/shared/             api 타입 · 저장소 · 공용 UI
  e2e/specs/              Playwright 화면 증명
data/scriptures/          경전 seed.json · 임베딩 · 감수 문서
docs/
  PRD v0.3 …html          제품 정본. 눌러 보는 라이브 목업
  PRD v0.2 …html          오래된 정본 (맨 위 배너)
  plan/00-통합-개발-계획.md  최종 판정 v0.3
  plan/01~06              폐기된 축별 원안 (참고용)
  spec/                   spec/ 의 사본. CI 가 diff 0 을 본다
  repo-seed/              루트에 이미 깔아 둔 CLAUDE.md·AGENTS.md 의 원본
.claude/rules/            AI 가 지켜야 하는 규칙 여섯 장 (안전·광고·문구·정본·검증·분석)
.github/workflows/ci.yml  정본 게이트 · 프론트 · 백엔드 세 잡
design/                   화면 시안 · 컴포넌트 · 색 토큰 (편집 원본)
assets/                   부처 일러스트와 화면 에셋
tools/                    정본 게이트 · 경전 seed·임베딩 빌드 · 인라인 사본 · 배포 스크립트
```

`design-inline/`(이미지를 base64 로 박은 사본)은 커밋하지 않는다. 필요하면 만든다.

```bash
python3 tools/inline_assets.py
```

---

## 데이터와 검사

숫자는 여기 적지 않는다. 명령이 직접 알려 준다.

```bash
# 라우터 픽스처. 의존성이 없고 Node 22 이상이면 그대로 돈다
node --experimental-strip-types spec/router.test.ts

# 정본 게이트. spec/ ↔ docs/spec/ diff, 이벤트 이름, 스키마, 화면의 「무료」
node tools/check_spec.mjs

# 백엔드
cd backend && uv run ruff check . && uv run pytest -q

# 프론트
cd frontend && npm run typecheck && npm run e2e

# 경전 구절 수 · 감수 통과 수 · 결별 주제에서 빼 둔 구절
backend/.venv/bin/python tools/check_scriptures.py
```

「ㅋㅋㅋㅋ」 열 줄이 LIGHT 로, 「남편이 다른 사람을 만나는 것 같아요. 이혼해야 할까요?」 22자가 DEEP 으로 가는지를 라우터 픽스처가 지킨다.

앱을 직접 띄우려면 백엔드는 `backend/.venv/bin/uvicorn`(키는 `backend/.env`), 프론트는 `frontend` 에서 `npx vite`.

### 공유 링크가 사는 자리

공유 링크는 30일 산다고 화면에 적어 두었다. 그 약속을 지키는 것은 **저장 자리 설정 하나**다.

- 개발은 아무것도 안 줘도 된다. 임시 폴더의 SQLite 파일로 떨어지고, 지워져도 잃는 것은 개발용 링크뿐이다.
- **배포(Cloud Run)에서는 `DATABASE_URL` 에 Cloud SQL PostgreSQL 주소를 반드시 준다.** 인스턴스 안 파일은 배포·유휴 종료·오토스케일마다 사라지고 인스턴스끼리 서로 다른 파일을 봐서, 카톡에 붙은 링크가 배포 한 번에 깨진다. 안 주면 `ENVIRONMENT=prod` 기동이 멈춘다(`backend/app/core/config.py`).
- 공유 링크를 누른 사람을 웹 앱으로 넘기려면 `WEB_ORIGIN` 에 그 주소를 준다. **안 주면 넘기지 않고 백엔드 랜딩에 머문다.** 카드 한 장과 토스 딥링크가 그 화면에 있어 막다른 곳은 아니지만, 웹으로 바로 들어가는 버튼이 없다. 안 준 것은 기동 로그의 `web_origin_missing` 로 알 수 있고, 주소 꼴이 아닌 값을 주면 기동이 멈춘다. CORS 목록에서 주워 쓰지 않는다. 받아도 되는 주소와 사람을 보내도 되는 주소는 다르다.
- 값과 설명은 `backend/.env.example`. 실제로 PostgreSQL 에 붙는지는 `TEST_DATABASE_URL` 을 주고 `uv run pytest tests/test_persistence.py` 로 잰다(CI 가 매번 돈다).

---

## 상태

| 항목 | 값 |
| --- | --- |
| 판 | v0.3 (2026-09-14) |
| 코드 | 프론트·백엔드가 이어져 있고 실제 모델이 답을 쓴다. 화면은 홈·입력·답변·위기·보관·공유·설정 |
| 경전 | 여덟 갈래에서 뽑은 초안 시드. **지금 구절 수와 감수 통과 수는 `tools/check_scriptures.py` 가 찍어 준다.** 출시선은 200 감수 통과 |
| 검색 | 어휘 + 벡터 하이브리드 (`backend/app/domains/scripture/`) |
| 남은 것 | 경전 사람 감수 · 실기기 QA · 콘솔 제출 · 라이선스 확정 |
| 완료선 | C1~C63, 전부 화면에서 눈으로 보이는 것 |
| 플랫폼 | 앱인토스 SDK 3.2.0 · 라이트 모드 · 하단 탭 2개 |

## 쓰는 글꼴과 색

본문·UI 는 [Pretendard](https://github.com/orioncactus/pretendard), 제목·경전·인용은 [MaruBuri](https://hangeul.naver.com/font/maruburi). 색은 모래·금색·세이지·연꽃 네 계열이고 대비비를 전부 계산해 통과시켰다. 값은 [`design/foundations/_tokens.css`](design/foundations/_tokens.css).

## 라이선스

아직 정하지 않았다. 경전 번역은 CC0 저본에서 옮긴 것이고 감수와 라이선스 확정이 끝나기 전에는 출시하지 않는다. 이미지 에셋은 생성형 도구로 만든 것이다. 코드와 문서를 가져다 쓰기 전에 문의해 주세요.
