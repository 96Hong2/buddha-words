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
  type FullScreenAdHooks,
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

/**
 * 브라우저·테스트용 브릿지.
 *
 * 토스 앱 밖에서도 앱 전체를 돌려볼 수 있게 한다. e2e 테스트는 이 브릿지의 시나리오를 바꿔
 * 권한 거부·미지원·NoFill 같은 엣지 상태를 실제 화면으로 재현한다.
 */
export interface MockScenario {
  /** getIdentity 가 던질 에러. 없으면 성공한다. */
  identityFailure?: 'UNSUPPORTED' | 'UNKNOWN';
  /** 앨범 선택 결과. 'denied' 는 권한 거부, 'cancel' 은 빈 배열. */
  album?: 'ok' | 'denied' | 'cancel';
  camera?: 'ok' | 'denied' | 'cancel';
  network?: NetworkStatus;
  /**
   * 알림 동의 요청의 결과. 거절은 오류가 아니라 결과의 한 종류다.
   *
   * 기본은 `alreadyAgreed` 다. 브라우저에서 화면을 눌러 볼 때 매번 새 동의를 받은 것처럼
   * 굴면, 실기기에서 이미 동의한 사람이 보는 화면을 개발 중에 한 번도 못 본다.
   */
  notification?: NotificationAgreementResult;
  /** 지원하지 않는다고 답할 기능들. */
  unsupported?: BridgeCapability[];
  ads?: 'ok' | 'noFill' | 'failed' | 'unsupported';
  /**
   * 전면 광고가 어떻게 끝나나.
   *
   * `ok` 면 잠깐 덮었다가 「봤다」 로 끝난다. `dismissed` 는 사람이 중간에 닫은 것이고
   * `noFill` 은 광고가 한 장도 안 온 것이다. 화면이 그 둘을 다르게 다뤄야 해서 갈라 둔다.
   * 전면형 그룹(이어가기)은 보상이 없어서 `ok` 여도 닫힘으로 끝난다. 실제 SDK 와 같다.
   */
  fullScreenAd?: 'ok' | 'dismissed' | 'noFill' | 'unsupported';
  /** 전면 광고가 화면을 덮고 있는 시간(ms). 광고가 떠 있는 동안 답이 만들어지는지 보려면 길게 준다 */
  fullScreenAdMs?: number;
  /** 전면 광고를 불러오는 데 걸리는 시간(ms). 실광고는 몇 초씩 걸리기도 한다 */
  fullScreenAdLoadMs?: number;
  /**
   * 주문서에서 무슨 일이 벌어지나.
   * `cancel` 은 사고 나온 것이 아니라 그냥 닫은 것이라 아무 일도 일어나면 안 된다.
   */
  purchase?: 'ok' | 'cancel' | 'failed' | 'unsupported';
  /**
   * 공유 시트에서 무슨 일이 벌어지나.
   *
   * `dismissed` 는 시트를 열었다 아무 데도 안 보내고 닫은 것이다. 실패가 아니라 결과라
   * 화면이 오류를 보이면 안 되고, 그것을 e2e 가 본다.
   */
  share?: 'sent' | 'dismissed' | 'unsupported';
  /**
   * 리뷰 화면을 청했을 때 무슨 일이 벌어지나.
   *
   * `ok` 면 조용히 끝난다(실제 SDK 도 떴는지 안 알려 준다). `failed` 는 던지는 판이다.
   * 리뷰를 못 열었다고 홈이 깨지면 안 되는 것을 e2e 가 본다.
   */
  review?: 'ok' | 'failed' | 'unsupported';
  /**
   * 토스가 만들어 주는 앱 공유 주소. 기본은 없음이다.
   *
   * 브라우저에는 이 앱을 여는 주소가 실제로 없어서, 기본값을 두면 그것이 화면에 뜬다.
   * 주소가 붙는 판을 보려면 e2e 가 여기에 하나 밀어 넣는다.
   */
  appLink?: string | null;
  /**
   * 주문서를 누를 때까지 붙들어 둔다.
   *
   * 기본은 잠깐 떴다가 스스로 닫히는 것이라 테스트가 빠르다. 주문서를 화면으로 남겨야
   * 하는 테스트만 이걸 켜고, 다 찍은 뒤에 주문서를 눌러 결제를 끝낸다.
   */
  purchaseHold?: boolean;
  /**
   * 토스에 이미 남아 있는 주문. 재설치·기기 변경을 흉내 낸다.
   * 기기 저장을 다 지워도 이 값이 있으면 복원이 이용권을 되살려야 한다.
   */
  purchaseOwned?: string[];
  /** 돈은 받았는데 지급을 못 마친 주문. 앱이 켜질 때 마저 지급해야 한다. */
  purchasePending?: string[];
  /** 주문 이력 조회 실패. 「없다」와 「못 읽었다」가 갈리는지 본다. */
  purchaseRestore?: 'ok' | 'failed';
}

