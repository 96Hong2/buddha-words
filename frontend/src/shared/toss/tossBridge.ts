import {
  Analytics,
  Device,
  Environment,
  IAP,
  Notification,
  PermissionError,
  SafeArea,
  Screen,
  Share,
  Storage,
  TossAds,
  User,
  graniteEvent,
  loadFullScreenAd,
  partner,
  showFullScreenAd,
  tdsEvent,
} from '@apps-in-toss/web-framework';

import {
  BridgeError,
  recordLog,
  type AdsBridge,
  type AnalyticsBridge,
  type AnalyticsKind,
  type AnalyticsParams,
  type AttachBannerOptions,
  type BannerHandle,
  type BridgeCapability,
  type BridgeEnvironment,
  type BridgePlatform,
  type CaptureOptions,
  type FullScreenAdResult,
  type Identity,
  type KeyValueStore,
  type MiniAppBridge,
  type NavigationAccessory,
  type NetworkStatus,
  type NotificationAgreementResult,
  type PickPhotosOptions,
  type PickedImage,
  type PurchaseBridge,
  type PurchaseOrder,
  type PurchaseResult,
  type SafeAreaInsets,
  type ShareBridge,
  type ShareResult,
} from './types';

const DEFAULT_MAX_WIDTH = 1600;
const DEFAULT_MAX_COUNT = 5;

/**
 * SDK 가 던지는 것을 브릿지 에러로 옮긴다. 화면은 SDK 에러 이름을 몰라야 한다.
 *
 * ⚠ 메시지 문자열로 판정하지 않는다. SDK 의 실제 메시지는 한국어 안내문이라
 * 'unsupported' 나 'permission' 같은 영어 단어가 들어 있지 않다.
 * - 미지원: `error.name === 'UNSUPPORTED_APP_VERSION'`(OS 부족이면 `UNSUPPORTED_OS_VERSION`)
 * - 권한 거부: `error instanceof PermissionError` (하위 클래스 전부 포함)
 */
function toBridgeError(error: unknown, fallback: string): BridgeError {
  if (error instanceof PermissionError) {
    return new BridgeError('PERMISSION_DENIED', error.message, error);
  }
  if (error instanceof Error && UNSUPPORTED_ERROR_NAMES.has(error.name)) {
    return new BridgeError('UNSUPPORTED', error.message, error);
  }
  return new BridgeError('UNKNOWN', fallback, error);
}

const UNSUPPORTED_ERROR_NAMES = new Set(['UNSUPPORTED_APP_VERSION', 'UNSUPPORTED_OS_VERSION']);

class TossStorage implements KeyValueStore {
  get(key: string) {
    return Storage.getItem(key);
  }
  set(key: string, value: string) {
    return Storage.setItem(key, value);
  }
  remove(key: string) {
    return Storage.removeItem(key);
  }
}

/**
 * 토스 공식 Analytics 로 행동 로그를 보낸다.
 *
 * 별도 분석 도구를 붙이지 않는다. 이미 있는 수집 경로 하나를 쓴다.
 * SDK 는 sandbox 에서 콘솔에만 남기고, 낮은 앱 버전에서는 조용히 무시한다. 둘 다 우리가
 * 바라는 동작이라 갈라 다루지 않는다.
 */
class TossAnalyticsBridge implements AnalyticsBridge {
  log(kind: AnalyticsKind, name: string, params: AnalyticsParams = {}): void {
    // 운영이 아닌 판에서는 SDK 가 조용히 삼킨다. 무엇이 찍혔는지 볼 수 있게 사본을 남긴다.
    recordLog(Environment.environment, kind, name, params);
    // 로그는 부수적인 일이다. 여기서 던지면 기록·저장이 멈춘다.
    void Promise.resolve()
      .then(() => Analytics.log({ log_type: kind, log_name: name, params }))
      .catch(() => {});
  }
}

/**
 * 전면 광고를 불러오는 데 주는 시간.
 *
 * 개발자 커뮤니티에 `loaded` 도 `onError` 도 없이 90초를 기다린 사례가 여럿이다.
 * 그동안 버튼이 죽어 있으면 사람은 앱이 멈춘 줄 안다. 이 시간이 지나면 못 띄운 것으로 치고
 * 부르는 쪽이 광고 없이 지나가게 둔다.
 */
const FULL_SCREEN_LOAD_TIMEOUT_MS = 8_000;

class TossAdsBridge implements AdsBridge {
  private initialized: Promise<void> | null = null;

