# CX 계측

이 문서가 답하려는 질문은 하나다.

> 사람이 어디에서 값을 느끼고, 어디에서 실망하고, 어떤 경험 때문에 다시 오며,
> 어디까지 수익화해도 다시 오는가.

더 많이 추적하려고 만든 것이 아니다. **관찰은 정교하게, 화면은 더 단순하게** 가 기준이다.
그래서 여기에 적힌 이벤트는 대부분 사람이 원래 하는 행동을 그대로 본 것이고,
사람에게 물어보는 것은 답변 끝의 두 칸 하나뿐이다.

---

## 0. 지켜야 할 것

| 규칙 | 이유 |
| --- | --- |
| **고민 원문·답변 본문·경전 본문을 어떤 이벤트에도 싣지 않는다** | 이 앱에서 가장 크게 다칠 수 있는 자리다. e2e 가 매번 검사한다 |
| 값은 **id · 열거값 · 숫자 구간**만 | 정확한 값은 사람을 가리킨다. 217자를 쓴 사람은 그날 한 명이다 |
| 로그 실패가 앱을 막지 않는다 | 대기열도 재시도도 없다. 브릿지가 삼킨다 |
| 이벤트 이름은 `spec/events.ts` 정본에만 | 없는 이름을 보내면 타입과 CI 게이트가 막는다 |
| 렌더를 막지 않는다 | 동기 요청 없음, `beforeunload` 없음, 무거운 직렬화 없음 |

`docs/spec/events.ts` 는 사본이고 `tools/check_spec.mjs` 가 diff 0 을 강제한다.

---

## 1. 무엇을 어디에 기록하나

수집처가 셋이고, **셋을 하나로 합치지 않는다.** 각자 아는 것이 다르기 때문이다.

| 자리 | 아는 것 | 어떻게 본다 |
| --- | --- | --- |
| 토스 Analytics | 사람의 행동 전부 | 콘솔 |
| 서버 구조화 로그 | LLM 비용(`llm_spend`) | Cloud Logging |
| 앱인토스 콘솔 | 광고 수익 · 결제 수익 | 콘솔 |

기여이익은 **세 자리를 날짜로 이어** 계산한다.

```
기여이익 = (콘솔 광고 수익 + 콘솔 결제 수익) − (Cloud Logging llm_spend 합) − 인프라
DAU 는 토스 Analytics 의 app_open 고유 사용자
```

기기는 토큰도 달러도 모른다. 그래서 `model_cost_estimate` 는 **기기가 보내지 않는다.**
이름만 정본에 남겨 두어 KPI 가 가리키는 자리를 한곳에서 보게 했다.

### 서버가 남기는 비용 한 줄

```
event=llm_spend  stage=pass1|pass2|light  route=normal|deep  cost_usd=0.000412
```

장부의 앞뒤 차이로 잰다. 한 인스턴스에서 요청이 겹치면 **어느 답에 얼마가 들었는지는
어긋날 수 있지만 하루 합계는 정확하다.** 필요한 것이 합계라 이 정도로 충분하다.
답마다 정확히 나누려면 provider 가 호출마다 값을 돌려주게 고쳐야 한다(아직 안 했다).

---

## 2. 공통 속성

모든 이벤트에 자동으로 붙는다. 화면은 넘기지 않는다.

| 이름 | 무엇 |
| --- | --- |
| `event_id` | 같은 로그가 두 번 도착해도 하나로 세는 열쇠 |
| `session_id` | 세션 하나 |
| `flow_id` | 기록 시작부터 저장까지 잇는 값(화면이 넘긴다) |
| `app_version` · `os` · `env` | 어느 판에서 난 일인가. `env` 로 QR 테스트를 지표에서 걷어낸다 |
| `variants` | 실험 배정. 없으면 안 실린다 |

`anonymous_key` 와 발생 시각은 **SDK 가 넣는다.** 우리가 지어내지 않는다.

### 세션

- 앱을 앞으로 가져오면 시작한다
- **마지막 활동에서 30분이 지나면 새 세션**이다
- 뒤로 가면 `session_end` 를 보낸다. 나가는 길을 붙잡지 않으므로 못 보내고 끝날 수 있고,
  그때는 다음 세션의 `session_start` 로 이어 읽는다

### 순서 보장