declare global {
  interface Window {
    /**
     * 브라우저·e2e 가 브릿지 시나리오를 밀어 넣는 자리.
     * e2e 는 페이지를 열기 전에 여기에 얹는다. API 스텁의 `__buddhaStub` 과 짝이다.
     */
    __buddhaBridge?: MockScenario;
    /** 공유 링크를 만들 때 넘긴 미리보기 그림 주소. e2e 가 본다 */
    __buddhaShareOgImage?: string | null;
    /**
     * 지금 앱이 쓰고 있는 목 브릿지 그 자체.
     *
     * 시스템 뒤로가기와 앱 닫기는 브라우저에 대응하는 동작이 없다. e2e 가 이 자리에서
     * `pressBack()` 을 직접 불러야 BackHandler 배선을 실제로 지나간다.
     */
    __buddhaBridgeInstance?: MockMiniAppBridge;
    /**
     * 공유 시트로 내보내려 한 글 전부.
     *
     * 앱 밖으로 글이 나가는 유일한 길이라 e2e 가 여기를 본다. 고민 원문 조각이 하나라도
     * 섞이면 그 자리에서 실패한다.
     */
    __buddhaShares?: string[];
    /** 리뷰를 몇 번 청했나. e2e 가 「한 번만 청한다」를 이걸로 본다 */
    __buddhaReviews?: number;
    /**
     * 앱 밖으로 열려 한 주소 전부. 전화 · 메일 · 웹페이지가 다 여기로 온다.
     *
     * e2e 가 여기를 보는 이유: **눌렀는데 아무 일도 안 일어나는 것**이 이번 반려 사유라,
     * 「눌렀다」가 아니라 「무엇을 열었다」를 재야 한다.
     */
    __buddhaOpenedUrls?: string[];
  }
}

/** 창에 얹힌 시나리오. 없으면 기본 동작이다. */
function readScenarioDial(): MockScenario {
  if (typeof window === 'undefined') return {};
  return window.__buddhaBridge ?? {};
}

/** 목 전면 광고가 화면을 덮고 있는 시간. 실광고처럼 몇 초를 끌지 않는다. */
const MOCK_FULL_SCREEN_MS = 300;

/** 1x1 투명 PNG. 실제 이미지 없이 파이프라인을 태우기 위한 자리표시자다. */
const BLANK_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

class MemoryStorage implements KeyValueStore {
  private readonly prefix = 'pocket:mock:';

  async get(key: string) {
    try {
      return globalThis.localStorage?.getItem(this.prefix + key) ?? null;
    } catch {
      return null;
    }
  }
  async set(key: string, value: string) {
    try {
      globalThis.localStorage?.setItem(this.prefix + key, value);
    } catch {
      /* 시크릿 모드 등에서 막히면 조용히 넘어간다. 저장소는 편의 기능이다. */
    }
  }
  async remove(key: string) {
    try {
      globalThis.localStorage?.removeItem(this.prefix + key);
    } catch {
      /* 위와 같음 */
    }
  }
}

class MockAdsBridge implements AdsBridge {
  private readonly scenario: MockScenario;

  constructor(scenario: MockScenario) {
    this.scenario = scenario;
  }

