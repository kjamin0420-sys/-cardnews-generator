// 키워드 → 구글 뉴스 RSS로 최신 기사 자동 수집 (무료, 키 불필요).
// RSS 요약 자체가 텍스트라 봇 차단 문제를 우회한다.

import { decodeEntities, stripTags } from "./extract";

export interface NewsItem {
  title: string;
  snippet: string;
  source: string;
  link: string;
  pubDate: string;
}

export async function fetchNews(
  keyword: string,
  limit = 8
): Promise<{ items: NewsItem[]; text: string }> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(
    keyword
  )}&hl=ko&gl=KR&ceid=KR:ko`;

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept-Language": "ko,en;q=0.8",
    },
    redirect: "follow",
    cache: "no-store", // 뉴스는 항상 최신 — Next.js fetch 캐싱 방지
  });
  if (!res.ok) throw new Error(`뉴스 수집 실패 (RSS ${res.status})`);

  const xml = await res.text();
  const all = parseRssItems(xml);

  // 관련성 필터: 키워드 토큰이 실제 포함된 기사만 (구글의 넓은 매칭 보정)
  const tokens = keyword
    .split(/\s+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 2);
  const score = (it: NewsItem) => {
    const hay = `${it.title} ${it.snippet}`.toLowerCase();
    return tokens.filter((t) => hay.includes(t)).length;
  };
  let ranked = all;
  if (tokens.length >= 2) {
    const need = Math.min(2, tokens.length);
    const filtered = all.filter((it) => score(it) >= need);
    // 필터 후 너무 적으면 원본 유지 (과필터 방지)
    ranked = filtered.length >= 2 ? filtered : all;
  }
  // 관련도 높은 순 정렬
  ranked = [...ranked].sort((a, b) => score(b) - score(a));
  const items = ranked.slice(0, limit);

  // 모델에 넣을 텍스트: 제목 + 요약 + 출처
  const text = items
    .map((it, i) => {
      const lines = [`[${i + 1}] ${it.title}`];
      if (it.snippet && it.snippet !== it.title) lines.push(it.snippet);
      if (it.source) lines.push(`(출처: ${it.source})`);
      return lines.join("\n");
    })
    .join("\n\n");

  return { items, text };
}

function parseRssItems(xml: string): NewsItem[] {
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  return blocks.map((b) => {
    const rawTitle = tag(b, "title");
    const rawDesc = tag(b, "description");
    const source = tag(b, "source");
    const link = tag(b, "link");
    const pubDate = tag(b, "pubDate");

    // 구글 뉴스 제목은 "기사제목 - 언론사" 형태 → 언론사 꼬리 제거
    const title = clean(rawTitle).replace(/\s*-\s*[^-]+$/, "").trim() || clean(rawTitle);
    const snippet = clean(rawDesc);

    return { title, snippet, source: clean(source), link: link.trim(), pubDate: pubDate.trim() };
  });
}

// <tag>..</tag> 안쪽 (CDATA 포함) 추출
function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1] : "";
}

function clean(s: string): string {
  let out = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  out = stripTags(out);
  out = decodeEntities(out);
  return out.replace(/\s+/g, " ").trim();
}