`app_open` 은 방문 이력을 저장소에서 읽어야 값이 차서 한 틱 늦다. 그동안 다른 로그를
**최대 3초까지 붙들었다가** 뒤에 내보낸다. 스트림의 첫 줄이 `app_open` 이 아니면
「열고 나서 몇 %가 입력했나」가 첫 칸부터 어긋나기 때문이다.

### 중복 방지

같은 사실을 두 번 세지 않는다. `once` 열쇠를 주면 세션 안에서 한 번만 나간다.
스크롤 비율·블록 도달·광고 노출·만족도가 그렇게 묶여 있다. e2e 가 검사한다.

---

## 3. 이벤트 사전

`trigger` 는 언제 나가는지, `why` 는 무엇을 물어보려고 두었는지다.

### 진입 · 세션

| 이름 | 언제 | 값 | 왜 |
| --- | --- | --- | --- |
| `app_open` | 홈이 처음 그려질 때, 세션당 한 번 | `is_first_open` `open_bucket` `entry` `days_since_first_open` `days_since_last_open` | 모든 깔때기의 분모. 뒤의 두 값이 D1·D7 을 코호트 질의 없이 만든다 |
| `session_start` | 앱을 열거나 30분 뒤 다시 쓸 때 | `reason` `is_first_open` `days_since_last_open` | 한 명이 하루에 몇 번 오는가 |
| `session_end` | 앱이 뒤로 갈 때 | `reason` `duration_bucket_s` `answers` `ads` | 세션 하나에서 답을 몇 개 받고 광고를 몇 번 봤나 |

### 온보딩

| 이름 | 언제 | 값 | 왜 |
| --- | --- | --- | --- |
| `onboarding_view` | 각 장이 뜰 때 한 번 | `step` `total_steps` `variant` | 어느 장에서 빠지나 |
| `onboarding_next` | 다음을 누를 때 | `step` `elapsed_bucket_ms` | 한 장에 얼마나 머무나 |
| `onboarding_skip` | 둘러보기를 누를 때 | `step` | 건너뛴 사람은 완주로 세지 않는다 |
| `onboarding_complete` | 두 장을 다 볼 때 | `variant` `elapsed_bucket_ms` | 완주율 |

이탈은 따로 이벤트를 두지 않는다. `onboarding_view` 가 있고 `onboarding_complete` 도
`onboarding_skip` 도 없는 세션이 이탈이다. 이벤트를 늘리지 않고 같은 답을 얻는다.

### 고민 입력

| 이름 | 언제 | 값 | 왜 |
| --- | --- | --- | --- |
| `concern_input_start` | 입력칸에 첫 글자가 들어올 때 | `restored` | 열고 나서 실제로 쓰기 시작한 비율 |
| `concern_input_milestone` | **글자 수 구간이 올라갈 때만** | `chars_bucket` `lines_bucket` | 사람들이 길게 쓰는가 |
| `deep_hint_shown` | 점 셋이 다 찰 때 한 번 | `chars_bucket` | 3줄 유도를 본 사람과 안 본 사람을 가른다 |
| `concern_submit` | 전송을 누를 때 | `chars_bucket` `lines_bucket` `typing_bucket_ms` `deep_hint_seen` `restored` | 활성화 깔때기의 마지막 칸 |

**키 하나마다 보내지 않는다.** 120자를 쓰는 사람이 이벤트 120개를 만들면 수집처가 먼저
무너지고, 그 수치로는 아무것도 물어볼 수 없다.

### 라우팅 · 답변 생성

| 이름 | 언제 | 값 | 왜 |
| --- | --- | --- | --- |
| `model_route` | 답이 왔을 때 | `route` `model_tier` `use_rag` `floor_applied` | 어느 등급이 값을 하는가. `answer_id` 로 만족도·리텐션에 잇는다 |
| `answer_generated` | 1차·2차·light 가 올 때 | `answer_id` `route` `pass` `elapsed_bucket_ms` `regenerated` | 활성 지표. 생성 시간과 이탈의 관계 |
| `answer_failed` | 실패했을 때 | `route` `pass` `reason` | 어디서 깨지나 |

### 답변 소비