  initialize(): Promise<void> {
    // initialize 는 SDK 상 멱등이지만, 우리 쪽에서도 한 번만 대기하도록 promise 를 캐시한다.
    // 실패한 promise 는 캐시하지 않는다. 일시적인 스크립트 로드 실패 한 번으로
    // 세션 내내 배너 자리가 접힌 채로 남으면 안 된다.
    this.initialized ??= new Promise<void>((resolve, reject) => {
      if (!TossAds.initialize.isSupported()) {
        reject(new BridgeError('UNSUPPORTED', '이 토스 앱 버전에서는 배너 광고를 쓸 수 없어요.'));
        return;
      }
      TossAds.initialize({
        callbacks: {
          onInitialized: () => resolve(),
          onInitializationFailed: (error) =>
            reject(new BridgeError('UNKNOWN', '배너 광고를 준비하지 못했어요.', error)),
        },
      });
    }).catch((error: unknown) => {
      this.initialized = null;
      throw error;
    });
    return this.initialized;
  }

  attachBanner(
    adGroupId: string,
    target: HTMLElement,
    options: AttachBannerOptions = {},
  ): BannerHandle {
    if (!TossAds.attachBanner.isSupported()) {
      options.onFailed?.('이 토스 앱 버전에서는 배너 광고를 쓸 수 없어요.');
      return { destroy: () => {} };
    }
    return TossAds.attachBanner(adGroupId, target, {
      variant: options.variant ?? 'card',
      tone: options.tone,
      theme: options.theme ?? 'auto',
      callbacks: {
        onAdRendered: (payload) => options.onRendered?.(payload.slotId),
        onNoFill: () => options.onNoFill?.(),
        onAdFailedToRender: (payload) => options.onFailed?.(payload.error.message),
      },
    });
  }

  showFullScreen(adGroupId: string): Promise<FullScreenAdResult> {
    if (!loadFullScreenAd.isSupported() || !showFullScreenAd.isSupported()) {
      return Promise.resolve('failed');
    }
    return new Promise<FullScreenAdResult>((resolve) => {
      let settled = false;
      // 로드 구독을 끊는 함수. 콜백이 먼저 돌 수 있어 값이 늦게 들어온다.
      let cancelLoad: (() => void) | undefined;
      let loadCancelled = false;

      /** 로드를 그만 기다린다. 두 번 불러도 한 번만 끊긴다. */
      const stopLoading = () => {
        if (loadCancelled) return;
        loadCancelled = true;
        cancelLoad?.();
      };

      const finish = (result: FullScreenAdResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        stopLoading();
        resolve(result);
      };
      const timer = setTimeout(() => finish('failed'), FULL_SCREEN_LOAD_TIMEOUT_MS);

      const show = () => {
        // 시간 제한은 불러오는 데까지만이다. 광고가 떴는데 8초가 지났다고 실패로 접으면,
        // 끝까지 본 사람이 보상을 못 받는다.
        clearTimeout(timer);
        showFullScreenAd({
          options: { adGroupId },
          onEvent: (event) => {
            // 보상은 `userEarnedReward` 하나에서만 나온다. 떴다·노출됐다·눌렸다는 보상이 아니다.
            // 닫힘은 언제나 취소다. 뜨자마자 닫은 사람에게 보상을 주면 무효 트래픽으로 잡혀
            // 광고 계정이 막힌다. 샌드박스 목이 보상 이벤트를 안 준다고 여기서 타협하지 않는다.
            if (event.type === 'userEarnedReward') finish('watched');
            if (event.type === 'dismissed' || event.type === 'failedToShow') finish('failed');
          },
          onError: () => finish('failed'),
        });
      };

      cancelLoad = loadFullScreenAd({
        options: { adGroupId },
        onEvent: (event) => {
          // 시간이 다 돼 실패로 끝낸 뒤에 오는 loaded 는 버린다. 화면은 이미 다음으로 넘어갔고,
          // 여기서 띄우면 보상도 없는 광고가 엉뚱한 자리에서 튀어나온다.
          if (loadCancelled) return;
          if (event.type === 'loaded') show();
        },
        onError: () => finish('failed'),
      });
      // 콜백이 먼저 끝났으면 위 구독 값이 아직 없었다. 여기서 한 번 더 끊는다.
      if (loadCancelled) cancelLoad();
    });
  }
}

