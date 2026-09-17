/**
 * 행동 로그 이벤트 정본 v0.3
 *
 * 채널은 토스 `Analytics.log` 하나다. 별도 이벤트 테이블은 만들지 않는다.
 * 여기 없는 이벤트는 보내지 않는다. 페이로드에는 id · 열거값 · 숫자 구간만 싣는다.
 * 고민 원문 · 답변 본문 · 경전 본문 · 익명키 · 기기 id 는 어떤 이벤트에도 싣지 않는다.
 *
 * 콘솔 「핵심 지표」 설정(guide/analytics/conversion-metrics):
 *   활성 지표(1개)   answer_generated
 *   대표 전환(1개)   answer_read_70   ← 답변을 70% 이상 읽은 사용자. 광고보다 먼저 이걸 본다
 *   보조 전환(2개)   rewarded_ad_complete · save_click
 */

export const EVENTS = {
  // 진입
  app_open:            { params: ['is_first_open', 'open_bucket', 'entry', 'days_since_first_open', 'days_since_last_open'] as const },   // entry: home | share_link | archive | other. 어느 화면으로 들어왔든 한 번 찍힌다
  session_start:       { params: ['reason', 'is_first_open', 'days_since_last_open'] as const },   // reason: open | resume. 마지막 활동에서 30분 지나면 새 세션이다
  session_end:         { params: ['reason', 'duration_bucket_s', 'answers', 'ads'] as const },     // reason: background | timeout
  // 온보딩 (두 장. variant=none 이면 안 띄우고 바로 입력으로 간다)
  onboarding_view:     { params: ['step', 'total_steps', 'variant'] as const },
  onboarding_next:     { params: ['step', 'elapsed_bucket_ms'] as const },
  onboarding_skip:     { params: ['step'] as const },
  onboarding_complete: { params: ['variant', 'elapsed_bucket_ms'] as const },
  // 입력 깔때기. 키 하나마다 보내지 않는다. 구간이 바뀌는 순간에만 보낸다
  concern_input_start:  { params: ['restored'] as const },                                  // 입력칸에 처음 글자가 들어왔다
  concern_input_milestone:{ params: ['chars_bucket', 'lines_bucket'] as const },             // 구간이 올라갈 때 한 번씩
  deep_hint_shown:      { params: ['chars_bucket'] as const },                               // 점 셋이 다 차 「깊게 볼 수 있어요」가 떴다
  concern_submit:       { params: ['chars_bucket', 'lines_bucket', 'typing_bucket_ms', 'deep_hint_seen', 'restored'] as const },
  // 입력·라우팅
  input_type_light:    { params: ['chars_bucket', 'lines_bucket'] as const },
  input_type_normal:   { params: ['chars_bucket', 'lines_bucket', 'stage'] as const },
  input_type_deep:     { params: ['chars_bucket', 'lines_bucket', 'stage'] as const },
  invalid_input:       { params: ['message_key'] as const },
  crisis_detected:     { params: ['stage', 'level', 'minor', 'abuse'] as const },          // level: acute | distress
  crisis_continue_click:{ params: ['level'] as const },                                    // 「그래도 이야기를 들어주세요」. acute 에서는 버튼 자체가 없다
  crisis_exit:         { params: ['level', 'exit'] as const },                             // exit: channel_call | channel_sns | rewrite | close
  solace_generated:    { params: ['elapsed_bucket_ms'] as const },
  solace_blocked:      { params: ['reason'] as const },                                    // reason: forbidden_phrase | schema | provider. 고정 문구로 바꿔 내보냈다
  model_route:         { params: ['route', 'model_tier', 'use_rag', 'confidence_bucket', 'floor_applied'] as const },
  // ⚠ 아래는 **기기가 보내지 않는다.** 토큰과 금액을 아는 곳은 서버뿐이라, 같은 사실을
  //    백엔드가 `llm_spend` 구조화 로그로 남긴다(`api/routes.py`). 이름을 여기 남겨 두는 것은
  //    KPI 가 가리키는 자리를 한곳에서 보기 위해서다. 기기에서 이 이름을 보내면 값을 지어내는 것이다
  model_cost_estimate: { params: ['route', 'model_tier', 'input_tokens_bucket', 'output_tokens_bucket', 'cost_bucket_usd'] as const },
  // 답변
  answer_generated:    { params: ['answer_id', 'route', 'pass', 'elapsed_bucket_ms', 'regenerated'] as const },   // pass: 1 | 2 | light
  answer_read_50:      { params: ['answer_id', 'route'] as const },
  answer_read_70:      { params: ['answer_id', 'route'] as const },   // 대표 전환
  answer_read_90:      { params: ['answer_id', 'route'] as const },
  answer_section_view: { params: ['answer_id', 'route', 'section'] as const },   // section: tags | message | scripture | explanation | analysis | action | closing | cta
  answer_exit:         { params: ['answer_id', 'route', 'max_read_bucket', 'dwell_bucket_s', 'exit'] as const },  // exit: back | new_concern | share | save | other
  answer_report:       { params: ['answer_id', 'reason_code'] as const },
  answer_feedback:     { params: ['answer_id', 'value', 'route', 'primary_tag', 'answer_length_bucket'] as const },  // value: positive | negative
  answer_negative_reason:{ params: ['answer_id', 'reason'] as const },   // reason: mismatch | obvious | too_long | tone | scripture | other. 표본만 물어본다
  // 경전에 진짜 관심이 있나. 「AI 상담만 원한다」와 가르는 자리다
  scripture_expand:    { params: ['answer_id', 'scripture_id'] as const },   // 「원문 보기」. 펼치기와 출처 열기가 같은 시트라 하나로 센다
  term_explanation_open:{ params: ['answer_id', 'term_index'] as const },
  // 오늘 해볼 일
  action_view:         { params: ['answer_id', 'action_index'] as const },
  action_commit:       { params: ['answer_id', 'action_index'] as const },   // 「오늘 이것만 해볼게요」. 플래그로 끈다
  // Deep Extension (보상형 광고 · 답변 끝)
  deep_extension_view: { params: ['answer_id', 'route', 'ad_supported'] as const },      // CTA 가 화면에 들어옴
  rewarded_ad_start:   { params: ['placement', 'answer_id'] as const },                   // placement: extension | continue
  rewarded_ad_complete:{ params: ['placement', 'answer_id', 'reward_granted'] as const },
  rewarded_ad_fail:    { params: ['placement', 'reason'] as const },                     // reason: no_fill | unsupported | dismissed | error
  extension_generated: { params: ['answer_id', 'elapsed_bucket_ms'] as const },
  ad_eligible:         { params: ['placement', 'answer_id'] as const },                   // 띄울 수 있는 상태가 됐다. 제안을 본 것(deep_extension_view)보다 앞이다
  post_ad_continue:    { params: ['placement', 'answer_id'] as const },                   // 광고를 보고 하던 일을 이어갔다
  post_ad_exit:        { params: ['placement', 'answer_id', 'within_bucket_s'] as const },// 광고 뒤 곧바로 나갔다. 수익이 높아도 여기가 크면 그 자리는 나쁘다
  // 같은 날 두 번째 고민
  second_question_start:{ params: ['continues_used', 'gate'] as const },                  // gate: free | ad_continue | exhausted
  // 공유
  share_start:         { params: ['answer_id', 'card_kind'] as const },                   // card_kind: modern_message
  share_complete:      { params: ['answer_id', 'card_kind', 'method'] as const },         // method: link | image
  share_landing_open:  { params: ['token_valid'] as const },
  share_cancel:        { params: ['answer_id'] as const },
  share_landing_cta:   { params: [] as const },                                           // 「나도 내 고민에 맞는 말을 받아보기」
  // 보관·결제
  save_click:          { params: ['answer_id', 'slot_index'] as const },                  // slot_index: 1~3 무료, 4 부터 paywall
  paywall_view:        { params: ['trigger'] as const },                                  // trigger: save_4th | archive_locked
  paywall_close:       { params: ['trigger', 'within_bucket_s'] as const },               // 2초 안에 닫혔으면 잘못 열린 것이다
  archive_view:        { params: ['items_bucket'] as const },
  archive_item_open:   { params: ['days_since'] as const },
  purchase_start:      { params: ['sku'] as const },
  purchase_complete:   { params: ['sku', 'amount_krw'] as const },
  purchase_fail:       { params: ['sku', 'error_code'] as const },
  // 리텐션
  daily_quote_impression:{ params: ['quote_id', 'surface'] as const },                     // surface: entry_card | home_card
  daily_quote_open:    { params: ['quote_id', 'surface'] as const },
  entry_card_dismiss:  { params: ['quote_id', 'how'] as const },                           // how: cta | close | backdrop | back
  recall_card_impression:{ params: ['days_since'] as const },
  recall_card_click:   { params: ['days_since'] as const },
  // 마찰. 사람이 막힌 자리를 화면 녹화 없이 알아내는 최소한의 신호다
  friction_repeat_submit:{ params: ['within_bucket_ms'] as const },                        // 3초 안에 전송을 다시 눌렀다
  friction_generation_abandon:{ params: ['route', 'elapsed_bucket_ms'] as const },         // 답을 만드는 중에 나갔다
  // 알림. 첫 답을 본 뒤에만 묻는다. 플래그로 끈다
  notification_prompt_view:  { params: ['surface'] as const },
  notification_prompt_accept:{ params: ['surface'] as const },
  notification_prompt_decline:{ params: ['surface'] as const },
  notification_permission:   { params: ['result'] as const },                              // result: granted | denied | unsupported
  // 실패
  answer_failed:       { params: ['route', 'pass', 'reason'] as const },                  // reason: timeout | offline | budget | schema | provider
} as const;