  async initialize(): Promise<void> {
    if (this.scenario.ads === 'unsupported') {
      throw new BridgeError('UNSUPPORTED', '목: 이 환경에서는 배너 광고를 쓸 수 없어요.');
    }
  }

  attachBanner(
    _adGroupId: string,
    target: HTMLElement,
    options: AttachBannerOptions = {},
  ): BannerHandle {
    const mode = this.scenario.ads ?? 'ok';
    if (mode === 'noFill') {
      queueMicrotask(() => options.onNoFill?.());
      return { destroy: () => {} };
    }
    if (mode === 'failed' || mode === 'unsupported') {
      queueMicrotask(() => options.onFailed?.('목: 광고를 그리지 못했어요.'));
      return { destroy: () => {} };
    }

    // 실제 배너와 같은 규격으로 자리만 채운다.
    // 우리가 라벨·테두리를 그리면 정책(광고 UI 임의 수정)에 걸리고,
    // 높이가 다르면 e2e 로 잡은 레이아웃이 실기기에서 어긋난다.
    const node = document.createElement('div');
    node.dataset.testid = 'mock-ad-banner';
    node.style.cssText = 'width:100%;height:100%;min-height:96px';
    target.appendChild(node);
    queueMicrotask(() => options.onRendered?.('mock-slot-1'));
    return { destroy: () => node.remove() };
  }

  showFullScreen(adGroupId: string, hooks?: FullScreenAdHooks): Promise<FullScreenAdResult> {
    const mode = this.scenario.fullScreenAd ?? 'ok';
    // 광고가 한 장도 안 온 것은 뜨지도 않는다. 사람이 닫은 것은 잠깐 떴다가 닫힌다
    if (mode === 'noFill' || mode === 'unsupported') return Promise.resolve('noFill');
    // 종류는 실제 SDK 처럼 광고 그룹 id 로 갈린다. 공식 테스트 id 이름에 종류가 들어 있다
    const interstitial = adGroupId.includes('interstitial');

    const loadMs = this.scenario.fullScreenAdLoadMs ?? 0;
    const shownMs = this.scenario.fullScreenAdMs ?? MOCK_FULL_SCREEN_MS;
    return new Promise((resolve) => {
      setTimeout(() => {
        // 실광고처럼 화면을 통째로 덮는다. e2e 가 「광고가 떴다」 를 이 자리로 본다.
        const node = document.createElement('div');
        node.dataset.testid = 'mock-fullscreen-ad';
        node.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#111;color:#fff';
        node.textContent = '광고 (목)';
        document.body.appendChild(node);
        hooks?.onShown?.();
        setTimeout(() => {
          node.remove();
          resolve(mode === 'dismissed' || interstitial ? 'dismissed' : 'watched');
        }, shownMs);
      }, loadMs);
    });
  }
}

/** 목 주문서가 떠 있는 기본 시간. 실제 결제처럼 몇 초를 끌지 않는다. */
const MOCK_ORDER_SHEET_MS = 400;

/**
 * 산 주문을 적어 두는 자리.
 *
 * 앱이 이용권 보유를 캐시하는 자리(`pocket:mock:archive-pass`)와 일부러 다른 키다.
 * 기기 캐시를 지워도 여기는 남아야, 「캐시가 아니라 주문 이력이 이용권을 되살린다」를
 * 화면으로 증명할 수 있다.
 */
const MOCK_ORDER_LEDGER_KEY = 'pocket:mock:iap-orders';

function readLedger(): PurchaseOrder[] {
  try {
    const raw = globalThis.localStorage?.getItem(MOCK_ORDER_LEDGER_KEY);
    if (raw == null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is PurchaseOrder =>
        typeof item === 'object' &&
        item != null &&
        typeof (item as PurchaseOrder).sku === 'string' &&
        typeof (item as PurchaseOrder).orderId === 'string',
    );
  } catch {
    return [];
  }
}

function writeLedger(orders: PurchaseOrder[]): void {
  try {
    globalThis.localStorage?.setItem(MOCK_ORDER_LEDGER_KEY, JSON.stringify(orders));
  } catch {
    /* 시크릿 모드 등에서 막히면 이번 실행 동안만 기억한다. */
  }
}