/**
 * 「사지 않고 나온 것 같다」고 읽은 뒤에도 주문서 구독을 붙들고 있는 시간.
 *
 * 주문서가 올리는 이벤트 이름이 SDK 에 선언돼 있지 않다. 그래서 모르는 이벤트 하나로
 * 구독을 끊으면, 그것이 결제 도중의 중간 신호였을 때 뒤늦게 오는 지급 요청을 못 받는다.
 * 돈은 빠져나갔는데 이용권이 안 열리는 것이 이 배선에서 가장 나쁜 결말이라, 화면은 먼저
 * 풀어 주고 귀는 이만큼 더 열어 둔다.
 */
const LATE_GRANT_GRACE_MS = 180_000;

class TossPurchaseBridge implements PurchaseBridge {
  /**
   * 주문서를 띄우고 흐름이 끝날 때까지 기다린다.
   *
   * 성공 신호는 `processProductGrant` 하나다. SDK 구현이 두 갈래인데, 새 경로는
   * 주문서에서 `purchased` 를 받으면 onEvent 를 거치지 않고 이 콜백만 부른다.
   * 그래서 여기서 지급하고 그 결과로 성패를 가른다.
   *
   * 타입 선언은 onEvent 가 `success` 하나만 받는다고 하지만, SDK 는 주문서에서 온
   * 이벤트를 그대로 넘긴다. 이름 목록이 SDK 에 없어서, `success` 가 아닌 것은
   * **사지 않고 나온 것**으로 읽는다. 여기서 실패로 처리하면 그냥 닫은 사람에게
   * 오류 문구가 뜬다.
   *
   * 다만 그렇게 읽었다고 구독까지 끊지는 않는다. 읽기가 틀렸을 때 잃는 것이 사용자의
   * 돈이라, 답만 먼저 내보내고 지급 요청은 잠시 더 기다린다.
   */
  buy(sku: string, grant: (orderId: string) => Promise<boolean>): Promise<PurchaseResult> {
    if (!IAP.createOneTimePurchaseOrder.isSupported()) {
      return Promise.resolve({ status: 'failed', reason: 'unsupported' });
    }

    return new Promise<PurchaseResult>((resolve) => {
      let settled = false;
      let released = false;
      let graceTimer: ReturnType<typeof setTimeout> | undefined;
      // 주문서가 끝나면 반드시 불러야 하는 정리 함수. 아래에서 실제 값으로 바뀐다.
      let cleanup: () => void = () => {};

      /** 주문서 구독을 끊는다. 두 번 불러도 한 번만 끊긴다. */
      const release = () => {
        if (released) return;
        released = true;
        clearTimeout(graceTimer);
        cleanup();
      };

      const finish = (result: PurchaseResult) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      cleanup = IAP.createOneTimePurchaseOrder({
        options: {
          sku,
          processProductGrant: async ({ orderId }) => {
            const granted = await grant(orderId).catch(() => false);
            finish(
              granted ? { status: 'completed', orderId } : { status: 'failed', reason: 'error' },
            );
            release();
            return granted;
          },
        },
        onEvent: (event) => {
          // 지급까지 끝난 뒤의 확인 이벤트다. 이미 finish 했다.
          if (event.type === 'success') {
            release();
            return;
          }
          finish({ status: 'cancelled' });
          graceTimer ??= setTimeout(release, LATE_GRANT_GRACE_MS);
        },
        // 오류 내용은 밖으로 내보내지 않는다. 주문서 메시지에 무엇이 실려 있을지 모른다.
        onError: () => {
          finish({ status: 'failed', reason: 'error' });
          release();
        },
      });

      // 콜백이 먼저 끝났으면 위 cleanup 은 빈 함수였다. 여기서 한 번 더 부른다.
      if (released) cleanup();
    });
  }

  /**
   * 토스에 남은 주문 이력을 읽는다.
   *
   * 두 곳을 본다. 완료·환불 목록은 이 사람이 산 적이 있는지를, 대기 목록은 돈은 받았는데
   * 아직 못 준 주문을 알려 준다. 환불된 주문은 여기서 걸러 내 이용권이 회수되게 한다.
   *
   * ⚠ SDK 3.4.0 의 `getCompletedOrRefundedOrders` 는 `nextKey` 를 돌려주면서도 받는 자리가
   * 없다. 첫 장만 읽는다. 파는 상품이 하나라 지금은 문제가 없지만 상품이 늘면 다시 본다.
   */
  async restore(): Promise<PurchaseOrder[]> {
    if (!IAP.getCompletedOrRefundedOrders.isSupported()) {
      throw new BridgeError('UNSUPPORTED', '이 토스 앱 버전에서는 결제 내역을 볼 수 없어요.');
    }

    try {
      const orders: PurchaseOrder[] = [];

      const { orders: history } = await IAP.getCompletedOrRefundedOrders();
      for (const order of history) {
        if (order.status !== 'COMPLETED') continue;
        orders.push({ sku: order.sku, orderId: order.orderId, pending: false });
      }

      if (IAP.getPendingOrders.isSupported()) {
        const { orders: waiting } = await IAP.getPendingOrders();
        for (const order of waiting) {
          orders.push({ sku: order.sku, orderId: order.orderId, pending: true });
        }
      }

      return orders;
    } catch (error) {
      throw toBridgeError(error, '결제 내역을 불러오지 못했어요.');
    }
  }