export type EventName = keyof typeof EVENTS;

/** 구간 규칙. 정확한 값을 남기지 않는다 */
export const BUCKETS = {
  chars: ['0', '1-14', '15-39', '40-119', '120-299', '300+'],
  lines: ['1', '2', '3-4', '5+'],
  confidence: ['<0.5', '0.5-0.7', '0.7-0.9', '0.9+'],
  elapsed_ms: ['<2s', '2-5s', '5-10s', '10-20s', '20-40s', '40s+'],
  tokens: ['<500', '500-1k', '1k-2k', '2k-4k', '4k+'],
  cost_usd: ['<0.001', '0.001-0.005', '0.005-0.02', '0.02+'],
  /** 사람이 화면에 머문 시간. 이탈이 「곧바로」인지 「읽다가」인지 가른다 */
  dwell_s: ['<3s', '3-10s', '10-30s', '30-90s', '90s+'],
  /** 세션 길이 */
  session_s: ['<10s', '10-60s', '1-3m', '3-10m', '10m+'],
  /** 글을 쓴 시간. 오래 매만진 글과 붙여 넣은 글을 가른다 */
  typing_ms: ['<5s', '5-20s', '20-60s', '60s+'],
  /** 「곧바로」를 재는 짧은 자. 마찰 신호 전용 */
  immediate_s: ['<2s', '2-10s', '10s+'],
  /** 답변 본문 길이. 길수록 완독률이 떨어지는지 본다 */
  answer_len: ['<600', '600-1200', '1200-2000', '2000+'],
  /** 보관함에 든 개수 */
  items: ['0', '1-3', '4-9', '10+'],
} as const;

