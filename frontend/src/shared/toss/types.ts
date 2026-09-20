/**
 * 미니앱 브릿지 계약.
 *
 * 화면과 feature 는 이 타입만 알면 된다. Apps in Toss SDK 의 이름·시그니처·에러 클래스는
 * 이 파일 바깥으로 새어나가지 않는다. 브라우저에서 개발할 때는 같은 계약의 Mock 이 붙는다.
 */

export type BridgeEnvironment = 'toss' | 'sandbox' | 'browser';

export type BridgePlatform = 'ios' | 'android' | 'web';

/** 브릿지가 노출하는 기능 단위. supports() 로 지원 여부를 먼저 묻는다. */
export type BridgeCapability =
  | 'identity'
  | 'albumPick'
  | 'camera'
  | 'storage'
  | 'networkStatus'
  | 'safeArea'
  | 'navigationAccessory'
  | 'ads'
  /** 전면(보상형) 광고. 배너와 지원 여부가 따로 갈린다. */
  | 'fullScreenAd'
  /** 인앱결제. 토스 앱 5.219.0 부터다. */
  | 'purchase'
  | 'notification'
  | 'analytics'
  /** 네이티브 공유 시트. 카톡·메시지·메일이 여기서 갈린다. */
  | 'share';

/**
 * 토스 알림 동의 요청의 결과.
 *
 * `agreementRejected` 도 오류가 아니라 결과의 한 종류다. 사용자가 안 받겠다고 고른 것이라
 * 다시 묻지 않는다. 값 이름은 SDK 가 주는 것을 그대로 쓴다.
 */
export type NotificationAgreementResult = 'newAgreement' | 'alreadyAgreed' | 'agreementRejected';

/** 앨범·카메라가 돌려주는 이미지. dataUri 는 base64 data URL 이다. */
export interface PickedImage {
  id: string;
  dataUri: string;
}

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type NetworkStatus = 'OFFLINE' | 'WIFI' | '2G' | '3G' | '4G' | '5G' | 'WWAN' | 'UNKNOWN';

/** 익명 사용자 식별키. 로그인 화면 없이 사용자를 구분하는 유일한 수단이다. */
export interface Identity {
  /** 토스가 미니앱별로 발급하는 해시. 서버의 user 조회 키로 쓴다. */
  key: string;
  source: 'toss-anonymous' | 'mock';
}

/**
 * 브릿지가 실패를 알리는 방식. SDK 의 에러 클래스를 그대로 던지지 않고 이 코드로 바꾼다.
 * 화면은 코드만 보고 어떤 빈 상태를 그릴지 정한다.
 */
export type BridgeErrorCode =
  /** 이 토스 앱 버전에서 못 쓰는 기능 */
  | 'UNSUPPORTED'
  /** 사용자가 권한을 거부함 */
  | 'PERMISSION_DENIED'
  /** 사용자가 선택·촬영을 취소함 */
  | 'CANCELLED'
  /** 그 외 */
  | 'UNKNOWN';

export class BridgeError extends Error {
  readonly code: BridgeErrorCode;
  readonly detail: unknown;

  constructor(code: BridgeErrorCode, message: string, detail?: unknown) {
    super(message);
    this.name = 'BridgeError';
    this.code = code;
    this.detail = detail;
  }
}

export interface PickPhotosOptions {
  /** 한 번에 고를 수 있는 최대 장수. */
  maxCount?: number;
  /** 긴 변 기준 최대 픽셀. 업로드 용량을 줄이려고 항상 지정한다. */
  maxWidth?: number;
}

export interface CaptureOptions {
  maxWidth?: number;
}

/** 키-값 저장소. 오프라인 임시 저장과 마지막 사용 입력 방식 기억에 쓴다. */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface BannerHandle {
  destroy(): void;
}

export type BannerVariant = 'card' | 'expanded';

export interface AttachBannerOptions {
  variant?: BannerVariant;
  tone?: 'blackAndWhite' | 'grey';
  theme?: 'auto' | 'light' | 'dark';
  onRendered?(slotId: string): void;
  /** 노출된 광고가 없음. 자리를 비워두지 말고 슬롯 자체를 접는다. */
  onNoFill?(): void;
  onFailed?(message: string): void;
}

