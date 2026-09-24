/**
 * 화면 셀렉터 정본. 제품 코드와 e2e 가 이 상수를 같이 import 한다.
 * e2e 가 문자열을 손으로 적으면 이름이 바뀔 때 조용히 못 찾는다.
 */

export const TEST_IDS = {
  // 온보딩
  onboarding: 'onboarding',
  onboardingStep1: 'onboarding-step-1',
  onboardingStep2: 'onboarding-step-2',
  onboardingNext: 'onboarding-next',
  onboardingSkip: 'onboarding-skip',

  // 홈 · 입력
  home: 'home',
  entryCard: 'entry-card',
  entryCardClose: 'entry-card-close',
  entryCardCta: 'entry-card-cta',
  concernField: 'concern-field',
  depthDots: 'depth-dots',
  depthLabel: 'depth-label',
  exampleChip: 'example-chip',
  submit: 'submit',
  draftCard: 'draft-card',
  returnCard: 'return-card',
  recallCard: 'recall-card',
  reviewCard: 'review-card',
  reviewCardAccept: 'review-card-accept',
  reviewCardLater: 'review-card-later',
  leafChip: 'leaf-chip',
  dailyCard: 'daily-card',
  dailySheet: 'daily-sheet',

  // 대기
  loading: 'loading',
  loadingLabel: 'loading-label',

  // 답변
  answer: 'answer',
  answerTags: 'answer-tags',
  buddhaMessage: 'buddha-message',
  scriptureCard: 'scripture-card',
  scriptureText: 'scripture-text',
  scriptureCitation: 'scripture-citation',
  scriptureOriginal: 'scripture-original',
  scriptureCredit: 'scripture-credit',
  explanation: 'explanation',
  analysis: 'analysis',
  actions: 'actions',
  closing: 'closing',
  extensionCard: 'extension-card',
  extensionCta: 'extension-cta',
  extensionResult: 'extension-result',
  termChip: 'term-chip',
  termSheet: 'term-sheet',
  bottomBar: 'bottom-bar',
  shareButton: 'share-button',
  saveButton: 'save-button',
  againButton: 'again-button',
  keepNote: 'keep-note',
  reportLink: 'report-link',

  // LIGHT · INVALID
  light: 'light',
  lightCta: 'light-cta',
  invalid: 'invalid',
  invalidRetry: 'invalid-retry',

  // 위기 · 위로
  crisis: 'crisis',
  crisisChannel: 'crisis-channel',
  crisisContinue: 'crisis-continue',
  crisisClose: 'crisis-close',
  solace: 'solace',
  solaceOpening: 'solace-opening',
  solaceClosing: 'solace-closing',

  // 광고 · 사용량
  adBadge: 'ad-badge',

  // 연꽃. 키 이름이 leaf 인 것은 이벤트·저장소 이름을 그대로 둔 것과 같은 이유다
  leafSheet: 'leaf-sheet',
  leafSheetCount: 'leaf-sheet-count',
  leafWatch: 'leaf-watch',
  leafEarned: 'leaf-earned',
  leafUnavailable: 'leaf-unavailable',
  leafNote: 'leaf-note',
  leafCollectCta: 'leaf-collect-cta',
  leafSpendContinue: 'leaf-spend-continue',
  leafSpendExtension: 'leaf-spend-extension',
  leafSpendSave: 'leaf-spend-save',
  leafSpentToast: 'leaf-spent-toast',
  settingsLeaf: 'settings-leaf',
  settingsAppShare: 'settings-app-share',
  continueSheet: 'continue-sheet',
  continueWatch: 'continue-watch',

  // 공유 · 보관
  shareSheet: 'share-sheet',
  shareCard: 'share-card',
  shareLink: 'share-link',
  shareImage: 'share-image',
  shareText: 'share-text',
  shareCopy: 'share-copy',
  shareScopeScripture: 'share-scope-scripture',
  shareScopeFull: 'share-scope-full',
  shareFullNote: 'share-full-note',
  shareFullPreview: 'share-full-preview',

  // 성장. 사람이 부탁하지 않은 말이라 한 번씩만 뜨고, 한 화면에 둘이 겹치지 않는다
  homeAdd: 'home-add',
  homeAddClose: 'home-add-close',
  appShare: 'app-share',
  appShareSend: 'app-share-send',
  notifyNudge: 'notify-nudge',
  notifyNudgeAccept: 'notify-nudge-accept',
  nudgeClose: 'nudge-close',
  landing: 'landing',
  archive: 'archive',
  archiveItem: 'archive-item',
  archiveDetail: 'archive-detail',
  archiveDelete: 'archive-delete',
  archiveDeleteConfirm: 'archive-delete-confirm',
  archiveFavorite: 'archive-favorite',
  archiveFilter: 'archive-filter',
  archiveMore: 'archive-more',
  archiveShare: 'archive-share',
  archiveAppShare: 'archive-app-share',
  archiveAppShareSend: 'archive-app-share-send',
  archiveAppShareClose: 'archive-app-share-close',
  paywall: 'paywall',
  paywallBuy: 'paywall-buy',
  saveGate: 'save-gate',
  saveGateWatch: 'save-gate-watch',
  saveGateBuy: 'save-gate-buy',
  saveDone: 'save-done',
  saveDoneArchive: 'save-done-archive',
  saveDoneStay: 'save-done-stay',

  // 설정
  settingsButton: 'settings-button',
  settings: 'settings',
  archivePass: 'archive-pass',
  archivePassRestore: 'archive-pass-restore',
  appInfo: 'app-info',
  privacy: 'privacy',
  helpLines: 'help-lines',
  adOptOut: 'ad-opt-out',
  textSize: 'text-size',
  textSizeOption: 'text-size-option',
  settingsHomeAdd: 'settings-home-add',
  settingsNotify: 'settings-notify',
  settingsNotifyTime: 'settings-notify-time',
  settingsNotifyTimeOption: 'settings-notify-time-option',

  // 공통
  sheetClose: 'sheet-close',
  sheetDim: 'sheet-dim',
  errorState: 'error-state',
  retry: 'retry',

  // CX 계측이 더한 자리
  feedbackUp: 'feedback-up',
  feedbackDown: 'feedback-down',
  feedbackThanks: 'feedback-thanks',
  negativeReasonSheet: 'negative-reason-sheet',
  negativeReasonOption: 'negative-reason-option',
  actionCommit: 'action-commit',
  debugEvents: 'debug-events',

  // 내일 물어보기. 「오늘 이것만 해볼게요」 자리를 이어받았다
  tomorrowAsk: 'tomorrow-ask',
  tomorrowAskDone: 'tomorrow-ask-done',
  recallSheet: 'recall-sheet',
  recallYes: 'recall-yes',
  recallNo: 'recall-no',

  // 쓰던 글을 지울지 묻는 자리
  draftConfirm: 'draft-confirm',
  draftConfirmClear: 'draft-confirm-clear',
  draftConfirmKeep: 'draft-confirm-keep',

  // 쓰던 글을 아무 때나 통째로 지우는 자리
  draftClear: 'draft-clear',
  draftClearConfirm: 'draft-clear-confirm',
  draftClearCancel: 'draft-clear-cancel',
} as const;

export type TestId = (typeof TEST_IDS)[keyof typeof TEST_IDS];

/** JSX 에 그대로 펼친다: `<div {...testId(TEST_IDS.home)}>` */
export function testId(id: TestId) {
  return { 'data-testid': id };
}