/** KPI 정의. 분자/분모 이벤트가 둘 다 찍히는지 M6 에서 콘솔로 확인한다 */
export const KPI = {
  activation:       { name: '첫 입력 → 첫 답변 도달',   num: 'answer_generated(pass=1|light, first)', den: 'input_type_* (first)', target: '≥ 90%' },
  quality:          { name: '답변 70% 완독률',         num: 'answer_read_70', den: 'answer_generated(pass=2|light)', target: 'normal·deep 따로 본다' },
  deep_engagement:  { name: 'Deep Extension 클릭률',   num: 'rewarded_ad_start(placement=extension)', den: 'deep_extension_view', target: '실측 후 정한다' },
  ad_optin:         { name: '보상형 opt-in',           num: 'rewarded_ad_start', den: 'deep_extension_view + second_question_start(gate=ad_continue)', target: '' },
  ad_complete:      { name: '광고 완료율',              num: 'rewarded_ad_complete', den: 'rewarded_ad_start', target: '' },
  ads_per_answer:   { name: 'Answer 당 광고 노출',       num: 'rewarded_ad_complete', den: 'answer_generated(pass=2|light)', target: '' },
  arpdau:           { name: 'ARPDAU',                  num: '콘솔 광고 수익 + 결제', den: 'DAU', target: '' },
  llm_cost_per_dau: { name: 'LLM cost / DAU',          num: 'Σ model_cost_estimate', den: 'DAU', target: '광고매출 / LLM비용 ≥ 1.5' },
  paywall_conv:     { name: 'Paywall 전환',            num: 'purchase_complete', den: 'paywall_view', target: '' },
  d1: { name: 'D1', num: 'app_open(days_since_first_open=1)', den: 'app_open(is_first_open)', target: '' },
  d7: { name: 'D7', num: 'app_open(days_since_first_open=7)', den: 'app_open(is_first_open)', target: '' },
  requestion:       { name: '재질문율',                num: 'second_question_start', den: 'answer_generated(pass=2|light) unique users', target: '' },
  daily_quote:      { name: '오늘의 한마디 재방문',      num: 'daily_quote_open', den: 'daily_quote_impression', target: '' },
  recall:           { name: '지난 고민 회고 클릭률',     num: 'recall_card_click', den: 'recall_card_impression', target: '' },
  viral_share:      { name: '공유 완료 / 답변 생성',     num: 'share_complete', den: 'answer_generated(pass=2|light)', target: '' },
  viral_landing:    { name: '공유 링크 → 고민 입력',     num: 'share_landing_cta → input_type_*', den: 'share_landing_open', target: '' },
  // ── 활성화 깔때기. 한 단계라도 빠지면 그 자리가 제품을 막고 있다 ──
  onboarding_done:  { name: '온보딩 완주율',            num: 'onboarding_complete', den: 'onboarding_view(step=1)', target: '≥ 85%' },
  input_start:      { name: '열고 나서 쓰기 시작',       num: 'concern_input_start', den: 'app_open', target: '' },
  submit_conv:      { name: '쓰기 시작 → 전송',         num: 'concern_submit', den: 'concern_input_start', target: '' },
  deep_hint_effect: { name: '3줄 유도가 글을 늘리나',     num: 'concern_submit(deep_hint_seen=true, chars_bucket≥120-299)', den: 'concern_submit(deep_hint_seen=true)', target: 'deep_hint_seen=false 와 비교한다' },
  ttfv:             { name: 'TTFV',                    num: 'app_open → answer_generated(pass=1|light) 첫 건의 경과', den: '', target: '중앙값을 본다. 늘면 입력 UX 가 막고 있다' },
  // ── 답변 소비. 어디서 나가는가 ──
  section_dropoff:  { name: '섹션별 도달률',            num: 'answer_section_view(section=X)', den: 'answer_view 상당(answer_generated pass=2)', target: '섹션 순서대로 감소해야 정상' },
  scripture_interest:{ name: '경전 관심도',             num: 'scripture_expand + term_explanation_open', den: 'answer_generated(pass=2)', target: 'AI 상담만 원하는지 가른다' },
  action_reach:     { name: 'Action 도달률',           num: 'action_view', den: 'answer_generated(pass=2)', target: '' },
  feedback_pos:     { name: '도움됐다 비율',            num: 'answer_feedback(value=positive)', den: 'answer_feedback', target: 'route·model_tier 별로 본다' },
  // ── 광고 CX 가드레일. 수익만 보지 않는다 ──
  ad_post_exit:     { name: '광고 뒤 곧바로 이탈',       num: 'post_ad_exit(within_bucket_s=<2s|2-10s)', den: 'rewarded_ad_complete', target: 'placement 별로 본다. 높은 자리는 옮긴다' },
  ad_post_continue: { name: '광고 뒤 이어감',           num: 'post_ad_continue', den: 'rewarded_ad_complete', target: '' },
  ad_next_day:      { name: '광고 본 사람의 D1',        num: 'app_open(days_since_last_open=1) ∩ 전날 rewarded_ad_complete', den: '전날 rewarded_ad_complete unique users', target: '안 본 사람과 비교한다' },
  // ── Carrying Capacity. 새 사용자를 계속 받아도 유지되는가 ──
  retention_dn:     { name: 'D1·D3·D7·D14·D30',       num: 'app_open(days_since_first_open=N)', den: 'app_open(is_first_open) N일 전 코호트', target: '' },
  resurrection:     { name: '되돌아옴',                num: 'app_open(days_since_last_open≥7)', den: 'app_open', target: '' },
  stickiness:       { name: 'DAU/WAU',                num: 'DAU', den: 'WAU', target: '' },
  questions_per_dau:{ name: '하루 한 명당 고민 수',      num: 'concern_submit', den: 'DAU', target: '' },
  sessions_per_user:{ name: '하루 한 명당 세션 수',      num: 'session_start', den: 'DAU', target: '' },
  k_factor:         { name: 'K-factor',               num: '(share_complete / DAU) × (share_landing_cta / share_landing_open)', den: '', target: '1 을 넘으면 자생한다' },
  organic_ratio:    { name: '자생 유입 비율',           num: 'app_open(is_first_open, entry=share_link)', den: 'app_open(is_first_open)', target: '' },
  margin_per_dau:   { name: '한 명당 기여이익',         num: '광고수익 + 결제수익 − Σ model_cost_estimate', den: 'DAU', target: '> 0 이어야 사용자를 더 받을 수 있다' },
} as const;

/**
 * 분석에서 쓰는 사용자 묶음. 정의를 코드 한 곳에 둬서 대시보드마다 달라지지 않게 한다.
 * 기준값은 실측 뒤에 고친다. 고칠 때는 여기만 고친다.
 */
export const COHORTS = {
  /** 값을 실제로 느낀 사람. 이 비율이 Carrying Capacity 의 바닥이다 */
  healthy_activated: 'answer_read_70 OR action_view OR share_complete OR save_click',
  /** 수익화 표면까지 온 사람 */
  monetizable: 'deep_extension_view OR second_question_start(gate=ad_continue) OR paywall_view',
  /** 그날 번 것이 그날 쓴 것보다 큰 사용자-일 */
  profitable_user_day: '(광고수익 + 결제수익) > Σ model_cost_estimate',
} as const;
