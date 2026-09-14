# 공용 층 계약 (프론트 도메인이 쓰는 것 전부)

도메인 폴더는 `frontend/src/domains/<이름>/` 이다. **도메인끼리 직접 import 하지 않는다.**
아래 목록 밖의 것을 공용에서 꺼내 쓰지 않는다. 필요하면 자기 도메인 안에 만든다.

## 경로

```
frontend/src/
  shared/
    api/          types.ts(Api* 타입) · index.ts(useApiClient · ApiFailure · messageFor)
    session/      useSession()
    visual/       sceneForTheme(theme) · sceneForScreen(key)
    analytics/    useAnalytics() · EVENTS
    testIds.ts    TEST_IDS · testId()
    ui/           BottomSheet · Button · Card · Chip · Toggle
    styles/tokens.css   색·타이포·간격 정본. 램프(--c-*)를 화면에서 직접 쓰지 않는다
  app/router/     ROUTES
  domains/<이름>/ 화면 컴포넌트 + <이름>.css
```

## 꺼내 쓰는 것

```ts
import { useApiClient, ApiFailure, messageFor, type ApiAnswer, type ApiCrisis } from '../../shared/api';
import { useSession } from '../../shared/session';
import { sceneForTheme, sceneForScreen } from '../../shared/visual/scene';
import { useAnalytics } from '../../shared/analytics';
import { EVENTS } from '../../shared/analytics';
import { TEST_IDS, testId } from '../../shared/testIds';
import { BottomSheet, Button, Card, Chip, Toggle } from '../../shared/ui';
import { ROUTES } from '../../app/router';
```

### useSession()

```ts
const { draft, setDraft, sent, response, idempotencyKey, beginSubmit, setResponse, clear } = useSession();
```

- `draft` 지금 입력창에 있는 글. **위기 화면을 닫아도 지워지지 않는다.** 24시간 임시저장까지 이 훅이 한다
- `sent` 전송한 글. 2차 패스·위로 답변 요청이 다시 쓴다
- `beginSubmit(text)` 멱등키를 새로 만들고 `sent` 를 채운다. 그 키를 돌려준다
- `setResponse(res)` 받은 응답을 담는다. 화면 전환은 이 값을 보고 한다

### useApiClient()

```ts
submitConcern({ text, idempotencyKey }): Promise<ApiResponse>       // 1차 패스. light·invalid·crisis 는 여기서 끝
fetchPass2({ answerId, idempotencyKey, text }): Promise<Pass2>      // 2차 패스
continueAfterCrisis({ text }): Promise<ApiResponse>                 // 위로 답변. 서버가 다시 판정한다
fetchExtension({ answerId, text, usedIds }): Promise<ApiExtension>  // 보상형 광고 뒤
fetchDailyQuote(dateISO): Promise<DailyQuote>                       // 오늘의 한마디
```

실패는 `ApiFailure`(reason: timeout · offline · budget · schema · provider)로 던진다.

### sceneForTheme / sceneForScreen

```ts
const scene = sceneForTheme(answer.visualTheme);   // { src, backdrop, pose }
<div style={{ background: scene.backdrop }}><img src={scene.src} alt="" /></div>
const s = sceneForScreen('crisis');                // null 이면 그 화면에는 그림을 두지 않는다
```

### 이벤트

`EVENTS` 에 없는 이름은 보내지 않는다. 페이로드에 고민 원문·답변 본문·경전 본문을 싣지 않는다.

```ts
const analytics = useAnalytics();
analytics.log('answer_read_70', { answer_id: id, route });
```

## 지켜야 할 것

1. 경전 문장은 서버가 준 `scripture.text` 를 그대로 그린다. 화면에서 만들지 않는다
2. 고민 원문을 이벤트·로그·공유 카드에 싣지 않는다
3. 위기 화면에서 `canContinue` 를 클라이언트가 뒤집지 않는다. 서버 값 그대로 쓴다
4. 광고는 두 자리(`extension` · `continue`)뿐. 한 화면에 「광고」라는 말은 배지 하나까지다
5. 화면 어디에도 「무료」를 쓰지 않는다. 「지금은 3개까지 보관할 수 있어요」처럼 쓴다
6. 모든 시트는 닫기 버튼 · 바깥 · 뒤로가기 셋으로 닫힌다. 진입 즉시 바텀시트를 띄우지 않는다
7. 문구는 해요체. 「상담·치료·진단·처방·업보·죄」를 쓰지 않는다. 「오늘의 부처의 말」만 경구체
8. 색·간격·글꼴은 `tokens.css` 의 의미 토큰(`--bg` · `--surface` · `--text` …)만 쓴다
9. 셀렉터는 `TEST_IDS` 상수로만 붙인다. 문자열을 손으로 적지 않는다
