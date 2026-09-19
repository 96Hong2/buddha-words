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
 *   보조 전환(2개)   rewarded_ad_complete · save_complete
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
  /**
   * 이 사람의 **몇 번째 답**인가. 답이 다 만들어진 뒤 답변 하나에 한 번이다.
   *
   * 하루 사용량(quota)과 다르다. 저쪽은 자정에 리셋되고 이쪽은 계속 쌓인다.
   * **첫 사용을 광고 없이 주는 정책의 본전을 재는 유일한 자리다.** 분모가 1, 분자가 2 다.
   */
  answer_milestone:    { params: ['answers_total', 'is_first'] as const },
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
  // Deep Extension (보상형 광고 · 답변 끝)
  deep_extension_view: { params: ['answer_id', 'route', 'ad_supported'] as const },      // CTA 가 화면에 들어옴
  rewarded_ad_start:   { params: ['placement', 'answer_id'] as const },                   // placement: generation | extension | continue | save
  rewarded_ad_complete:{ params: ['placement', 'answer_id', 'reward_granted'] as const },
  rewarded_ad_fail:    { params: ['placement', 'reason'] as const },                     // reason: no_fill | unsupported | dismissed | error
  extension_generated: { params: ['answer_id', 'elapsed_bucket_ms'] as const },
  ad_eligible:         { params: ['placement', 'answer_id'] as const },                   // 띄울 수 있는 상태가 됐다. 제안을 본 것(deep_extension_view)보다 앞이다
  /**
   * 광고를 띄울 수 있는 자리인데 **띄우지 않고 지나갔다.** 이유를 반드시 함께 싣는다.
   *
   * 이게 없으면 「광고가 한 건도 안 돌았다」를 보고도 원인을 못 가른다. 첫 사용이라
   * 일부러 건너뛴 것인지, 콘솔이 그룹 id 를 아직 안 줘서 번들에 값이 없는 것인지,
   * 사람이 광고를 꺼 둔 것인지가 전부 「0건」으로 똑같이 보인다. 실제로 그 상태로
   * 번들을 올려 놓고 광고가 안 뜬다는 것을 실기기에서야 알았다.
   *
   * reason: first_use | no_group | unsupported | opt_out | pass | already_saved | answer_ready | flag_off
   */
  ad_skipped:          { params: ['placement', 'reason'] as const },
  post_ad_continue:    { params: ['placement', 'answer_id'] as const },                   // 광고를 보고 하던 일을 이어갔다
  post_ad_exit:        { params: ['placement', 'answer_id', 'within_bucket_s'] as const },// 광고 뒤 곧바로 나갔다. 수익이 높아도 여기가 크면 그 자리는 나쁘다
  // 같은 날 두 번째 고민
  second_question_start:{ params: ['continues_used', 'gate'] as const },                  // gate: free | ad_continue | exhausted
  // 공유
  share_start:         { params: ['answer_id', 'card_kind'] as const },                   // card_kind: scripture | full
  share_scope_select:  { params: ['answer_id', 'scope'] as const },                       // scope: scripture | full. 무엇을 보낼지 고른 순간
  share_complete:      { params: ['answer_id', 'card_kind', 'method'] as const },         // method: system | copy | image
  share_landing_open:  { params: ['token_valid', 'scope'] as const },
  share_cancel:        { params: ['answer_id'] as const },
  share_landing_cta:   { params: [] as const },                                           // 「나도 내 고민에 맞는 말을 받아보기」
  // 앱 자체를 권한다. 세 번째 이야기를 마친 뒤 한 번만 뜬다
  app_share_view:      { params: ['answers_total'] as const },
  app_share_complete:  { params: ['method'] as const },                                   // method: system | copy
  app_share_dismiss:   { params: ['how'] as const },                                      // how: close | later. 보고 그냥 닫은 사람이 분석에서 사라지지 않게
  // 보관
  save_click:          { params: ['answer_id', 'slot_index'] as const },                  // 누른 순간. 담긴 것은 save_complete 다
  save_gate_view:      { params: ['answer_id'] as const },                                // 「짧은 광고를 보면」 시트를 봤다
  save_gate_accept:    { params: ['answer_id'] as const },                                // 「보고 간직하기」를 눌렀다
  save_complete:       { params: ['answer_id', 'slot_index', 'gate'] as const },          // gate: ad | pass | free | first_use. 실제로 담겼다
  save_done_view:      { params: ['answer_id', 'kind'] as const },                        // kind: saved | already. 담고 나서 뜨는 한 장
  save_done_action:    { params: ['action'] as const },                                   // action: archive | stay. 보러 갔나 읽던 답에 남았나
  archive_view:        { params: ['items_bucket'] as const },
  archive_item_open:   { params: ['days_since'] as const },
  // 보관함이 길어져서 생긴 셋. 「담기만 하고 안 읽는다」와 「찾아서 다시 읽는다」를 가른다
  /**
   * 별을 켰나 껐나. **언제 켰는지도 함께 싣는다.**
   *
   * `days_since` 는 간직한 날로부터 며칠 뒤인가다. 0 이면 담자마자 별을 단 것이고, 크면
   * 다시 찾아 들어와 단 것이다. 앞은 간직하기와 같은 뜻이라 즐겨찾기가 따로 할 일이 없고,
   * 뒤는 보관함이 실제로 다시 읽는 자리라는 증거가 된다.
   * `favorites_bucket` 은 누른 뒤 그 사람이 가진 즐겨찾기 수다. 몇 개까지 쌓는지 본다.
   */
  archive_favorite:    { params: ['on', 'days_since', 'favorites_bucket'] as const },
  archive_filter:      { params: ['filter', 'how'] as const },                            // filter: all | favorite, how: tap | auto(별을 켜서 옮겨진 것)
  archive_more:        { params: ['page'] as const },                                     // 「더 보기」로 몇 쪽까지 내려갔나
  // 간직한 말씀 내보내기. 답변 화면 공유와 **다른 길이다**(서버 링크 없이 기기에 있는 것으로 만든다)
  archive_share_start: { params: ['has_scripture', 'days_since'] as const },              // 며칠 지난 것을 내보내는지가 핵심이다
  archive_share_complete:{ params: ['method'] as const },                                 // method: system | copy
  archive_share_cancel:{ params: [] as const },                                           // 공유 시트를 스스로 닫았다. 실패가 아니다
  archive_share_fail:  { params: ['reason'] as const },                                   // reason: copy_blocked | no_scripture
  // 첫 말씀을 간직한 직후 보관함 맨 앞에 서는 앱 알리기 카드. 답변 화면 권유와 자리가 다르다
  archive_app_share_view:    { params: [] as const },
  archive_app_share_complete:{ params: ['method'] as const },                             // method: system | copy
  archive_app_share_dismiss: { params: ['how'] as const },                                // how: close
  archive_app_share_fail:    { params: ['reason'] as const },                             // reason: copy_blocked. 시트도 복사도 막힌 기기
  // 결제
  paywall_view:        { params: ['trigger'] as const },                                  // trigger: save_ad | archive_locked
  paywall_close:       { params: ['trigger', 'within_bucket_s'] as const },               // 2초 안에 닫혔으면 잘못 열린 것이다
  purchase_start:      { params: ['sku'] as const },
  purchase_complete:   { params: ['sku', 'amount_krw'] as const },
  purchase_fail:       { params: ['sku', 'error_code'] as const },
  // 리텐션
  daily_quote_impression:{ params: ['quote_id', 'surface'] as const },                     // surface: entry_card | home_card
  daily_quote_open:    { params: ['quote_id', 'surface'] as const },
  entry_card_dismiss:  { params: ['quote_id', 'how'] as const },                           // how: cta | close | backdrop | back
  // 내일 되짚기. **사람이 「내일 물어봐 주세요」를 누른 경우에만** 다음 날 한 번 묻는다
  tomorrow_ask_view:   { params: ['answer_id'] as const },                                 // 행동 아래 그 버튼이 화면에 들어왔다
  tomorrow_ask_accept: { params: ['answer_id', 'notify'] as const },                       // notify: granted | denied | unsupported
  recall_card_impression:{ params: ['days_since'] as const },                              // 다음 날 물어보는 시트가 떴다
  recall_card_click:   { params: ['days_since', 'done'] as const },                        // done: true(해봤어요) | false(아직이요). 이 앱이 행동까지 갔는지 재는 유일한 답이다
  // 마찰. 사람이 막힌 자리를 화면 녹화 없이 알아내는 최소한의 신호다
  friction_repeat_submit:{ params: ['within_bucket_ms'] as const },                        // 3초 안에 전송을 다시 눌렀다
  friction_generation_abandon:{ params: ['route', 'elapsed_bucket_ms'] as const },         // 답을 만드는 중에 나갔다
  // 답을 받고 돌아왔더니 쓰던 글이 남아 있다. 지울지 이어 쓸지 물어본 자리
  draft_confirm_view:  { params: ['chars_bucket'] as const },
  draft_confirm_choice:{ params: ['choice'] as const },                                    // choice: clear | keep
  /**
   * 쓰던 글을 통째로 지웠다. 물어본 카드 밖, **아무 때나 누를 수 있는 자리**다.
   *
   * `draft_confirm_choice(clear)` 와 가른다. 저쪽은 우리가 물어서 고른 것이고 이쪽은
   * 사람이 스스로 치운 것이다. 둘을 한 이름으로 세면 「이어 쓰기와 새로 쓰기 중 무엇이
   * 많은가」에 우리가 물어본 자리의 답만 들어온다.
   */
  draft_clear_open:    { params: ['chars_bucket'] as const },                              // 지우기를 눌러 확인을 띄웠다
  draft_clear_confirm: { params: ['choice', 'chars_bucket'] as const },                    // choice: clear | cancel
  // 읽기 설정. 글자 크기는 한 번 정하면 계속 쓰므로 바꾼 사실만 남긴다
  text_size_change:    { params: ['size', 'from'] as const },                              // size: s | m | l | xl, from: settings | onboarding
  // 홈에 추가. 첫 답(1회)과 다시 오는 사람(4회)에게 한 번씩, 그리고 설정에 늘 한 줄
  home_add_view:       { params: ['from', 'answers_total'] as const },                     // from: nudge | settings
  home_add_dismiss:    { params: ['how'] as const },                                       // how: close | later | already
  // 알림. 세 번째 답을 받은 뒤 한 번 권하고, 설정에 늘 한 줄 둔다
  notification_prompt_view:  { params: ['surface'] as const },                             // surface: nudge_card | settings | answer_end
  notification_prompt_accept:{ params: ['surface'] as const },
  notification_prompt_decline:{ params: ['surface'] as const },
  notification_permission:   { params: ['result'] as const },                              // result: granted | denied | unsupported
  /**
   * 알림을 받고 싶은 시각. 사람이 고른 값이다.
   *
   * ⚠ **이 값은 아직 발송에 쓰이지 않는다.** 그 시각에 실제로 보내려면 콘솔 스마트발송
   * 템플릿 코드와 서버 발송(`messenger/send-message`)이 필요하고 둘 다 아직 없다.
   * 지금 이 로그가 하는 일은 **사람들이 몇 시를 고르는지 미리 재 두는 것**이다. 발송을
   * 켤 때 기본값을 짐작이 아니라 이 분포로 정한다.
   */
  notify_time_open:    { params: [] as const },                                            // 시각 고르는 자리를 폈다
  notify_time_set:     { params: ['hour', 'changed'] as const },                           // hour: 0~23, changed: 기본값에서 바꿨나
  // 설정 화면. 어떤 줄을 실제로 누르는지 본다. 안 눌리는 줄은 다음 판에서 뺀다
  settings_view:       { params: ['notify_state', 'text_size'] as const },                 // notify_state: unset | on | declined | unsupported
  settings_row_click:  { params: ['row'] as const },                                       // row: privacy | terms | contact | app_info | pass_restore
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
  save_gate_conv:   { name: '간직 광고 수락률',          num: 'save_gate_accept', den: 'save_gate_view', target: '낮으면 간직을 막고 선 것이다' },
  save_conv:        { name: '누른 뒤 실제로 담김',        num: 'save_complete', den: 'save_click', target: '광고가 중간에서 얼마나 떨구는지 본다' },
  save_done_conv:   { name: '담고 나서 보러 감',          num: 'save_done_action(action=archive)', den: 'save_done_view', target: '낮으면 보관함이 다시 안 읽히는 자리다' },
  favorite_rate:    { name: '즐겨찾기 비율',             num: 'archive_favorite(on=true)', den: 'save_complete', target: '간직과 즐겨찾기가 갈리는지 본다' },
  gen_ad_cost:      { name: '생성 중 광고의 대가',        num: 'friction_generation_abandon', den: 'concern_submit', target: 'placement=generation 을 켜기 전후로 비교한다' },
  // ── 첫 사용 무료의 본전. 이 셋이 없으면 「광고를 언제부터 띄울까」를 숫자로 못 정한다 ──
  /**
   * 첫 답을 받은 사람 중 몇 %가 두 번째 답까지 오는가.
   *
   * **손익분기는 `p = C / (R − C)` 다.** C 는 LLM 한 건 원가(NORMAL $0.001756 ·
   * DEEP $0.002358, `MODELS.md` 실측), R 은 광고 한 편 수익(eCPM ÷ 1000)이다.
   * 첫 사용에 광고가 없으니 그 한 건은 통째로 손실이고, 두 번째 사용의 광고가 그것까지 갚는다.
   *
   * 여기서 나오는 선 하나: **R ≥ 2C 가 아니면 전환율 100% 여도 적자다.**
   * C ≈ $0.002 이므로 eCPM 이 $4(약 5,600원) 아래면 이 정책 자체가 성립하지 않는다.
   * eCPM $8 이면 33%, $10 이면 25% 가 필요하다.
   */
  second_use_conv:  { name: '두 번째 사용 전환율',        num: 'answer_milestone(answers_total=2)', den: 'answer_milestone(answers_total=1)', target: 'p = C / (R − C). eCPM $8 기준 33%' },
  ad_skip_reason:   { name: '광고를 건너뛴 이유',         num: 'ad_skipped(reason=X)', den: 'ad_skipped', target: 'no_group 이 남아 있으면 콘솔에서 그룹을 아직 안 준 것이다' },
  ads_per_paid_use: { name: '두 번째부터의 광고 노출',    num: 'rewarded_ad_complete', den: 'answer_milestone(answers_total≥2)', target: '1 에 가까울수록 첫 사용 손실을 빨리 갚는다' },
  ad_complete:      { name: '광고 완료율',              num: 'rewarded_ad_complete', den: 'rewarded_ad_start', target: '' },
  ads_per_answer:   { name: 'Answer 당 광고 노출',       num: 'rewarded_ad_complete', den: 'answer_generated(pass=2|light)', target: '' },
  arpdau:           { name: 'ARPDAU',                  num: '콘솔 광고 수익 + 결제', den: 'DAU', target: '' },
  llm_cost_per_dau: { name: 'LLM cost / DAU',          num: 'Σ model_cost_estimate', den: 'DAU', target: '광고매출 / LLM비용 ≥ 1.5' },
  paywall_conv:     { name: 'Paywall 전환',            num: 'purchase_complete', den: 'paywall_view', target: '' },
  d1: { name: 'D1', num: 'app_open(days_since_first_open=1)', den: 'app_open(is_first_open)', target: '' },
  d7: { name: 'D7', num: 'app_open(days_since_first_open=7)', den: 'app_open(is_first_open)', target: '' },
  requestion:       { name: '재질문율',                num: 'second_question_start', den: 'answer_generated(pass=2|light) unique users', target: '' },
  daily_quote:      { name: '오늘의 한마디 재방문',      num: 'daily_quote_open', den: 'daily_quote_impression', target: '' },
  tomorrow_ask_conv:{ name: '내일 물어봐 달라고 함',      num: 'tomorrow_ask_accept', den: 'tomorrow_ask_view', target: '행동을 가져갈 마음이 있었는지 본다' },
  recall:           { name: '지난 고민 회고 클릭률',     num: 'recall_card_click', den: 'recall_card_impression', target: '' },
  recall_done:      { name: '실제로 해 봤다고 답함',      num: 'recall_card_click(done=true)', den: 'recall_card_click', target: '이 앱이 행동까지 갔는지 재는 유일한 답이다' },
  viral_share:      { name: '공유 완료 / 답변 생성',     num: 'share_complete', den: 'answer_generated(pass=2|light)', target: '' },
  share_scope_mix:  { name: '전체 공유 비율',            num: 'share_scope_select(scope=full)', den: 'share_scope_select', target: '무엇을 보내고 싶어 하는지 본다' },
  app_share_conv:   { name: '앱 권유 수락률',            num: 'app_share_complete', den: 'app_share_view', target: '' },
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
  k_factor:         { name: 'K-factor',               num: '((share_complete + app_share_complete) / DAU) × (share_landing_cta / share_landing_open)', den: '', target: '1 을 넘으면 자생한다' },
  organic_ratio:    { name: '자생 유입 비율',           num: 'app_open(is_first_open, entry=share_link)', den: 'app_open(is_first_open)', target: '' },
  margin_per_dau:   { name: '한 명당 기여이익',         num: '광고수익 + 결제수익 − Σ model_cost_estimate', den: 'DAU', target: '> 0 이어야 사용자를 더 받을 수 있다' },
} as const;

/**
 * 분석에서 쓰는 사용자 묶음. 정의를 코드 한 곳에 둬서 대시보드마다 달라지지 않게 한다.
 * 기준값은 실측 뒤에 고친다. 고칠 때는 여기만 고친다.
 */
export const COHORTS = {
  /** 값을 실제로 느낀 사람. 이 비율이 Carrying Capacity 의 바닥이다 */
  healthy_activated: 'answer_read_70 OR action_view OR share_complete OR save_complete',
  /** 수익화 표면까지 온 사람 */
  monetizable: 'rewarded_ad_start OR paywall_view',
  /** 그날 번 것이 그날 쓴 것보다 큰 사용자-일 */
  profitable_user_day: '(광고수익 + 결제수익) > Σ model_cost_estimate',
} as const;
