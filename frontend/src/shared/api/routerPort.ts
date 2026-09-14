/**
 * 라우터 정본(`spec/router.ts`)을 프론트가 쓰는 자리.
 *
 * 규칙을 여기서 다시 쓰지 않는다. 1층(rules)은 프론트와 서버가 **같은 파일**을 쓰고,
 * 2층(classifier)은 서버만 돈다. 프론트는 인디케이터와 전송 전 INVALID 안내에만 쓴다.
 */

import {
  depthIndicator,
  escalateToSolace,
  merge,
  needsClassifier,
  routeByRules,
  SOLACE_FALLBACK,
  type ClassifierVerdict,
  type CrisisLevel,
  type InputRoute,
  type RouteDecision,
} from '@spec/router.ts';

export {
  depthIndicator,
  escalateToSolace,
  merge,
  needsClassifier,
  routeByRules,
  SOLACE_FALLBACK,
};
export type { ClassifierVerdict, CrisisLevel, InputRoute, RouteDecision };

/**
 * 스텁 classifier. 실제로는 cheap 모델이 맥락을 보고 정한다.
 * 이해관계자 수와 결정 어휘로 흉내만 낸다. 규칙이 아니라 흉내라 spec 에 두지 않는다.
 */
function stubVerdict(text: string, rules: RouteDecision): ClassifierVerdict {
  const people = ['남편', '아내', '엄마', '아빠', '부모', '친구', '동료', '상사', '팀장', '선배', '후배', '아이'];
  const decisions = ['해야 할까', '할까요', '그만둘', '이혼', '헤어질', '결정', '선택', '고민이에요'];
  const actors = people.filter((w) => text.includes(w)).length;
  const hasDecision = decisions.some((w) => text.includes(w));
  const long = rules.counts.chars >= 120;

  const score = (actors >= 1 ? 0.3 : 0) + (hasDecision ? 0.3 : 0) + (long ? 0.25 : 0) + 0.2;
  const route: ClassifierVerdict['route'] = score >= 0.7 ? 'deep' : 'normal';
  return {
    route,
    confidence: Number(score.toFixed(2)),
    reasons: ['stub_classifier'],
    minor: rules.flags.minor,
    abuse: rules.flags.abuse,
  };
}

/** 스텁 백엔드가 서버 자리에서 부르는 전체 판정 */
export function decide(text: string): RouteDecision {
  const rules = routeByRules(text);
  if (!needsClassifier(rules)) return rules;
  return merge(rules, stubVerdict(text, rules));
}
