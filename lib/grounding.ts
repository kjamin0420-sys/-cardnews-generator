// 모든 모드가 공유하는 "사실 근거 수집" 파이프라인.
// 모델이 모르는 고유명사를 추측해 지어내는 걸 막는 것이 목적.
//
//   Tavily (글로벌·본문추출)  +  네이버 (한국 뉴스/블로그)
//
// 둘 다 없으면 근거 없음으로 표시하고, 호출부가 사용자에게 경고를 띄운다.

import { collectTopicGrounding, hasNaverKeys } from "./naver";
import { hasTavilyKey, searchTavily } from "./tavily";

export interface Evidence {
  text: string;
  count: number;
  providers: string[];
}

export async function collectEvidence(query: string): Promise<Evidence> {
  const chunks: string[] = [];
  const providers: string[] = [];
  let count = 0;

  // 글로벌 커버리지 우선 (한국어 자료가 얕은 해외 툴 대응)
  if (hasTavilyKey()) {
    try {
      const t = await searchTavily(query, 6);
      if (t.items.length > 0) {
        chunks.push(t.text);
        count += t.items.length;
        providers.push("tavily");
      }
    } catch (e) {
      console.error("[grounding] tavily 실패:", e);
    }
  }

  // 한국 자료로 보강 (국내 소식·한국어 표현 확보)
  if (hasNaverKeys()) {
    try {
      const n = await collectTopicGrounding(query);
      if (n.count > 0) {
        chunks.push(n.text);
        count += n.count;
        providers.push("naver");
      }
    } catch (e) {
      console.error("[grounding] naver 실패:", e);
    }
  }

  return { text: chunks.join("\n\n"), count, providers };
}

/** 카드뉴스를 만들 만큼 근거가 충분한지 */
export function isEnough(e: Evidence): boolean {
  return e.count >= 2 && e.text.length > 200;
}