  async completeGrant(orderId: string): Promise<boolean> {
    if (!IAP.completeProductGrant.isSupported()) return false;
    try {
      return await IAP.completeProductGrant({ params: { orderId } });
    } catch {
      // 못 알려도 사용자에게는 이용권이 열려 있다. 다음 실행의 대기 주문으로 다시 온다.
      return false;
    }
  }
}

/**
 * 네이티브 공유 시트.
 *
 * SDK 가 취소와 실패를 갈라 주지 않아서, 던지면 전부 `dismissed` 로 본다. 사람이 시트를
 * 닫은 것이 거의 전부이고, 그 사람에게 오류 화면을 보이는 쪽이 더 나쁘다. 정말로 못 여는
 * 기기는 `supports('share')` 가 미리 걸러 낸다.
 */
class TossShareBridge implements ShareBridge {
  async sendMessage(message: string): Promise<ShareResult> {
    if (!shareSupported()) return 'unsupported';
    try {
      await Share.sendMessage({ message });
      return 'sent';
    } catch {
      return 'dismissed';
    }
  }
}

/**
 * 이 앱 버전에서 공유 시트를 열 수 있나.
 *
 * SDK 타입 선언에는 `isSupported` 가 없는데 다른 API 는 다 달고 있다. 런타임에 있으면
 * 그 답을 쓰고, 없으면 **열 수 있는 것으로 본다.** 여기서 못 연다고 단정하면 실제로는
 * 되는 기기에서도 공유 버튼이 복사로 떨어진다. 정말 못 열면 호출이 던지고 부르는 쪽이 받는다.
 */
function shareSupported(): boolean {
  const gate = (Share.sendMessage as unknown as { isSupported?: () => boolean }).isSupported;
  return typeof gate === 'function' ? gate() : true;
}

export class TossMiniAppBridge implements MiniAppBridge {
  readonly environment: BridgeEnvironment;
  readonly platform: BridgePlatform;
  readonly appVersion: string;
  readonly deviceId: string;
  readonly deploymentId: string;
  readonly storage = new TossStorage();
  readonly ads = new TossAdsBridge();
  readonly purchase = new TossPurchaseBridge();
  readonly analytics = new TossAnalyticsBridge();
  readonly share = new TossShareBridge();

  constructor() {
    this.environment = Environment.environment;
    this.platform = Device.os;
    this.appVersion = Environment.tossAppVersion;
    this.deviceId = Environment.deviceId;
    this.deploymentId = Environment.deploymentId;
  }

  supports(capability: BridgeCapability): boolean {
    switch (capability) {
      case 'identity':
        return User.getAnonymousKey.isSupported();
      case 'albumPick':
        // getPhotos 는 버전 게이트가 없다. 앨범 자체는 항상 열 수 있다.
        return true;
      case 'camera':
        return true;
      case 'storage':
        return true;
      case 'networkStatus':
        return true;
      case 'safeArea':
        return true;
      case 'navigationAccessory':
        return true;
      case 'ads':
        return TossAds.attachBanner.isSupported();
      case 'fullScreenAd':
        return loadFullScreenAd.isSupported() && showFullScreenAd.isSupported();
      case 'purchase':
        return IAP.createOneTimePurchaseOrder.isSupported();
      case 'notification':
        return Notification.requestAgreement.isSupported();
      case 'analytics':
        // 낮은 버전에서는 SDK 가 조용히 무시한다. 화면이 로그 때문에 갈릴 일은 없다.
        return true;
      case 'share':
        return shareSupported();
    }
  }

  minAppVersion(capability: BridgeCapability): string | null {
    // 버전으로 갈리는 것만 적는다. 나머지는 앱 버전과 무관하거나 SDK 가 하한을 알려 주지 않는다.
    const gate =
      capability === 'notification'
        ? Notification.requestAgreement.MIN_TOSS_APP_VERSION
        : capability === 'purchase'
          ? IAP.createOneTimePurchaseOrder.MIN_TOSS_APP_VERSION
          : null;
    if (gate == null) return null;
    if (this.platform === 'ios') return gate.ios;
    if (this.platform === 'android') return gate.android;
    return null;
  }

