// 네이버 검색 API (뉴스) — 구글 뉴스와 달리 실제 요약(description)과
// 진짜 언론사 원문 링크(originallink)를 준다 → 본문까지 긁어 깊이 있는 카드 생성 가능.
// 키가 없으면 사용 불가 → news.ts에서 구글 뉴스로 폴백.

import { decodeEntities, fetchArticleText, stripTags } from "./extract";

export interface NaverItem {
  title: string;
  description: string;
  originallink: string;
  pubDate: string;
}

export function hasNaverKeys(): boolean {
  return Boolean(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);
}

/**
 * 주제 모드용 사실 근거 수집.
 * 모델이 모르는 고유명사(신규 서비스·툴 등)를 추측해서 지어내는 걸 막는다.
 * 뉴스 → 블로그 순으로 훑어 실제 자료를 모은다.
 */
export async function collectTopicGrounding(
  topic: string
): Promise<{ text: string; count: number }> {
  const multi = topic.trim().split(/\s+/).length > 1;
  const phrase = multi ? `"${topic}"` : topic;
  const parts: string[] = [];
  let count = 0;

  for (const [corpus, query] of [
    ["news", phrase],
    ["blog", phrase],
    ["blog", topic], // 구문검색이 비면 완화
  ] as const) {
    if (count >= 6) break;
    try {
      const items = await searchNaver(corpus, query, 10);
      for (const it of items) {
        const line = [it.title, it.description].filter(Boolean).join("\n");
        if (line.length > 30 && !parts.some((p) => p.startsWith(it.title))) {
          parts.push(line);
          count += 1;
        }
      }
    } catch {
      /* 한 코퍼스가 실패해도 계속 */
    }
  }

  return { text: parts.join("\n\n"), count };
}

async function searchNaver(
  corpus: "news" | "blog",
  query: string,
  display: number
): Promise<NaverItem[]> {
  const url = `https://openapi.naver.com/v1/search/${corpus}.json?query=${encodeURIComponent(
    query
  )}&display=${display}&sort=sim`;
  const res = await fetch(url, {
    headers: {
      "X-Naver-Client-Id": process.env.NAVER_CLIENT_ID ?? "",
      "X-Naver-Client-Secret": process.env.NAVER_CLIENT_SECRET ?? "",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`네이버 ${corpus} ${res.status}`);
  const json = (await res.json()) as { items?: NaverItem[] };
  return (json.items ?? []).map((it) => ({
    title: clean(it.title),
    description: clean(it.description),
    originallink: it.originallink,
    pubDate: it.pubDate,
  }));
}

export async function searchNaverNews(keyword: string, display = 10): Promise<NaverItem[]> {
  const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(
    keyword
  )}&display=${display}&sort=sim`;

  const res = await fetch(url, {
    headers: {
      "X-Naver-Client-Id": process.env.NAVER_CLIENT_ID ?? "",
      "X-Naver-Client-Secret": process.env.NAVER_CLIENT_SECRET ?? "",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`네이버 API ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as { items?: NaverItem[] };
  return (json.items ?? []).map((it) => ({
    title: clean(it.title),
    description: clean(it.description),
    originallink: it.originallink,
    pubDate: it.pubDate,
  }));
}

/**
 * 네이버 검색 결과 + 상위 기사 본문까지 합쳐 깊이 있는 소스 텍스트를 만든다.
 * 본문 fetch는 실패해도 무시(요약은 남으므로 안전).
 */
export async function collectNaverSource(
  keyword: string,
  opts: { articles?: number; bodies?: number } = {}
): Promise<{ text: string; count: number; bodyCount: number }> {
  const { articles = 10, bodies = 4 } = opts;

  // 따옴표(구문 검색)가 핵심. 없으면 네이버가 단어를 OR로 흩어 매칭해 엉뚱한 기사가 온다.
  // (실측: "AI 영상 생성" 143,629건(쓰레기) → "\"AI 영상 생성\"" 1,150건(정상))
  const multi = keyword.trim().split(/\s+/).length > 1;
  let raw = await searchNaverNews(multi ? `"${keyword}"` : keyword, 30);

  // 구문 검색 결과가 너무 적으면만 완화 검색으로 보충
  if (raw.length < 3 && multi) {
    raw = await searchNaverNews(keyword, 30);
  }

  const items = filterByRelevance(raw, keyword).slice(0, articles);
  if (items.length === 0) return { text: "", count: 0, bodyCount: 0 };

  // 상위 몇 건은 원문 본문까지 병렬로 시도
  const targets = items.slice(0, bodies);
  const fetched = await Promise.allSettled(
    targets.map((it) => (it.originallink ? fetchArticleText(it.originallink) : Promise.reject()))
  );

  let bodyCount = 0;
  const parts = items.map((it, i) => {
    const lines = [`[${i + 1}] ${it.title}`];
    if (it.description) lines.push(it.description);
    const f = fetched[i];
    if (f && f.status === "fulfilled" && f.value && f.value.length > 200) {
      bodyCount += 1;
      lines.push(`본문: ${f.value.slice(0, 1500)}`);
    }
    return lines.join("\n");
  });

  return { text: parts.join("\n\n"), count: items.length, bodyCount };
}

/**
 * 관련성 필터. 네이버 sort=sim은 의미상 비슷한 기사를 넓게 물어와서
 * "AI 영상 생성" → 음성편지 기사처럼 새는 일이 잦다.
 * 키워드 토큰을 "전부 포함" 기준으로 먼저 거르고, 결과가 적으면 단계적으로 완화한다.
 */
function filterByRelevance(items: NaverItem[], keyword: string): NaverItem[] {
  const tokens = keyword
    .split(/\s+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 2);
  if (tokens.length === 0) return items;

  const hit = (it: NaverItem) => {
    const hay = `${it.title} ${it.description}`.toLowerCase();
    return tokens.filter((t) => hay.includes(t)).length;
  };

  // 전부 포함이 원칙. 부족하면 딱 1단계만 완화한다.
  // (need=1까지 풀면 "ai" 하나 걸린 무관한 기사가 통과해 결과가 망가짐)
  const floor = tokens.length >= 2 ? Math.max(2, tokens.length - 1) : 1;
  for (let need = tokens.length; need >= floor; need--) {
    const matched = items.filter((it) => hit(it) >= need);
    if (matched.length >= 3 || need === floor) {
      return matched.sort((a, b) => hit(b) - hit(a));
    }
  }
  return [];
}

function clean(s: string): string {
  return decodeEntities(stripTags(s)).replace(/\s+/g, " ").trim();
}