| 이름 | 언제 | 값 | 왜 |
| --- | --- | --- | --- |
| `answer_read_50/70/90` | 그 비율을 처음 넘을 때 | `answer_id` `route` | 완독률. **70 이 대표 전환**이다 |
| `answer_section_view` | 블록이 화면에 들어올 때 한 번 | `answer_id` `route` `section` | **어느 블록에서 멈추나.** 비율은 이걸 말해 주지 않는다 |
| `answer_exit` | 답변 화면을 떠날 때 | `answer_id` `route` `max_read_bucket` `dwell_bucket_s` `exit` | 3초 만에 나간 것과 1분 읽고 나간 것은 다른 일이다 |
| `answer_feedback` | 👍👎 를 누를 때 한 번 | `answer_id` `value` `route` `primary_tag` `answer_length_bucket` | 어느 갈래의 답이 더 나은가 |
| `answer_negative_reason` | 아쉽다고 한 **표본**에게만 | `answer_id` `reason` | 무엇이 아쉬웠나. 기본 20%, 사람당 한 번 |
| `answer_report` | 「이 답변이 불편했어요」 | `answer_id` `reason_code` | 안전 신호. 만족도와 다른 축이다 |

`section` 값: `tags` · `message` · `scripture` · `analysis` · `action` · `closing` · `cta`

### 경전 관심도

| 이름 | 언제 | 왜 |
| --- | --- | --- |
| `scripture_expand` | 「원문 보기」를 누를 때 | **이 앱이 「AI 상담」인지 「경전을 읽는 자리」인지 가르는 유일한 신호** |
| `term_explanation_open` | 용어 칩을 누를 때 | 낯선 말을 실제로 찾아보나 |

답만 읽고 끝나면 앞엣것이고, 원문을 펼치면 뒤엣것이다. 제품의 방향이 여기 달려 있다.

### 오늘 할 일

| 이름 | 언제 | 왜 |
| --- | --- | --- |
| `action_view` | 행동 블록이 화면에 들어올 때 | Action 까지 읽는 비율 |
| `action_commit` | 「오늘 이것만 해볼게요」 | 읽고 끝나는가, 가져가는가. **체크리스트는 만들지 않았다** |

### 광고

| 이름 | 언제 | 왜 |
| --- | --- | --- |
| `ad_eligible` | 띄울 수 있는 상태가 됐을 때 | 「자격은 됐는데 제안이 안 보였다」와 「보고도 안 눌렀다」를 가른다 |
| `deep_extension_view` | Extension 제안이 보일 때 | 자리별 제안 노출 |
| `second_question_start` | 이어가기 시트가 열릴 때 | 자리별 제안 노출 |
| `rewarded_ad_start` | 광고를 누를 때 | opt-in 비율 |
| `rewarded_ad_complete` | 보상을 받았을 때 | 완료율 |
| `rewarded_ad_fail` | 못 띄우거나 중간에 닫았을 때 | 실패 사유 |
| `post_ad_continue` | 보상을 받고 이어갔을 때 | 광고가 흐름을 끊지 않았나 |
| `post_ad_exit` | 광고 뒤 곧바로 앱을 떠났을 때 | **수익이 높아도 사람이 나가는 자리를 찾는다** |

`placement` 값: `generation` · `extension` · `continue` · `save`

**자리가 둘에서 넷으로 늘었다(2026-09-17).** 새로 생긴 둘은 사람이 이미 기다리거나 멈춰
서는 자리다.

| 자리 | 언제 | 무엇을 덮나 |
| --- | --- | --- |
| `generation` | 답을 만드는 동안 | 원래 비어 있던 20초. **요청과 나란히 돈다. 답이 늦어지지 않는다** |
| `save` | 간직하기를 누를 때 | 누른 뒤 곧바로 끝나 다음 화면이 없던 자리 |

읽는 도중·쓰는 도중에는 여전히 광고가 없다.

⚠ `generation` 은 **가드레일을 같이 봐야 하는 자리다.** 기다리다 나가는 사람
(`friction_generation_abandon`)이 켜기 전보다 늘면 그 광고는 대기 시간을 채운 것이 아니라
길을 막은 것이다. KPI `gen_ad_cost` 가 그 비교다.

광고가 화면을 덮으면 WebView 도 숨겨진다. 그것을 앱을 떠난 것으로 세지 않는다
(`LoadingScreen` 의 `adCovering`). 세면 이 지표가 통째로 망가진다.

### 보관 · 결제