/**
 * 목 인앱결제.
 *
 * 토스 주문 이력을 흉내 낸다. 이 목록은 기기가 아니라 토스 쪽에 있는 값이라, 화면을
 * 새로 고쳐도 시나리오가 준 것과 이번에 산 것이 그대로 남아 있어야 한다.
 */
class MockPurchaseBridge implements PurchaseBridge {
  private readonly scenario: MockScenario;
  /** 지금까지 산 것. 시나리오가 준 이력 위에 쌓이고 새로고침을 넘어 남는다. */
  private bought: PurchaseOrder[] = readLedger();
  private granted = new Set<string>();

  constructor(scenario: MockScenario) {
    this.scenario = scenario;
  }

  buy(sku: string, grant: (orderId: string) => Promise<boolean>): Promise<PurchaseResult> {
    const mode = this.scenario.purchase ?? 'ok';
    if (mode === 'unsupported') {
      return Promise.resolve({ status: 'failed', reason: 'unsupported' });
    }

    // 실제 주문서처럼 화면을 통째로 덮는다. e2e 가 「주문서가 떴다」 를 이 자리로 본다.
    const node = document.createElement('div');
    node.dataset.testid = 'mock-order-sheet';
    node.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#111;color:#fff';
    node.textContent = '주문서 (목)';
    document.body.appendChild(node);

    return new Promise<PurchaseResult>((resolve) => {
      /** 주문서를 닫고 이번 주문의 끝을 정한다. */
      const settle = () => {
        node.remove();
        if (mode === 'cancel') {
          resolve({ status: 'cancelled' });
          return;
        }
        if (mode === 'failed') {
          resolve({ status: 'failed', reason: 'error' });
          return;
        }

        const orderId = `mock-order-${this.bought.length + 1}`;
        void Promise.resolve(grant(orderId))
          .catch(() => false)
          .then((ok) => {
            if (!ok) {
              resolve({ status: 'failed', reason: 'error' });
              return;
            }
            this.bought = [...this.bought, { sku, orderId, pending: false }];
            writeLedger(this.bought);
            resolve({ status: 'completed', orderId });
          });
      };

      if (this.scenario.purchaseHold) {
        // 실제 주문서처럼 사람이 누를 때까지 떠 있는다. 시간으로 닫으면 화면을 찍는
        // 사이에 사라져서, 주문서라고 이름 붙인 그림에 엉뚱한 화면이 담긴다.
        node.style.cursor = 'pointer';
        node.addEventListener('click', settle, { once: true });
        return;
      }
      setTimeout(settle, MOCK_ORDER_SHEET_MS);
    });
  }

  async restore(): Promise<PurchaseOrder[]> {
    if (this.scenario.purchaseRestore === 'failed') {
      throw new BridgeError('UNKNOWN', '목: 결제 내역을 불러오지 못했어요.');
    }

    const owned = (this.scenario.purchaseOwned ?? []).map((sku, index) => ({
      sku,
      orderId: `mock-owned-${index + 1}`,
      pending: false,
    }));
    const pending = (this.scenario.purchasePending ?? [])
      .map((sku, index) => ({ sku, orderId: `mock-pending-${index + 1}`, pending: true }))
      .filter((order) => !this.granted.has(order.orderId));

    return [...owned, ...pending, ...this.bought];
  }

  async completeGrant(orderId: string): Promise<boolean> {
    this.granted.add(orderId);
    return true;
  }
}

/** 브라우저·테스트용 로그 수집. 창에 쌓아 두고 e2e 가 읽는다. */
class MockAnalyticsBridge implements AnalyticsBridge {
  log(kind: AnalyticsKind, name: string, params: AnalyticsParams = {}): void {
    recordLog('browser', kind, name, params);
  }
}

/**
 * 브라우저에는 네이티브 공유 시트가 없다.
 *
 * 무엇을 보내려 했는지 창에 남긴다. e2e 가 그 값을 읽어 **고민 원문이 실리지 않았는지**
 * 확인한다. 공유는 앱 밖으로 글이 나가는 유일한 길이라 그 검사를 여기에 붙여 둔다.
 */
