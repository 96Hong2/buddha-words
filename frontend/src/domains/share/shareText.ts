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

import { attributionLine, resolveApiBaseUrl, type Scripture } from '../../shared/api';
import type { MiniAppBridge } from '../../shared/toss';

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
 * 앱 자체로 가는 주소. 만들지 못하면 null 이다.
 *
 * 답변 공유와 달리 특정 답으로 가지 않는다. 받는 사람이 열면 자기 이야기를 쓰는 첫 화면이다.
 *
 * ⚠ **이 주소는 토스가 만들어 준다**(`Share.createLink`). 우리가 조립하지 않는다.
 * 한때 운영 판에서 백엔드 주소를 그대로 내보냈는데, 그 주소는 API 라 여는 사람마다
 * `{"detail":"Not Found"}` 를 봤다. 미니앱이 서는 주소(`*.tossmini.com`)도 토스 앱
 * 밖에서는 400 이라 대안이 못 된다. 토스가 주는 주소만 받는 사람에게 실제로 열린다.
 *
 * 못 만들면 주소를 빼고 보낸다. 죽은 주소를 보내는 것보다 낫다.
 *
 * 답변 화면과 보관함이 같은 주소를 써야 해서 여기 둔다. 두 자리가 각자 조립하면 한쪽만 고쳐진다.
 */
export async function appShareUrl(bridge: MiniAppBridge): Promise<string | null> {
  /*
    `supports('share')` 로 먼저 거르지 않는다. 그 값은 **네이티브 공유 시트**를 열 수 있나를
    말하고, 주소를 만드는 일과 별개다. 시트를 못 여는 기기는 글을 복사해 건네는데, 거기서
    주소를 빼면 복사한 글에 갈 곳이 없다.
  */
  try {
    return await bridge.share.appLink(appShareOgImageUrl() ?? undefined);
  } catch {
    return null;
  }
}

/**
 * 메신저 미리보기에 뜰 그림.
 *
 * **안 주면 토스 그림이 뜬다.** 카톡에 붙은 우리 링크가 토스 로고로 보이던 것이 그
 * 때문이었다(2026-09-21 실기기 신고). 토스는 자기가 만든 링크에 기본 그림을 넣는다.
 *
 * 그림은 백엔드가 낸다. 미니앱 번들에 두면 안 되는 이유가 둘이다: 번들은 앱을 켤 때
 * 통째로 내려받는 zip 이라 화면이 안 쓰는 그림이 첫 접속 시간을 늘리고(최초 접속 20초
 * 초과로 한 번 반려당했다), 번들 주소는 토스 밖에서 400 이라 크롤러가 못 읽는다.
 *
 * 주소가 없는 판(스텁·설정 누락)에서는 null 이다. 그러면 그림 없이 링크만 나간다.
 */
export function appShareOgImageUrl(): string | null {
  const base = resolveApiBaseUrl();
  return base == null ? null : `${base}/og/default.jpg`;
}

/**
 * 앱을 권할 때 나가는 글.
 *
 * 앱 이름과 무엇을 해 주는지, 그리고 주소. 고민도 답도 여기에 없다. 이건 그 사람의
 * 이야기를 나누는 자리가 아니라 앱을 알리는 자리다.
 *
 * 주소가 없으면 그 줄을 통째로 뺀다. 빈 줄로 끝나는 메시지를 내보내지 않는다.
 */
export function appShareMessage(url?: string | null): string {
  const head = ['마음에 걸리는 일을 적으면 경전에서 답을 찾아 줘요', '', '부처의 말'];
  return (url != null && url.trim() !== '' ? [...head, url.trim()] : head).join('\n');
}