/**
 * 전면 광고가 어떻게 끝났나.
 *
 * `watched` 는 보상 이벤트(`userEarnedReward`)를 받은 것 하나뿐이다. 뜨기만 했거나 눌린 것은
 * 보상이 아니다.
 *
 * ── `dismissed` 와 `noFill` 을 왜 가르나 ─────────────────────────────
 *
 * 둘을 `failed` 하나로 묶었더니 **사람이 닫은 것과 광고가 아예 안 뜬 것을 화면이 구분하지
 * 못했다.** 앞엣것은 「보기 싫다」는 뜻이라 하던 일을 멈추는 것이 맞고, 뒤엣것은 우리 쪽
 * 사정이라 광고 없이 그냥 보내 주어야 한다. 묶어 두면 광고를 한 장도 못 받는 기기에서
 * 사람이 시트 앞에 갇힌다.
 */
export type FullScreenAdResult = 'watched' | 'dismissed' | 'noFill';

export interface FullScreenAdHooks {
  onShown?: () => void;
}

export interface AdsBridge {
  /** 배너를 붙이기 전에 한 번 호출한다. 멱등이다. */
  initialize(): Promise<void>;
  attachBanner(adGroupId: string, target: HTMLElement, options?: AttachBannerOptions): BannerHandle;
  /**
   * 전면 광고를 불러와서 띄우고, 닫힐 때까지 기다린다.
   *
   * 던지지 않는다. 못 띄운 것은 `noFill` 로 돌려주고 부르는 쪽이 갈래를 정한다.
   * 광고가 안 떴다고 기능을 막으면 광고 서버 사정으로 사람이 돌아간다.
   *
   * `onShown` 은 광고가 실제로 화면에 뜬 순간이다. 누른 순간과 다르다. 불러오는 데만
   * 몇 초가 걸리기도 해서, 광고가 몇 초 떠 있었는지는 이 순간부터 재야 맞다.
   */
  showFullScreen(adGroupId: string, hooks?: FullScreenAdHooks): Promise<FullScreenAdResult>;
}

/**
 * 결제 한 건의 끝.
 *
 * 던지지 않는다. 취소도 실패도 결과의 한 종류라 부르는 쪽이 갈래만 고른다.
 * `cancelled` 는 사용자가 주문서에서 그냥 나온 것이라 아무 일도 일어나면 안 된다.
 */
export type PurchaseResult =
  | { status: 'completed'; orderId: string }
  | { status: 'cancelled' }
  | { status: 'failed'; reason: 'unsupported' | 'error' };

/** 결제가 끝난 주문 하나. */
export interface PurchaseOrder {
  sku: string;
  orderId: string;
  /**
   * 돈은 받았는데 상품을 아직 못 준 주문.
   * 앱이 지급하고 completeGrant 로 알려 줘야 이 표시가 풀린다.
   */
  pending: boolean;
}

/**
 * 인앱결제.
 *
 * 무엇을 샀는지는 기기가 아니라 토스 쪽에 남는다. 그래서 재설치·기기 변경 뒤에도
 * `restore()` 로 되찾을 수 있고, 환불도 같은 자리에서 반영된다.
 */
export interface PurchaseBridge {
  /**
   * 비소모품 하나를 산다. 주문서가 뜨고 흐름이 끝날 때까지 기다린다.
   *
   * `grant` 는 「돈을 받았으니 이제 상품을 주라」는 신호다. 여기서 실제로 지급하고
   * 성공했으면 true 를 돌려준다. false 를 주면 토스가 그 주문을 미지급으로 남겨 두고,
   * 다음 실행에서 `restore()` 의 pending 주문으로 다시 온다.
   */
  buy(sku: string, grant: (orderId: string) => Promise<boolean>): Promise<PurchaseResult>;

  /**
   * 토스에 남은 주문 이력을 읽는다. 환불된 주문은 빠져서 온다.
   *
   * 기기 저장이 아니라 이 값이 보유의 근거다. 실패하면 던진다. 부르는 쪽이 「모른다」와
   * 「없다」를 갈라야 해서, 못 읽은 것을 빈 배열로 돌려주면 안 된다.
   */
  restore(): Promise<PurchaseOrder[]>;

