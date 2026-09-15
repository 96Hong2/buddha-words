/**
 * 증거를 남기는 자리 하나.
 *
 * 그림과 영상이 어디로 갈지는 실행할 때 정한다. 기본은 저장소 안(`e2e/shots`)이고,
 * 사용자에게 건넬 산출물을 만들 때는 환경변수로 사용자 폴더를 가리킨다.
 * 경로를 스펙마다 손으로 적으면 한 군데만 고쳐지고 나머지가 옛 자리에 남는다.
 *
 * 파일 이름은 한글로 짓고 앞에 번호를 붙인다. 번호는 **사용자가 보는 순서**이지
 * 테스트가 도는 순서가 아니다. 그래서 각 스펙이 자기 번호를 직접 들고 있다.
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import type { Page } from '@playwright/test';

function resolve(envKey: string, fallback: string): string {
  const raw = process.env[envKey];
  const dir = raw != null && raw.trim() !== '' ? raw.trim() : fallback;
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** 폰 폭 화면. 기본 흐름의 그림이 전부 여기로 간다 */
export function shotsDir(): string {
  return resolve('BUDDHA_SHOTS_DIR', 'e2e/shots');
}

/** 넓은 화면(768·1280·1920)은 따로 둔다. 섞이면 폰 화면 순서가 끊긴다 */
export function wideShotsDir(): string {
  return resolve('BUDDHA_WIDE_DIR', join(shotsDir(), '넓은 화면'));
}

/** 동작 영상 */
export function videosDir(): string {
  return resolve('BUDDHA_VIDEO_DIR', 'e2e/shots/영상');
}

export interface ShotOptions {
  /** 화면이 길면 통째로 찍는다. 시트·모달은 보이는 영역만 찍어야 판이 가려지지 않는다 */
  fullPage?: boolean;
}

/**
 * 그림 한 장. 이름에 확장자를 붙이지 않는다.
 *
 * 애니메이션이 끝나기 전에 찍으면 시트가 반쯤 올라온 그림이 남는다. 그래서 늘 한 박자 쉰다.
 */
export async function shot(page: Page, name: string, options: ShotOptions = {}): Promise<void> {
  await page.waitForTimeout(350);
  await page.screenshot({
    path: join(shotsDir(), `${name}.png`),
    fullPage: options.fullPage ?? false,
  });
}

/** 넓은 화면 그림 */
export async function wideShot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(350);
  await page.screenshot({ path: join(wideShotsDir(), `${name}.png`), fullPage: false });
}