class MockShareBridge implements ShareBridge {
  constructor(
    private readonly outcome: 'sent' | 'dismissed' | 'unsupported',
    private readonly link: string | null,
  ) {}

  async sendMessage(message: string): Promise<ShareResult> {
    if (typeof window !== 'undefined') {
      (window.__buddhaShares ??= []).push(message);
    }
    return this.outcome;
  }

  /**
   * 토스 밖에서는 이 앱을 여는 주소가 없다.
   *
   * 미니앱이 서는 주소(`*.tossmini.com`)는 토스 앱 안에서만 열리고, 백엔드 주소는
   * 앱이 아니라 API 다. 지어내지 않고 null 을 준다. 그러면 메시지에 주소가 안 붙는다.
   */
  async appLink(ogImageUrl?: string): Promise<string | null> {
    // e2e 가 「미리보기 그림을 같이 줬나」를 여기서 본다. 실기기에서는 확인할 길이 없다
    if (typeof window !== 'undefined') window.__buddhaShareOgImage = ogImageUrl ?? null;
    return this.link;
  }
}

export class MockMiniAppBridge implements MiniAppBridge {
  readonly environment: BridgeEnvironment = 'browser';
  readonly platform: BridgePlatform = 'web';
  readonly appVersion = '';
  readonly deviceId = '';
  readonly deploymentId = '';
  readonly storage = new MemoryStorage();
  readonly ads: AdsBridge;
  readonly purchase: PurchaseBridge;
  readonly analytics: AnalyticsBridge = new MockAnalyticsBridge();
  readonly share: ShareBridge;

  private accessoryListeners = new Set<(id: string) => void>();
  private backListeners = new Set<() => void>();
  private accessory: NavigationAccessory | null = null;
  private closed = false;
  private openedUrls: string[] = [];
  private readonly scenario: MockScenario;

  constructor(scenario: MockScenario = {}) {
    // e2e 는 페이지를 열기 전에 창에 시나리오를 얹는다. 직접 넘긴 값이 그보다 앞선다.
    this.scenario = { ...readScenarioDial(), ...scenario };
    this.ads = new MockAdsBridge(this.scenario);
    this.purchase = new MockPurchaseBridge(this.scenario);
    this.share = new MockShareBridge(this.scenario.share ?? 'sent', this.scenario.appLink ?? null);
    // 브라우저에는 시스템 뒤로가기가 없다. e2e 가 이 인스턴스를 잡아 직접 누른다.
    if (typeof window !== 'undefined') window.__buddhaBridgeInstance = this;
  }

  supports(capability: BridgeCapability): boolean {
    if (this.scenario.unsupported?.includes(capability)) return false;
    if (capability === 'ads') return this.scenario.ads !== 'unsupported';
    if (capability === 'fullScreenAd') return this.scenario.fullScreenAd !== 'unsupported';
    if (capability === 'purchase') return this.scenario.purchase !== 'unsupported';
    if (capability === 'share') return this.scenario.share !== 'unsupported';
    if (capability === 'review') return this.scenario.review !== 'unsupported';
    return true;
  }

  /** 브라우저에는 토스 앱 버전이 없다. 숫자를 지어내지 않는다. */
  minAppVersion(): string | null {
    return null;
  }

  async getIdentity(): Promise<Identity> {
    if (this.scenario.identityFailure) {
      throw new BridgeError(this.scenario.identityFailure, '목: 사용자 정보를 확인하지 못했어요.');
    }
    // 브라우저에서 새로고침해도 같은 사용자로 남게 저장한다.
    const saved = await this.storage.get('identity');
    if (saved) return { key: saved, source: 'mock' };
    const key = `mock-${Math.random().toString(36).slice(2, 12)}`;
    await this.storage.set('identity', key);
    return { key, source: 'mock' };
  }