  /** 지급을 끝냈다고 토스에 알린다. 안 알리면 대기 주문으로 남는다. */
  completeGrant(orderId: string): Promise<boolean>;
}

/**
 * 네이티브 공유 시트 한 번의 끝.
 *
 * `dismissed` 는 시트는 떴는데 아무 데도 안 보내고 닫은 것이다. 실패가 아니라 사람이
 * 고른 결과라 부르는 쪽이 오류를 보이면 안 된다. 시트 자체를 못 연 것만 `unsupported` 다.
 */
export type ShareResult = 'sent' | 'dismissed' | 'unsupported';

/**
 * 공유.
 *
 * 토스가 여는 네이티브 시트라 받는 사람 목록(카톡·메시지·메일·AirDrop)은 기기가 정한다.
 * 우리는 보낼 글만 넘긴다. **그 글에 고민 원문이 들어가지 않는 것은 부르는 쪽 책임이다.**
 *
 * ⚠ 시트가 어디로 보냈는지는 돌려주지 않는다. iOS·안드로이드 모두 앱을 알려 주지 않아서,
 * 우리가 아는 것은 「보냈다」와 「그냥 닫았다」뿐이다. 어느 메신저로 갔는지는 셀 수 없다.
 */
export interface ShareBridge {
  /** 시스템 공유 시트를 연다. 던지지 않는다. */
  sendMessage(message: string): Promise<ShareResult>;
  /**
   * 이 미니앱을 여는 주소. 못 만들면 null 이고, 그러면 메시지에 주소를 안 붙인다.
   *
   * 토스가 만들어 주는 https 주소다. 받는 사람에게 토스가 깔려 있으면 앱이 열려 이
   * 미니앱으로 바로 오고, 없으면 앱스토어·플레이스토어로 간다. 그래서 카톡으로 받은
   * 사람도 막다른 곳에 서지 않는다. 던지지 않는다.
   */
  appLink(): Promise<string | null>;
}

/**
 * 행동 로그 한 줄에 실을 값.
 *
 * 문자열·숫자·불리언만 받는다. 중첩 객체를 허용하면 언젠가 응답 본문이 통째로 실린다.
 * `undefined` 는 SDK 가 알아서 빼므로 부르는 쪽이 조건문으로 나누지 않아도 된다.
 */
export type AnalyticsParams = Record<string, string | number | boolean | undefined>;

/**
 * 무슨 종류의 로그인가. 토스 SDK 가 정한 값이라 우리가 늘리지 않는다.
 *
 * `screen` 화면 진입 · `click` 누름 · `impression` 노출 · `event` 그 밖의 사실.
 */
export type AnalyticsKind = 'screen' | 'click' | 'impression' | 'event';

/**
 * 행동 로그를 보내는 자리.
 *
 * **실패해도 던지지 않는다.** 로그가 안 가는 것보다 기록이 막히는 쪽이 훨씬 나쁘다.
 * 미지원 앱 버전에서는 SDK 가 조용히 무시하고, 브라우저에서는 목이 콘솔에만 남긴다.
 */
export interface AnalyticsBridge {
  log(kind: AnalyticsKind, name: string, params?: AnalyticsParams): void;
}

/** 남긴 행동 로그 한 줄. 운영 판이 아닐 때만 창에 쌓인다. */
export interface RecordedLog {
  kind: AnalyticsKind;
  name: string;
  params: AnalyticsParams;
}

declare global {
  interface Window {
    /**
     * 브라우저·샌드박스에서만 있는 로그 사본.
     *
     * 토스 SDK 는 운영 판에서만 실제로 로그를 보내고, 그 밖에서는 조용히 삼킨다.
     * 그래서 개발 중에도 e2e 에서도 "무엇이 찍혔나" 를 볼 방법이 없었다.
     * 여기 쌓아 두면 눈으로도 보고 테스트로도 본다. 운영 판에서는 채우지 않는다.
     */
    __pocketLogs?: RecordedLog[];
  }
}

