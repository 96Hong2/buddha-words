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
  app_open:            { params: ['is_first_open', 'open_bucket', 'entry'] as const },   // entry: home | share_link | daily_quote
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
  model_cost_estimate: { params: ['route', 'model_tier', 'input_tokens_bucket', 'output_tokens_bucket', 'cost_bucket_usd'] as const },
  // 답변
  answer_generated:    { params: ['answer_id', 'route', 'pass', 'elapsed_bucket_ms', 'regenerated'] as const },   // pass: 1 | 2 | light
  answer_read_50:      { params: ['answer_id', 'route'] as const },
  answer_read_70:      { params: ['answer_id', 'route'] as const },   // 대표 전환
  answer_read_90:      { params: ['answer_id', 'route'] as const },
  answer_report:       { params: ['answer_id', 'reason_code'] as const },
  // Deep Extension (보상형 광고 · 답변 끝)
  deep_extension_view: { params: ['answer_id', 'route', 'ad_supported'] as const },      // CTA 가 화면에 들어옴
  rewarded_ad_start:   { params: ['placement', 'answer_id'] as const },                   // placement: extension | continue
  rewarded_ad_complete:{ params: ['placement', 'answer_id', 'reward_granted'] as const },
  rewarded_ad_fail:    { params: ['placement', 'reason'] as const },                     // reason: no_fill | unsupported | dismissed | error
  extension_generated: { params: ['answer_id', 'elapsed_bucket_ms'] as const },
  // 같은 날 두 번째 고민
  second_question_start:{ params: ['continues_used', 'gate'] as const },                  // gate: free | ad_continue | exhausted
  // 공유
  share_start:         { params: ['answer_id', 'card_kind'] as const },                   // card_kind: modern_message
  share_complete:      { params: ['answer_id', 'card_kind', 'method'] as const },         // method: link | image
  share_landing_open:  { params: ['token_valid'] as const },
  share_landing_cta:   { params: [] as const },                                           // 「나도 내 고민에 맞는 말을 받아보기」
  // 보관·결제
  save_click:          { params: ['answer_id', 'slot_index'] as const },                  // slot_index: 1~3 무료, 4 부터 paywall
  paywall_view:        { params: ['trigger'] as const },                                  // trigger: save_4th | archive_locked
  purchase_start:      { params: ['sku'] as const },
  purchase_complete:   { params: ['sku', 'amount_krw'] as const },
  purchase_fail:       { params: ['sku', 'error_code'] as const },
  // 리텐션
  daily_quote_impression:{ params: ['quote_id', 'surface'] as const },                     // surface: entry_card | home_card
  daily_quote_open:    { params: ['quote_id', 'surface'] as const },
  entry_card_dismiss:  { params: ['quote_id', 'how'] as const },                           // how: cta | close | backdrop | back
  recall_card_impression:{ params: ['days_since'] as const },
  recall_card_click:   { params: ['days_since'] as const },
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
} as const;
