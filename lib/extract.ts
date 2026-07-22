// 붙여넣기 소스에서 URL을 뽑고, 가능한 경우 본문 텍스트를 추출한다.
// (네이버 등은 JS 렌더링/봇 차단이 잦아 실패할 수 있음 → 실패 시 본문 직접 붙여넣기로 폴백)

export function extractUrls(text: string): string[] {
  const m = text.match(/https?:\/\/[^\s<>"')]+/g);
  return m ? Array.from(new Set(m)) : [];
}

// 소스가 사실상 URL만인지 (URL 외 텍스트가 거의 없음)
export function isMostlyUrl(text: string): boolean {
  const urls = extractUrls(text);
  if (urls.length === 0) return false;
  let rest = text;
  for (const u of urls) rest = rest.replace(u, "");
  return rest.trim().length < 40;
}

export async function fetchArticleText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      // 일부 사이트의 기본 봇 차단 회피 (완벽하진 않음)
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept-Language": "ko,en;q=0.8",
    },
    redirect: "follow",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("html") && !ct.includes("text")) {
    throw new Error("HTML 아님");
  }
  const html = await res.text();
  return htmlToText(html);
}

// 아주 단순한 본문 추출: 스크립트/스타일 제거 → <p>/<article> 위주 → 태그 제거
function htmlToText(html: string): string {
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  // <article> 이 있으면 그 안쪽 우선
  const article = s.match(/<article[\s\S]*?<\/article>/i);
  if (article) s = article[0];

  // <p> 텍스트를 모아 문단으로
  const paras = Array.from(s.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi))
    .map((m) => stripTags(m[1]).trim())
    .filter((t) => t.length > 0);

  let text = paras.length >= 2 ? paras.join("\n") : stripTags(s);
  text = decodeEntities(text).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return text;
}

export function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ");
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
