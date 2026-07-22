import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel Hobby 플랜 상한. 이미지 1장 medium ≈ 55초

const OPENAI_GEN_URL = "https://api.openai.com/v1/images/generations";
const OPENAI_EDIT_URL = "https://api.openai.com/v1/images/edits";
const IMAGE_MODEL = "gpt-image-2"; // DetailCraft와 동일 (변경 금지)

type Tone = "ink" | "cream" | "accent";

// 톤은 "조명/노출"만 결정한다. 피사체는 오직 visual이 정한다.
const TONE_LIGHT: Record<Tone, string> = {
  ink: "shot in low-key lighting with dark surroundings, deep shadows",
  cream: "shot in bright soft daylight with light airy surroundings",
  accent: "shot with bold directional lighting and strong color contrast",
};

// 화면류: 지우지 말고 "빈 화면"으로 치환해 장면은 살린다
const SCREEN_PATTERNS: [RegExp, string][] = [
  [/\b(\w+\s+)?screens?\s+(showing|displaying|with|filled with)[^,]*/gi, "blank screens"],
  [/\b(monitor|display|laptop|phone|smartphone|tablet)s?\s+(showing|displaying|with)[^,]*/gi, "$1 with a blank screen"],
  [/\b(app|software|interface|ui|dashboard)\s+(showing|displaying)[^,]*/gi, "a blank screen"],
];

// 본질이 글자인 피사체: 해당 구절을 통째로 버린다
const TEXT_CLAUSE = new RegExp(
  [
    "\\b(texts?|words?|letters?|captions?|subtitles?|headlines?)\\b",
    "\\b(logos?|brands?|watermarks?)\\b",
    "\\b(charts?|graphs?|diagrams?|infographics?|spreadsheets?)\\b",
    "\\b(calendars?|timers?|clocks?)\\b",
    "\\b(signs?|signage|banners?|posters?|billboards?)\\b",
    "\\b(documents?|newspapers?|book covers?|presentation slides?)\\b",
    "\\b(speech bubbles?|notifications?|messages?)\\b",
    "\\b(numbers?|percentages?|price tags?|dates?)\\b",
  ].join("|"),
  "i"
);

/**
 * LLM이 규칙을 어기고 글자 피사체를 넣는 일이 잦아 코드로 강제한다.
 * ① 화면류는 "빈 화면"으로 치환(장면 유지) ② 본질이 글자인 구절은 제거
 * ③ 다 날아가면 장면이 앙상해지므로, 남은 첫 구절이라도 살린다.
 */
function sanitizeVisual(visual: string): string {
  let s = visual;
  for (const [re, rep] of SCREEN_PATTERNS) s = s.replace(re, rep);

  const clauses = s
    .split(/,|(?: with )|(?: featuring )/i)
    .map((c) => c.trim())
    .filter(Boolean);

  const kept = clauses.filter((c) => !TEXT_CLAUSE.test(c));
  if (kept.length > 0) {
    const result = kept.join(", ");
    // 너무 많이 깎여 장면이 앙상해지면(랜덤 이미지 위험) 원본을 쓴다.
    // 프롬프트의 "화면·간판은 비어있게 + NO text" 제약이 글자를 막아준다.
    if (result.split(/\s+/).length >= 4) return result;
    return visual;
  }

  // 전부 걸러진 경우: 첫 구절에서 금지 단어만 제거해 최소한의 장면을 남긴다
  const fallback = (clauses[0] ?? visual).replace(new RegExp(TEXT_CLAUSE.source, "gi"), "");
  return fallback.replace(/\s{2,}/g, " ").replace(/^[\s,]+|[\s,]+$/g, "").trim()
    || "a modern workspace interior, natural light";
}

// 제품 이미지가 있을 때: 레퍼런스 제품을 "그대로" 살려 장면에 배치
function buildProductPrompt(visual: string, tone: Tone) {
  return [
    "Use the product shown in the reference image as the hero of a photograph.",
    "CRITICAL: keep the product's exact shape, packaging, colors, logo and labels — do NOT redesign or invent a different product.",
    "Remove the product's original background and place it naturally into this scene:",
    `${visual}.`,
    TONE_LIGHT[tone],
    "The product sits in the upper or central area; keep a large empty area in the lower half for text overlay.",
    "Realistic product photography, soft natural lighting, subtle shadow under the product.",
    "NO text, NO words, NO letters, NO logos other than the product's own, NO watermarks, NO UI.",
    "Square 1:1 framing, full bleed.",
  ].join(" ");
}