| 이름 | 언제 | 왜 |
| --- | --- | --- |
| `save_click` | 간직하기를 **누른** 순간 | 하려던 사람이 몇인가 |
| `save_gate_view` | 「짧은 광고를 보면」 시트가 뜰 때 | 광고를 제안받은 사람 |
| `save_gate_accept` | 「보고 간직하기」를 누를 때 | 광고 수락률(`save_gate_conv`) |
| `save_complete` | 실제로 **담겼을** 때 (`gate`) | 누른 것과 담긴 것 사이의 이탈 |
| `archive_view` | 보관함을 열 때 | 안 쓰는 기능인지 본다 |
| `archive_item_open` | 간직한 것을 다시 열 때 (`days_since`) | 쌓아 두는 자리인가 다시 읽는 자리인가 |
| `paywall_view` / `paywall_close` | 이용권 화면 열고 닫을 때 | `within_bucket_s` 가 2초 미만이면 길을 막고 선 화면이다 |
| `purchase_start` / `_complete` / `_fail` | 결제 흐름 | 전환율 |

**개수 제한이 없어졌다(2026-09-17).** 셋까지 담기고 넷째부터 이용권을 묻던 규칙을 뺐다.
간직하기는 그 말을 다시 보고 싶어서 누르는 자리라 거기를 막으면 앱이 주려는 것 자체가
막힌다. 지금 문지기는 짧은 광고 하나이고 `gate` 값이 어느 길로 담겼는지 적는다.

`gate` 값: `ad`(광고를 봤다) · `pass`(이용권) · `free`(광고를 못 띄우는 판)

`save_click` 과 `save_complete` 를 가른 이유: 광고가 중간에 서면서 **누른 사람과 담긴 사람이
달라졌다.** 하나로 두면 광고가 얼마나 떨구는지 영영 못 본다(KPI `save_conv`).

### 공유 · 리텐션

| 이름 | 왜 |
| --- | --- |
| `share_start` / `share_complete` / `share_cancel` | 공유가 어디서 끊기나 |
| `share_scope_select` | 무엇을 보낼지 고른 순간 (`scope`) | 경전만인가 답 전체인가 |
| `share_landing_open` / `share_landing_cta` | 받은 사람이 들어와 쓰기 시작하나 (K-factor) |
| `app_share_view` / `app_share_complete` | 세 번째 답 뒤의 앱 권하기 | 답이 아니라 앱 자체를 권한 결과 |
| `home_add_view` / `home_add_dismiss` | 홈에 추가 안내 | 권해서 실제로 닫는지 |
| `text_size_change` | 글자 크기를 바꿀 때 (`size`) | 큰 글씨를 쓰는 사람이 얼마나 되나 |

`share_complete` 의 `method` 값: `system`(네이티브 공유 시트) · `copy`(주소 복사) ·
`image`(앨범 저장). `card_kind` 는 `scripture` 와 `full` 둘이다.

**공유가 두 갈래가 됐다(2026-09-17).** `full` 을 고르면 답변 본문이 링크에 30일 남는다.
그 사실은 고르는 화면과 개인정보 안내가 함께 말한다. 고민 원문은 어느 쪽에도 담기지 않는다.
| `daily_quote_impression` / `_open` | 오늘의 한마디가 재방문을 만드나 |
| `entry_card_dismiss` | 첫 카드를 어떻게 닫나 |
| `recall_card_impression` / `_click` | 지난 고민 회고가 먹히나 |

### 마찰

화면 녹화도 DOM 클릭 추적도 하지 않는다. 사람이 막힌 자리만 최소로 남긴다.

| 이름 | 무엇 |
| --- | --- |
| `friction_repeat_submit` | 3초 안에 전송을 또 눌렀다 |
| `friction_generation_abandon` | 답을 만드는 중에 나갔다 |
| `answer_exit` (`dwell_bucket_s` = `<3s`) | 답을 보자마자 뒤로 갔다 |
| `post_ad_exit` (`within_bucket_s` = `<2s`) | 광고 직후 나갔다 |
| `paywall_close` (`within_bucket_s` = `<2s`) | 이용권 화면을 곧바로 닫았다 |

### 알림

기본은 꺼져 있다. 첫 실행에 묻지 않고 **답을 받아 본 뒤** 답변 맨 아래에서 한 줄로 묻는다.

`notification_prompt_view` · `_accept` · `_decline` · `notification_permission`

---