/** 운영 판이 아닐 때 로그를 창에 남긴다. 실패해도 아무 일도 일어나지 않는다. */
export function recordLog(
  environment: BridgeEnvironment,
  kind: AnalyticsKind,
  name: string,
  params: AnalyticsParams,
): void {
  if (environment === 'toss' || typeof window === 'undefined') return;
  (window.__pocketLogs ??= []).push({ kind, name, params });
}

export interface NavigationAccessory {
  id: string;
  title: string;
  /** 토스가 제공하는 아이콘 이름. 임의 이미지가 아니다. */
  iconName: string;
}

export interface MiniAppBridge {
  readonly environment: BridgeEnvironment;
  readonly platform: BridgePlatform;
  /** 토스 앱 버전. 브라우저에서는 빈 문자열. */
  readonly appVersion: string;
  /**
   * 기기 고유 식별자. **진단 화면에만 보여 주고 로그·서버로는 보내지 않는다.**
   * 이 값이 로그에 실리면 익명 집계가 기기 단위 추적이 된다. 브라우저에서는 빈 문자열.
   */
  readonly deviceId: string;
  /** 지금 돌고 있는 번들. 개발에서는 'local', 브라우저에서는 빈 문자열. */
  readonly deploymentId: string;

  supports(capability: BridgeCapability): boolean;

  /**
   * 그 기능을 쓰려면 토스 앱이 적어도 몇이어야 하는지. 버전으로 갈리지 않으면 null.
   *
   * 못 쓰는 화면이 "업데이트하세요" 만 말하면, 이미 최신인 사람은 무엇을 해야 할지 모른다.
   * 숫자를 알면 지금 버전과 견줘 보고 정말 업데이트 문제인지 스스로 가를 수 있다.
   */
  minAppVersion(capability: BridgeCapability): string | null;

  /** 실패하면 BridgeError 를 던진다. 호출부는 반드시 감싼다. */
  getIdentity(): Promise<Identity>;

  /** 취소하면 빈 배열을 돌려준다. 권한 거부는 BridgeError('PERMISSION_DENIED'). */
  pickPhotos(options?: PickPhotosOptions): Promise<PickedImage[]>;

  /** 취소하면 null 을 돌려준다. */
  captureReceipt(options?: CaptureOptions): Promise<PickedImage | null>;

  /**
   * 토스 알림 동의를 묻는다. **사용자가 알림을 켜는 그 순간에만 부른다.**
   *
   * `templateCode` 는 토스 콘솔 스마트발송 템플릿 코드다. 거절도 결과의 한 종류라 던지지
   * 않는다. 이 버전에서 못 쓰거나 템플릿 코드가 없으면 BridgeError('UNSUPPORTED').
   */
  requestNotificationAgreement(templateCode: string): Promise<NotificationAgreementResult>;

  getSafeAreaInsets(): SafeAreaInsets;
  subscribeSafeArea(listener: (insets: SafeAreaInsets) => void): () => void;

  getNetworkStatus(): Promise<NetworkStatus>;

  /** 상단 네비게이션 바 우측 버튼. 앱이 자체 상단바를 그리지 않기 위한 통로다. */
  setNavigationAccessory(accessory: NavigationAccessory | null): Promise<void>;
  onNavigationAccessoryPress(listener: (id: string) => void): () => void;

  /**
   * 시스템 뒤로가기.
   *
   * ⚠ 구독하는 순간 플랫폼 기본 뒤로가기가 막힌다. 구독했으면 화면 이동과 앱 종료를 우리가 전부 처리해야 한다.
   * 앱 전체에서 한 곳만 구독한다.
   */
  subscribeBackPress(listener: () => void): () => void;

  /** 미니앱을 닫는다. 첫 화면에서 뒤로가기를 눌렀을 때 호출한다. */
  closeApp(): Promise<void>;

  readonly storage: KeyValueStore;
  readonly ads: AdsBridge;
  readonly purchase: PurchaseBridge;
  readonly analytics: AnalyticsBridge;
  readonly share: ShareBridge;
}
