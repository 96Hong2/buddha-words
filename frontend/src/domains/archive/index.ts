/** answer 화면이 간직하기에서 쓰는 입구. 화면 컴포넌트를 건너 함수만 가져간다 */
export {
  saveAnswer,
  listSaved,
  countSaved,
  countFavorites,
  isSaved,
  removeSaved,
  toggleFavorite,
  type SavedAnswer,
  type SavedDetail,
  type SavedInput,
  type SaveResult,
} from './archiveStore';
export { Paywall, type PaywallProps, type PurchaseOutcome } from './Paywall';
export { SaveGate, type SaveGateProps } from './SaveGate';
export { SaveDone, type SaveDoneKind, type SaveDoneProps } from './SaveDone';
export { ArchiveItem, type ArchiveItemProps } from './ArchiveItem';
export { ArchiveDetail, type ArchiveDetailProps } from './ArchiveDetail';
export { ArchiveScreen } from './ArchiveScreen';