## 4. 가장 중요한 깔때기

```
app_open
  └ onboarding_view → onboarding_complete | onboarding_skip
      └ concern_input_start
          └ concern_submit
              └ answer_generated (pass=1)
                  └ answer_section_view(message)
                      └ answer_read_50
                          └ answer_section_view(action) · action_view
                              └ answer_read_90
                                  └ share_complete | save_click | rewarded_ad_start | second_question_start
```

각 칸은 앞 칸을 분모로 나눈다. 한 칸이라도 빠지면 그 구간을 못 보므로 e2e 가 순서를 검사한다.

### TTFV (Time To First Value)

네 구간을 잰다. 정확한 시간이 아니라 이벤트 사이의 시각 차이로 계산한다.

```
app_open → concern_input_start      입력 UX 가 막고 있나
concern_input_start → concern_submit 쓰다가 그만두나
concern_submit → answer_generated    생성이 느린가
app_open → answer_generated          TTFV. 첫 사용자 값이 늘면 무언가 앞을 막은 것이다
```

---

## 5. 리텐션과 Carrying Capacity

단순 DAU 가 아니라 **새 사용자를 계속 받아도 유지되는 수준**을 본다.

| 지표 | 계산 |
| --- | --- |
| D1 · D3 · D7 · D14 · D30 | `app_open(days_since_first_open=N)` / N일 전 `app_open(is_first_open)` |
| 이탈 | 그 기간에 `app_open` 이 없는 사용자 |
| 되돌아옴 | `app_open(days_since_last_open ≥ 7)` |
| DAU/WAU · WAU/MAU | `app_open` 고유 사용자 |
| 한 명당 고민 수 | `concern_submit` / DAU |
| 한 명당 세션 수 | `session_start` / DAU |
| 유입 경로 | `app_open.entry`: `home` · `share_link` · `daily_quote` |
| K-factor | (`share_complete`/DAU) × (`share_landing_cta`/`share_landing_open`) |
| 자생 비율 | `app_open(is_first_open, entry=share_link)` / `app_open(is_first_open)` |

### 파생 묶음

정의를 `spec/events.ts` 의 `COHORTS` 한곳에 둔다. 대시보드마다 달라지지 않게 하려는 것이다.

| 이름 | 정의 |
| --- | --- |
| Healthy Activated User | `answer_read_70` 또는 `action_view` 또는 `share_complete` 또는 `save_click` |
| Monetizable User | `deep_extension_view` 또는 `second_question_start(gate=ad_continue)` 또는 `paywall_view` |
| Profitable User-Day | (광고 + 결제) > `llm_spend` 합 |

기준값은 실측 뒤에 고친다. 고칠 때는 `COHORTS` 만 고친다.

---

## 6. 먼저 볼 대시보드 다섯

**① 활성화** `app_open → concern_input_start → concern_submit → answer_generated → read_50 → read_90`

**② 답변 품질** `route` · `model_tier` 별로 `answer_read_90` · `answer_feedback(positive)` ·
`share_complete` · `save_click` · `answer_negative_reason` 분포

**③ 수익화** `placement` 별로 `ad_eligible → deep_extension_view → rewarded_ad_start →
rewarded_ad_complete → post_ad_continue` 와 그 옆에 `post_ad_exit`

**④ 리텐션** 행동별 D1/D7: 공유한 사람 · 간직한 사람 · Deep 답을 받은 사람 ·
오늘의 한마디를 연 사람 · 광고를 본 사람

**⑤ 비용** `llm_spend` 합 / DAU, 수익 / DAU, 기여이익 / DAU

---

## 7. 물어볼 수 있나 (자체 점검)

