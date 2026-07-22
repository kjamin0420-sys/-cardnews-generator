// Tavily — LLM 근거수집 전용 검색 API.
// 링크만 주는 일반 검색과 달리 **본문을 추출해서** 돌려준다.
// 글로벌 AI 툴처럼 한국어 자료가 얕은 주제를 자동으로 커버하기 위해 사용.
// 무료: 월 1,000회 (카드 등록 불필요). 키 없으면 자동으로 건너뜀.

export interface TavilyItem {
  title: string;
  url: string;
  content: string;
}

export function hasTavilyKey(): boolean {
  return Boolean(process.env.TAVILY_API_KEY);
}

export async function searchTavily(
  query: string,
  maxResults = 6
): Promise<{ items: TavilyItem[]; text: string }> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
    },
    cache: "no-store",
    body: JSON.stringify({
      query,
      search_depth: "advanced", // 본문 추출 품질 우선
      max_results: maxResults,
      include_answer: false,
      include_raw_content: false,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Tavily ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    results?: { title?: string; url?: string; content?: string }[];
  };

  const items: TavilyItem[] = (json.results ?? [])
    .map((r) => ({
      title: (r.title ?? "").trim(),
      url: (r.url ?? "").trim(),
      content: (r.content ?? "").trim(),
    }))
    .filter((r) => r.content.length > 40);

  const text = items
    .map((it, i) => `[${i + 1}] ${it.title}\n${it.content}\n(출처: ${it.url})`)
    .join("\n\n");

  return { items, text };
}