// data URL(base64) → { blob, ext }
function dataUrlToBlob(dataUrl: string): { blob: Blob; ext: string } | null {
  const m = dataUrl.match(/^data:(image\/(png|jpe?g|webp));base64,(.+)$/);
  if (!m) return null;
  const mime = m[1];
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  const bytes = Buffer.from(m[3], "base64");
  return { blob: new Blob([new Uint8Array(bytes)], { type: mime }), ext };
}

function buildPrompt(visual: string, tone: Tone) {
  return [
    // ① 피사체 = 슬라이드 내용 (가장 중요)
    `Realistic editorial photograph: ${visual}.`,
    // ② 조명 톤
    TONE_LIGHT[tone],
    // ③ 카드뉴스 배경으로서의 조건
    "Simple uncluttered composition with a large empty area in the lower half where text will be placed.",
    "Shallow depth of field, natural colors, professional photography.",
    // ④ 금지 — 화면/종이/간판이 등장하더라도 반드시 비어 있게 (글자 렌더링 방지)
    "Any screen, paper, sign or label visible in the scene must be completely blank, switched off, or out of focus.",
    "NO text, NO words, NO letters, NO numbers, NO captions, NO logos, NO watermarks, NO user interface elements, NO speech bubbles.",
    "NOT an illustration, NOT a cartoon, NOT 3D render.",
    "Square 1:1 framing, full bleed.",
  ].join(" ");
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY 미설정" }, { status: 500 });
    }

    const { visual, tone, productImage } = (await req.json()) as {
      visual?: string;
      tone?: Tone;
      productImage?: string; // 제품 레퍼런스 (data URL)
    };
    const subject = (visual ?? "").trim();
    if (!subject) {
      return NextResponse.json(
        { error: "이미지 연출 지시(visual)가 없습니다." },
        { status: 400 }
      );
    }
    const toneKey: Tone = tone === "ink" || tone === "cream" || tone === "accent" ? tone : "ink";
    const safeSubject = sanitizeVisual(subject);

    // 제품 이미지가 있으면 edits 엔드포인트로 레퍼런스 제품을 살려 합성
    const product = productImage ? dataUrlToBlob(productImage) : null;

    // gpt-image-2는 분당 5장 제한 → 429면 안내된 시간만큼 기다렸다 재시도
    let resp: Response | null = null;
    let lastErr = "";
    for (let attempt = 1; attempt <= 4; attempt++) {
      if (product) {
        // /v1/images/edits (multipart) — 레퍼런스 제품 포함
        const form = new FormData();
        form.append("model", IMAGE_MODEL);
        form.append("prompt", buildProductPrompt(safeSubject, toneKey));
        form.append("size", "1024x1024");
        form.append("quality", "low"); // 제품 합성(edits)은 무거워서 60초 넘김 → low로 여유 확보
        form.append("n", "1");
        form.append("image[]", product.blob, `product.${product.ext}`);
        resp = await fetch(OPENAI_EDIT_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
        });
      } else {
        resp = await fetch(OPENAI_GEN_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: IMAGE_MODEL,
            prompt: buildPrompt(safeSubject, toneKey),
            n: 1,
            size: "1024x1024",
            quality: "medium",
          }),
        });
      }
      if (resp.ok) break;

      const body = await resp.text().catch(() => "");
      lastErr = `OpenAI ${resp.status}: ${body.slice(0, 200)}`;

      if (resp.status === 429 && attempt < 4) {
        // "Please try again in 12s" 안내를 읽어 그만큼(+여유) 대기
        const m = body.match(/try again in ([\d.]+)s/i);
        const wait = m ? Math.ceil(parseFloat(m[1])) + 2 : 15 * attempt;
        await new Promise((r) => setTimeout(r, wait * 1000));
        continue;
      }
      if (resp.status >= 500 && attempt < 4) {
        await new Promise((r) => setTimeout(r, 4000));
        continue;
      }
      break;
    }

    if (!resp || !resp.ok) {
      return NextResponse.json(
        { error: lastErr || "이미지 생성 실패" },
        { status: 502 }
      );
    }

    const result = await resp.json();
    const data = result?.data?.[0];
    let b64: string | undefined = data?.b64_json;

    // URL로 오는 경우 다운로드해서 base64 인라인 (CORS 회피 위해 data URL로 반환)
    if (!b64 && data?.url) {
      const img = await fetch(data.url);
      const buf = Buffer.from(await img.arrayBuffer());
      b64 = buf.toString("base64");
    }
    if (!b64) {
      return NextResponse.json({ error: "이미지 응답 없음" }, { status: 502 });
    }

    return NextResponse.json({ image: `data:image/png;base64,${b64}` });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    console.error("[generate-bg]", message);
    return NextResponse.json({ error: `배경 생성 실패: ${message}` }, { status: 500 });
  }
}
