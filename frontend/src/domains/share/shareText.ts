/**
 * 공유로 나가는 글 한 벌.
 *
 * ── 왜 따로 떼어 뒀나 ──────────────────────────────────────────────────
 *
 * 전에는 버튼마다 그 자리에서 문자열을 이어 붙였다. 그래서 어디서 보내느냐에 따라 받는
 * 사람이 보는 글이 달라졌다. 머리말이 붙기도 하고 안 붙기도 했고, 주소가 본문에 바로
 * 붙어 한 문단이 되기도 했다. **앱 밖으로 나가는 유일한 글인데 모양이 제멋대로였다.**
 *
 * 이제 나가는 글은 전부 여기서 만든다. 자리가 하나라 모양이 하나고, 고민 원문이 끼어들
 * 자리가 없는 것도 이 파일만 보면 확인된다.
 *
 * ── 모양 ─────────────────────────────────────────────────────────────
 *
 *     “마음은 붙잡기 어렵고 가볍게 흔들린다”
 *     법구경 3장
 *
 *     부처의 말에서 받았어요
 *     https://…
 *
 * 따옴표가 어디까지가 경전인지 가른다. 앱에서는 금색 상자가 하던 일인데 글로 옮기면
 * 그 상자가 사라져서, 예전에는 「경전 원문」이라는 머리말을 한 줄 더 썼다. 받는 사람에게는
 * 라벨보다 따옴표가 빨리 읽힌다.
 *
 * 줄바꿈은 빈 줄로 덩어리를 가른다. 메신저는 긴 한 덩이를 통째로 접어 버려서, 덩어리가
 * 갈려 있어야 접힌 뒤에도 첫 줄에 구절이 남는다.
 */

import { attributionLine, type Scripture } from '../../shared/api';
import { resolveApiBaseUrl } from '../../shared/api/baseUrl';
import { resolveApiMode } from '../../shared/api/client';

/** 링크 앞에 서는 한 줄. 받는 사람에게 이게 무엇인지 알린다 */
const FROM_SCRIPTURE = '부처의 말에서 받았어요';
const FROM_FULL = '부처의 말에서 받은 답이에요';

/** 따옴표는 곧은 것을 쓰지 않는다. 메신저에서 곧은 따옴표는 인용이 아니라 코드처럼 보인다 */
function quoted(text: string): string {
  return `“${text.trim()}”`;
}

export interface ShareTextInput {
  scripture: Scripture;
  /** 링크. 아직 못 만들었으면 비운다. 없는 주소를 빈칸으로 붙이지 않는다 */
  url?: string | null;
  /** 답변 전체를 보내는 링크인가. 머리말 한 줄만 달라진다 */
  full?: boolean;
}

/**
 * 공유로 내보낼 글.
 *
 * **여기서 만드는 글에 고민 원문도 답변 본문도 들어가지 않는다.** 답변 전체를 보내는
 * 경우에도 본문은 링크 너머에 있고, 메시지에는 경전 구절과 주소만 실린다. 메신저 대화방에
 * 펼쳐지는 자리라 링크를 열지도 않은 사람들이 먼저 읽기 때문이다.
 */
export function shareMessage({ scripture, url, full = false }: ShareTextInput): string {
  const blocks = [`${quoted(scripture.text)}\n${attributionLine(scripture)}`];
  const from = full ? FROM_FULL : FROM_SCRIPTURE;
  blocks.push(url ? `${from}\n${url}` : from);
  return blocks.join('\n\n');
}

/**
 * 앱 자체로 가는 주소.
 *
 * 답변 공유와 달리 특정 답으로 가지 않는다. 받는 사람이 열면 자기 이야기를 쓰는 첫 화면이다.
 * 토스 딥링크(`intoss://`)는 토스가 깔린 기기에서만 열려서, 카톡으로 받은 사람 중 토스가
 * 없는 쪽이 막다른 곳에 선다.
 *
 * 답변 화면과 보관함이 같은 주소를 써야 해서 여기 둔다. 두 자리가 각자 조립하면 한쪽만 고쳐진다.
 */
export function appShareUrl(): string {
  const api = resolveApiMode() === 'http' ? resolveApiBaseUrl() : null;
  if (api != null) return api;
  return typeof window === 'undefined' ? '' : window.location.origin;
}

/**
 * 앱을 권할 때 나가는 글.
 *
 * 앱 이름과 무엇을 해 주는지, 그리고 주소. 고민도 답도 여기에 없다. 이건 그 사람의
 * 이야기를 나누는 자리가 아니라 앱을 알리는 자리다.
 */
export function appShareMessage(url: string): string {
  return ['마음에 걸리는 일을 적으면 경전에서 답을 찾아 줘요', '', '부처의 말', url].join('\n');
}
