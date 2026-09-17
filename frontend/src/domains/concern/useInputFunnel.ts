/**
 * 고민을 쓰는 동안 무슨 일이 있었나.
 *
 * **키 하나마다 보내지 않는다.** 구간(bucket)이 올라가는 순간에만 한 번씩 보낸다.
 * 120자를 쓰는 사람이 이벤트 120개를 만들면 수집처가 먼저 무너지고, 그 수치로는
 * 「사람들이 길게 쓰는가」를 물어볼 수도 없다. 물어볼 수 있는 것만 남긴다.
 *
 * 화면 동작을 바꾸지 않는다. 여기서 하는 일은 세는 것뿐이고, 로그가 실패해도 입력은 그대로다.
 */

import { useCallback, useEffect, useRef } from 'react';

import { depthIndicator } from '@spec/router.ts';

import {
  charsBucket,
  countSentences,
  immediateBucket,
  linesBucket,
  typingBucket,
  useAnalytics,
} from '../../shared/analytics';

/** 점 셋이 다 차면 「깊게 볼 수 있어요」다. 그 문구를 본 사실을 한 번만 남긴다 */
const DEEP_DOTS = 3;

/** 이 안에 전송을 또 누르면 막힌 것으로 본다 */
const REPEAT_SUBMIT_MS = 3000;

export interface InputFunnel {
  /** 전송 직전에 부른다. concern_submit 을 보내고, 연타면 마찰 신호도 함께 남긴다 */
  markSubmit: (text: string) => void;
}

export function useInputFunnel(text: string, restored: boolean): InputFunnel {
  const analytics = useAnalytics();

  const started = useRef(false);
  const startedAt = useRef(0);
  const lastChars = useRef('');
  const deepSeen = useRef(false);
  const lastSubmitAt = useRef(0);

  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed === '') return;

    if (!started.current) {
      started.current = true;
      startedAt.current = Date.now();
      analytics.log('concern_input_start', { restored });
    }

    // 구간이 바뀔 때만 보낸다. 지웠다 다시 쓰며 같은 구간을 오르내려도 한 번이다
    const chars = charsBucket(trimmed.length);
    if (chars !== lastChars.current) {
      lastChars.current = chars;
      analytics.log(
        'concern_input_milestone',
        { chars_bucket: chars, lines_bucket: linesBucket(countSentences(trimmed)) },
        { once: `input_milestone:${chars}` },
      );
    }

    if (!deepSeen.current && depthIndicator(trimmed).dots === DEEP_DOTS) {
      deepSeen.current = true;
      analytics.log('deep_hint_shown', { chars_bucket: chars });
    }
  }, [analytics, restored, text]);

  const markSubmit = useCallback(
    (value: string) => {
      const now = Date.now();
      const since = now - lastSubmitAt.current;
      if (lastSubmitAt.current !== 0 && since < REPEAT_SUBMIT_MS) {
        analytics.log('friction_repeat_submit', { within_bucket_ms: immediateBucket(since) });
      }
      lastSubmitAt.current = now;

      const trimmed = value.trim();
      analytics.log(
        'concern_submit',
        {
          chars_bucket: charsBucket(trimmed.length),
          lines_bucket: linesBucket(countSentences(trimmed)),
          typing_bucket_ms: typingBucket(startedAt.current === 0 ? 0 : now - startedAt.current),
          deep_hint_seen: deepSeen.current,
          restored,
        },
        { kind: 'click' },
      );
    },
    [analytics, restored],
  );

  return { markSubmit };
}
