/**
 * 위기·위로·실패 화면의 고정 문구와 창구 정본.
 *
 * 이 파일의 문장은 모델이 만들지 않는다. 무슨 말이 나올지 심사에 제출할 수 없는 자리를
 * 생성에 맡기지 않는다. 자해의 방법이나 상황은 한 글자도 쓰지 않고 연락할 곳만 적는다.
 */

import type { Channel } from '../../shared/api';

export const CRISIS_COPY = {
  title: '지금 많이 힘드신 것 같아요',
  lead: '이 이야기는 지금 바로 사람과 나누는 것이 좋겠어요. 24시간 들어 줄 곳이 있어요.',
  urgent: '지금 위험한 상황이라면 112 또는 119',
  continueNote: '이야기를 계속 들어 드릴 수도 있어요. 다만 해결책을 드리기보다 곁에 있는 쪽에 가까울 거예요.',
  continueCta: '그래도 이야기를 들어주세요',
  draftKept: '적으신 글은 지워지지 않았어요. 닫으면 그대로 남아 있어요',
  close: '닫고 돌아가기',
} as const;

export const SOLACE_COPY = {
  /** 경전 출처 뒤에 붙는다. 부처의 직접 발언처럼 보이지 않게 한다 */
  citeSuffix: ' · 현대적 풀이',
  micro: ['이 글은 AI 가 썼어요 · 전문가의 도움을 대신하지 않아요', '사용 횟수를 세지 않고, 광고도 나오지 않아요'],
  rewrite: '다른 이야기 쓰기',
} as const;

export const ERROR_COPY = {
  title: '지금은 답을 만들지 못했어요',
  /** 어떤 실패인지 알 수 없을 때의 기본 안내 */
  lead: '잠시 뒤에 다시 해볼까요?',
  quotaKept: '다시 보내도 오늘 남은 횟수는 줄지 않아요',
  retry: '다시 해보기',
  close: '닫기',
  offlineBanner: '인터넷이 끊겼어요. 연결되면 이어서 할 수 있어요',
  offlineKept: '쓰던 이야기는 그대로 있어요. 연결되면 그 자리에서 보낼 수 있어요.',
  partialTitle: '나머지 풀이를 못 불러왔어요',
  partialBody: '위에 있는 세 가지는 그대로 볼 수 있어요. 다시 받아도 오늘 횟수는 줄지 않아요.',
  partialRetry: '나머지 다시 받기',
} as const;

/**
 * 마들랜 안내 페이지. 카카오톡·문자 연결을 이 페이지가 안내한다.
 * 운영 주체(한국생명존중희망재단)의 주소이고, 심사 전에 실제 응답 코드를 한 번 확인한다.
 */
const MADELEINE_URL = 'https://www.kfsp.or.kr';

export interface ChannelInfo {
  /** 창구 카드 첫 줄 */
  name: string;
  /** 창구 카드 둘째 줄. 번호 또는 연결 수단 */
  value: string;
  /** 창구 카드 셋째 줄 */
  note?: string;
  /** 위로 답변의 한 줄 띠에서 링크로 보이는 이름 */
  short: string;
  href: string;
  kind: 'call' | 'sns';
}

/**
 * 번호와 이름은 복지부 안내를 따른다. 109 가 위기 1순위이고 마들랜이 글로 잇는 자리다.
 * 어느 창구를 어떤 순서로 보일지는 서버가 정한다. 화면은 받은 순서대로 그린다.
 */
export const CHANNELS: Record<Channel, ChannelInfo> = {
  '109': {
    name: '자살예방상담전화',
    value: '109',
    note: '24시간 · 걸면 상담원과 바로 이야기해요',
    short: '자살예방상담전화 109',
    href: 'tel:109',
    kind: 'call',
  },
  madeleine: {
    name: '자살예방 SNS 상담 마들랜',
    value: '문자 · 카카오톡',
    note: '말로 하기 어려우면 글로 이야기할 수 있어요',
    short: '마들랜',
    href: MADELEINE_URL,
    kind: 'sns',
  },
  '1388': { name: '청소년전화', value: '1388', short: '청소년전화 1388', href: 'tel:1388', kind: 'call' },
  '1366': { name: '여성긴급전화', value: '1366', short: '여성긴급전화 1366', href: 'tel:1366', kind: 'call' },
  '112': { name: '경찰', value: '112', short: '경찰 112', href: 'tel:112', kind: 'call' },
  '1577-0199': {
    name: '정신건강상담전화',
    value: '1577-0199',
    short: '정신건강상담전화 1577-0199',
    href: 'tel:1577-0199',
    kind: 'call',
  },
};

const DEFAULT_CHANNELS: Channel[] = ['109', 'madeleine'];

/** 창구는 조건부로 감추지 않는다. 서버가 빈 목록을 주더라도 기본 두 곳은 보인다 */
export function resolveChannels(channels: Channel[] | undefined): Channel[] {
  if (channels == null || channels.length === 0) return DEFAULT_CHANNELS;
  return channels;
}
