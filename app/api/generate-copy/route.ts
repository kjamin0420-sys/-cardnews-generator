import { NextResponse } from "next/server";
import { generateSlides } from "@/lib/openai";
import { extractUrls, fetchArticleText, isMostlyUrl } from "@/lib/extract";
import { fetchNews } from "@/lib/news";
import { collectNaverSource, hasNaverKeys } from "@/lib/naver";
import { collectEvidence, isEnough } from "@/lib/grounding";
import { hasTavilyKey, searchTavily } from "@/lib/tavily";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_SOURCE = 6000; // 모델에 보낼 원문 최대 길이

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY가 설정되지 않았습니다. .env.local을 확인하세요." },
        { status: 500 }
      );
    }

    const body = (await req.json()) as {
      mode?: "topic" | "source" | "news";
      topic?: string;
      source?: string;
      keyword?: string;
    };
    const mode =
      body.mode === "source" ? "source" : body.mode === "news" ? "news" : "topic";

    // ── 뉴스 자동수집 모드 ──
    if (mode === "news") {
      const keyword = (body.keyword ?? "").trim();
      if (!keyword)
        return NextResponse.json({ error: "검색 키워드를 입력해주세요." }, { status: 400 });
      if (keyword.length > 60)
        return NextResponse.json({ error: "키워드가 너무 깁니다 (최대 60자)." }, { status: 400 });

      let text = "";
      let articleCount = 0;
      let bodyCount = 0;
      const providers: string[] = [];

      // 네이버 검색 API 우선 (실제 요약 + 원문 본문까지 확보 → 내용이 깊다)
      if (hasNaverKeys()) {
        try {
          const r = await collectNaverSource(keyword, { articles: 10, bodies: 4 });
          if (r.count > 0) {
            text = r.text;
            articleCount = r.count;
            bodyCount = r.bodyCount;
            providers.push("naver");
          }
        } catch (e) {
          console.error("[generate-copy] 네이버 실패:", e);
        }
      }

      // 글로벌 주제(해외 AI 툴 등)는 한국 뉴스가 얕으므로 Tavily로 보강
      if (hasTavilyKey()) {
        try {
          const t = await searchTavily(keyword, 5);
          if (t.items.length > 0) {
            text = text ? `${text}\n\n${t.text}` : t.text;
            articleCount += t.items.length;
            providers.push("tavily");
          }
        } catch (e) {
          console.error("[generate-copy] tavily 보강 실패:", e);
        }
      }

      // 둘 다 실패했을 때만 구글 뉴스 RSS (제목만 제공 → 내용이 얕음)
      if (!text) {
        try {
          const r = await fetchNews(keyword, 10);
          text = r.text;
          articleCount = r.items.length;
          providers.push("google");
        } catch {
          return NextResponse.json(
            { error: "뉴스 수집에 실패했어요. 잠시 후 다시 시도하거나 다른 키워드를 써보세요." },
            { status: 502 }
          );
        }
      }

      if (articleCount === 0 || text.length < 40) {
        return NextResponse.json(
          { error: `"${keyword}" 관련 최신 기사를 찾지 못했어요. 다른 키워드로 시도해보세요.` },
          { status: 404 }
        );
      }

      const content = text.length > MAX_SOURCE ? text.slice(0, MAX_SOURCE) : text;
      const gen = await generateSlides({ mode: "source", content });
      return NextResponse.json({ ...gen, articleCount, bodyCount, providers, grounded: true });
    }

    // ── 주제 모드 ──
    if (mode === "topic") {
      const clean = (body.topic ?? "").trim();
      if (!clean) return NextResponse.json({ error: "주제를 입력해주세요." }, { status: 400 });
      if (clean.length > 100)
        return NextResponse.json({ error: "주제가 너무 깁니다 (최대 100자)." }, { status: 400 });

      // 모델이 모르는 고유명사를 지어내지 않도록, 먼저 실제 자료를 찾아본다.
      // (예: "magnific spaces" → 모르면 'spaces=공간'으로 오해해 사무실 카드뉴스를 만들어버림)
      const ev = await collectEvidence(clean);
      if (isEnough(ev)) {
        const content = ev.text.length > MAX_SOURCE ? ev.text.slice(0, MAX_SOURCE) : ev.text;
        const gen = await generateSlides({
          mode: "source",
          content: `주제: ${clean}\n\n아래는 이 주제에 대해 수집한 실제 자료다.\n\n${content}`,
        });
        return NextResponse.json({
          ...gen,
          grounded: true,
          sourceCount: ev.count,
          providers: ev.providers,
        });
      }

      // 자료를 못 찾음 → 모델의 일반 지식으로 작성 (정확도 낮을 수 있음을 클라에 알림)
      const gen = await generateSlides({ mode: "topic", content: clean });
      return NextResponse.json({ ...gen, grounded: false });
    }

    // ── 소스(원문/URL) 모드 ──
    let content = (body.source ?? "").trim();
    if (!content) {
      return NextResponse.json({ error: "기사/블로그 본문 또는 URL을 붙여넣어 주세요." }, { status: 400 });
    }

    // URL만 붙인 경우 → 본문 추출 시도
    if (isMostlyUrl(content)) {
      const urls = extractUrls(content);
      const parts: string[] = [];
      const failed: string[] = [];
      for (const url of urls.slice(0, 3)) {
        try {
          const t = await fetchArticleText(url);
          if (t && t.length > 120) parts.push(t);
          else failed.push(url);
        } catch {
          failed.push(url);
        }
      }
      if (parts.length === 0) {
        return NextResponse.json(
          {
            error:
              "URL에서 본문을 가져오지 못했어요 (봇 차단/로그인 필요 등). 기사 본문을 직접 복사해서 붙여넣어 주세요.",
          },
          { status: 422 }
        );
      }
      content = parts.join("\n\n");
    }

    if (content.length < 30) {
      return NextResponse.json(
        { error: "내용이 너무 짧습니다. 기사/블로그 본문을 조금 더 붙여넣어 주세요." },
        { status: 400 }
      );
    }
    if (content.length > MAX_SOURCE) content = content.slice(0, MAX_SOURCE);

    const gen = await generateSlides({ mode: "source", content });
    return NextResponse.json({ ...gen });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    console.error("[generate-copy]", message);
    return NextResponse.json({ error: `카피 생성 실패: ${message}` }, { status: 500 });
  }
}