  async pickPhotos(options: PickPhotosOptions = {}): Promise<PickedImage[]> {
    const mode = this.scenario.album ?? 'ok';
    if (mode === 'denied') {
      throw new BridgeError('PERMISSION_DENIED', '목: 앨범 권한이 없어요.');
    }
    if (mode === 'cancel') return [];
    const count = Math.min(options.maxCount ?? 1, 3);
    return Array.from({ length: count }, (_, i) => ({
      id: `mock-photo-${i}`,
      dataUri: BLANK_PNG,
    }));
  }

  async captureReceipt(_options: CaptureOptions = {}): Promise<PickedImage | null> {
    const mode = this.scenario.camera ?? 'ok';
    if (mode === 'denied') {
      throw new BridgeError('PERMISSION_DENIED', '목: 카메라 권한이 없어요.');
    }
    if (mode === 'cancel') return null;
    return { id: 'mock-receipt', dataUri: BLANK_PNG };
  }

  async requestNotificationAgreement(_templateCode: string): Promise<NotificationAgreementResult> {
    if (!this.supports('notification')) {
      throw new BridgeError('UNSUPPORTED', '목: 이 환경에서는 알림을 켤 수 없어요.');
    }
    return this.scenario.notification ?? 'alreadyAgreed';
  }

  /**
   * 리뷰 화면. 실제 SDK 처럼 **떴는지 알려 주지 않는다.**
   *
   * 몇 번 불렸는지만 창에 남긴다. 화면이 같은 사람에게 두 번 청하지 않는 것을 e2e 가 본다.
   */
  async requestReview(): Promise<void> {
    if (!this.supports('review')) {
      throw new BridgeError('UNSUPPORTED', '목: 이 환경에서는 리뷰를 쓸 수 없어요.');
    }
    if (typeof window !== 'undefined') {
      window.__buddhaReviews = (window.__buddhaReviews ?? 0) + 1;
    }
    if (this.scenario.review === 'failed') {
      throw new BridgeError('UNKNOWN', '목: 리뷰 화면을 열지 못했어요.');
    }
  }

  getSafeAreaInsets(): SafeAreaInsets {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }

  subscribeSafeArea(): () => void {
    return () => {};
  }

  async getNetworkStatus(): Promise<NetworkStatus> {
    return this.scenario.network ?? 'WIFI';
  }

  async setNavigationAccessory(accessory: NavigationAccessory | null): Promise<void> {
    this.accessory = accessory;
  }

  onNavigationAccessoryPress(listener: (id: string) => void): () => void {
    this.accessoryListeners.add(listener);
    return () => this.accessoryListeners.delete(listener);
  }

  subscribeBackPress(listener: () => void): () => void {
    this.backListeners.add(listener);
    return () => this.backListeners.delete(listener);
  }

  async closeApp(): Promise<void> {
    this.closed = true;
  }

  /**
   * 웹에서는 브라우저가 스킴을 안다. 그대로 넘긴다.
   *
   * 연 주소를 남기는 이유는 e2e 가 그것을 재기 때문이다. 브라우저를 실제로 다른 곳으로
   * 보내면 테스트가 앱 밖으로 나가 버린다. 그래서 **기록만 하고 보내지 않는다.**
   */
  async openURL(url: string): Promise<boolean> {
    this.openedUrls.push(url);
    (window.__buddhaOpenedUrls ??= []).push(url);
    return true;
  }

  /** 어떤 주소를 열었는지 테스트에서 확인한다. 가장 마지막 것이 방금 누른 것이다 */
  get opened(): readonly string[] {
    return this.openedUrls;
  }

  /** 테스트에서 상단 액세서리 버튼 클릭을 흉내낼 때 쓴다. */
  pressNavigationAccessory(): void {
    if (this.accessory == null) return;
    for (const listener of this.accessoryListeners) listener(this.accessory.id);
  }

  /** 테스트에서 시스템 뒤로가기를 흉내낼 때 쓴다. */
  pressBack(): void {
    for (const listener of this.backListeners) listener();
  }

  /** closeApp 이 불렸는지 테스트에서 확인한다. */
  get isClosed(): boolean {
    return this.closed;
  }
}