  async getIdentity(): Promise<Identity> {
    try {
      const result = await User.getAnonymousKey();
      return { key: result.hash, source: 'toss-anonymous' };
    } catch (error) {
      throw toBridgeError(error, '사용자 정보를 확인하지 못했어요.');
    }
  }

  async pickPhotos(options: PickPhotosOptions = {}): Promise<PickedImage[]> {
    try {
      const photos = await Device.getPhotos({
        base64: true,
        maxCount: options.maxCount ?? DEFAULT_MAX_COUNT,
        maxWidth: options.maxWidth ?? DEFAULT_MAX_WIDTH,
      });
      return photos.map(({ id, dataUri }) => ({ id, dataUri }));
    } catch (error) {
      throw toBridgeError(error, '앨범을 열지 못했어요.');
    }
  }

  async captureReceipt(options: CaptureOptions = {}): Promise<PickedImage | null> {
    try {
      const image = await Device.openCamera({
        base64: true,
        maxWidth: options.maxWidth ?? DEFAULT_MAX_WIDTH,
      });
      // 취소하면 dataUri 가 비어 온다.
      return image?.dataUri ? { id: image.id, dataUri: image.dataUri } : null;
    } catch (error) {
      throw toBridgeError(error, '카메라를 열지 못했어요.');
    }
  }

  /**
   * 알림 동의 화면을 띄우고 결과를 기다린다.
   *
   * SDK 가 콜백 방식이라 여기서 한 번만 Promise 로 바꾼다. 화면은 await 만 한다.
   *
   * **정리 함수는 함수일 때만 부른다.** 타입 선언은 함수를 돌려준다고 하는데 실기기와
   * devtools 목이 객체를 돌려준 기록이 있다. 그대로 부르면 동의를 받고도 TypeError 로
   * 끝나, 켜지지 않은 것처럼 보인다.
   */
  requestNotificationAgreement(templateCode: string): Promise<NotificationAgreementResult> {
    if (!Notification.requestAgreement.isSupported()) {
      return Promise.reject(
        new BridgeError('UNSUPPORTED', '이 토스 앱 버전에서는 알림을 켤 수 없어요.'),
      );
    }
    // 템플릿 코드가 없으면 실기기에서 동의 화면 자체가 뜨지 않는다. 개발 중에는 화면을
    // 끝까지 눌러 볼 수 있게 통과시키고, 그 밖에서는 못 쓰는 기능으로 다룬다.
    if (templateCode.trim() === '') {
      if (!import.meta.env.DEV) {
        return Promise.reject(
          new BridgeError('UNSUPPORTED', '알림 템플릿이 설정되지 않아 알림을 켤 수 없어요.'),
        );
      }
      return Promise.resolve('alreadyAgreed');
    }

    return new Promise<NotificationAgreementResult>((resolve, reject) => {
      // 콜백이 먼저 도착해도 안전하게 미리 선언해 둔다.
      let cleanup: unknown;
      const release = () => {
        if (typeof cleanup === 'function') (cleanup as () => void)();
      };

      cleanup = Notification.requestAgreement({
        options: { templateCode },
        onEvent: ({ type }) => {
          resolve(type);
          release();
        },
        onError: (error) => {
          reject(toBridgeError(error, '알림 동의를 받지 못했어요.'));
          release();
        },
      });
    });
  }

  getSafeAreaInsets(): SafeAreaInsets {
    return SafeArea.get();
  }

  subscribeSafeArea(listener: (insets: SafeAreaInsets) => void): () => void {
    return SafeArea.subscribe({ onEvent: listener });
  }

  async getNetworkStatus(): Promise<NetworkStatus> {
    return Environment.getNetworkStatus();
  }

  async setNavigationAccessory(accessory: NavigationAccessory | null): Promise<void> {
    if (accessory == null) {
      await partner.removeAccessoryButton();
      return;
    }
    await partner.addAccessoryButton({
      id: accessory.id,
      title: accessory.title,
      icon: { name: accessory.iconName },
    });
  }

  onNavigationAccessoryPress(listener: (id: string) => void): () => void {
    return tdsEvent.addEventListener('navigationAccessoryEvent', {
      onEvent: ({ id }) => listener(id),
    });
  }

  subscribeBackPress(listener: () => void): () => void {
    return graniteEvent.addEventListener('backEvent', { onEvent: listener });
  }

  closeApp(): Promise<void> {
    return Screen.close();
  }
}