| 질문 | 어떻게 | 답할 수 있나 |
| --- | --- | --- |
| Deep 사용자의 D7 이 Normal 보다 높나 | `model_route` ∩ 다음날 `app_open` | ✅ |
| 3줄 유도를 본 사람이 더 길게 쓰나 | `concern_submit` 을 `deep_hint_seen` 으로 갈라 `chars_bucket` 비교 | ✅ |
| 120자 이상이 만족도를 높이나 | `concern_submit.chars_bucket` ∩ `answer_feedback` | ✅ |
| 답이 길수록 완독률이 떨어지나 | `answer_feedback.answer_length_bucket` ∩ `answer_read_90` | ✅ |
| 어느 블록에서 가장 많이 나가나 | `answer_section_view` 도달률 감소 구간 | ✅ |
| 광고 자리별 수익 대 이탈 | 콘솔 수익 ∩ `post_ad_exit`/`rewarded_ad_complete` | ✅ |
| 광고 본 사람이 다음날 덜 오나 | 전날 `rewarded_ad_complete` ∩ `app_open(days_since_last_open=1)` | ✅ |
| 공유한 사람의 D7 | `share_complete` ∩ `app_open(days_since_first_open=7)` | ✅ |
| 어떤 감정 태그가 리텐션이 높나 | `answer_feedback.primary_tag` ∩ 재방문 | ✅ |
| 경전에 관심이 있나 | `scripture_expand` / `answer_generated(pass=2)` | ✅ |
| 답 하나에 든 정확한 비용 | `llm_spend` 는 **합계만 정확**하다 | ⚠️ 부분 |
| 광고 하나당 수익(eCPM) | 토스가 impression 단위 수익을 안 준다 | ❌ 콘솔 집계로만 |

마지막 둘은 지금 구조로 못 답한다. ⚠️ 는 provider 가 호출마다 값을 돌려주게 고치면 풀리고,
❌ 는 플랫폼이 주지 않는 값이라 콘솔 일 단위 집계로 갈음한다.

---

## 8. Feature flag

새 CX 장치는 전부 끌 수 있다. 값은 빌드 환경변수다(`shared/flags`).

| 플래그 | 기본값 | 무엇 |
| --- | --- | --- |
| `VITE_ONBOARDING` | `two_step` | `none` 이면 온보딩 없이 바로 입력(B안) |
| `VITE_FLAG_ANSWER_FEEDBACK` | on | 답변 끝 👍👎 |
| `VITE_NEGATIVE_REASON_SAMPLING` | `0.2` | 아쉽다고 한 사람 중 이유를 물을 비율 |
| `VITE_FLAG_ACTION_COMMIT` | on | 「오늘 이것만 해볼게요」 |
| `VITE_FLAG_NOTIFICATION_PROMPT` | **off** | 답변 끝 알림 권유. 콘솔 템플릿 코드가 있어야 켠다 |

### 온보딩 A/B

별도 실험 플랫폼이 없어 빌드 플래그로만 가른다.

- **A (기본)** 두 장 → 입력
- **B** 온보딩 없이 입력. 입력창 위 한 줄이 같은 일을 한다

판단 기준 셋: `concern_submit / app_open` · TTFV · D1. 배정은 `variants` 로 모든 이벤트에 실린다.

---

## 9. QA 점검표

개발에서 `/settings/debug-events` 를 연다. **운영 번들에는 이 화면이 실리지 않는다.**

- [ ] 고민을 하나 보내고 목록에 원문 조각이 **한 글자도** 없는지 본다
- [ ] 긴 값(빨갛게 표시됨)이 있는지 본다. 있으면 본문이 샌 것이다
- [ ] 위아래로 훑어도 `answer_section_view` 가 블록마다 한 번씩만인지 본다
- [ ] `app_open` 이 목록 맨 아래(=가장 먼저)인지 본다
- [ ] 👍 를 두 번 눌러도 `answer_feedback` 이 하나인지 본다
- [ ] 온보딩을 건너뛰면 `onboarding_complete` 가 **안 나가는지** 본다
- [ ] 앱을 뒤로 보냈다 오면 `session_end` 와 `session_start` 가 짝으로 있는지 본다

자동 검사는 `frontend/e2e/specs/analytics.spec.ts` · `onboarding.spec.ts` 다.
그중 개인정보 검사는 일부러 깨뜨려 실제로 서는 것을 확인했다.

---

## 10. 아직 못 한 것

| 무엇 | 왜 |
| --- | --- |
| 답 하나당 정확한 LLM 비용 | provider 가 호출마다 값을 돌려주지 않는다. 합계는 정확하다 |
| 광고 impression 단위 수익 | 플랫폼이 주지 않는다 |
| 서버 이벤트와 기기 이벤트의 사용자 단위 결합 | 서버 로그에 익명키를 싣지 않는다. 날짜 단위로만 잇는다 |
| 알림 소프트 프롬프트 실기기 확인 | 콘솔 스마트발송 템플릿 코드가 아직 없다 |
