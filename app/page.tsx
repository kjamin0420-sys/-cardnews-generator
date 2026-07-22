"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteEntry,
  listHistory,
  loadDeck,
  saveDeck,
  type HistoryMeta,
} from "@/lib/history";
import Slide from "@/components/Slide";
import { downloadAllAsZip, downloadSlide } from "@/lib/export";
import {
  type Deck,
  type Slide as SlideData,
  type SlideBg,
  makeId,
  toDeck,
} from "@/lib/slide-types";

const PREVIEW_W = 280; // 미리보기 표시 너비(px). 실제 슬라이드는 1080px.
const SCALE = PREVIEW_W / 1080;

const ACCENTS = ["#FF6B2C", "#2F6BFF", "#16A34A", "#E4447C", "#7C3AED", "#0EA5A0"];
const EXAMPLES = [
  "퇴근 후 저녁 루틴",
  "초보 재테크 5단계",
  "카페 창업 전 체크리스트",
  "번아웃 극복하는 법",
];

// 구조 변경 후 content 슬라이드 번호를 01, 02… 로 재정렬
function normalize(slides: SlideData[]): SlideData[] {
  let n = 0;
  return slides.map((s) => {
    if (s.kind !== "content") return s;
    n += 1;
    return { ...s, index: String(n).padStart(2, "0") };
  });
}

type InputMode = "news" | "source" | "topic";

const KEYWORD_EXAMPLES = ["AI 영상 생성", "테슬라 로봇", "금리 인하", "다이어트 트렌드"];

// 소스 모드: 카드 제목에서 배경 프롬프트/파일명용 주제를 뽑아냄
function deriveTopic(slides: SlideData[], fallback: string): string {
  const cover = slides.find((s) => s.kind === "cover") ?? slides[0];
  const t = (cover?.title ?? fallback).replace(/\n/g, " ").trim();
  return t.slice(0, 40) || fallback;
}

export default function Home() {
  const [mode, setMode] = useState<InputMode>("news");
  const [topic, setTopic] = useState("");
  const [source, setSource] = useState("");
  const [keyword, setKeyword] = useState("");
  const [handle, setHandle] = useState("@my_account");
  const [productImage, setProductImage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [ungrounded, setUngrounded] = useState(false); // 자료 없이 일반지식으로 작성됨
  const [deckId, setDeckId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryMeta[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [accent, setAccent] = useState(ACCENTS[0]);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bgBusy, setBgBusy] = useState<Set<string>>(new Set()); // 배경 생성 중인 슬라이드 id
  const [bgAllRunning, setBgAllRunning] = useState(false);

  // 기록 목록 불러오기
  const refreshHistory = useCallback(() => {
    listHistory()
      .then(setHistory)
      .catch(() => {});
  }, []);
  useEffect(() => refreshHistory(), [refreshHistory]);

  // 덱이 바뀌면 자동 저장 (편집·배경 추가 포함, 1초 디바운스)
  useEffect(() => {
    if (!deck || !deckId) return;
    const t = setTimeout(() => {
      saveDeck(deckId, deck)
        .then(refreshHistory)
        .catch((e) => console.error("자동 저장 실패", e));
    }, 1000);
    return () => clearTimeout(t);
  }, [deck, deckId, refreshHistory]);

  async function openHistoryItem(id: string) {
    const d = await loadDeck(id);
    if (!d) return;
    setDeck(d);
    setDeckId(id);
    setAccent(d.accent);
    setUngrounded(false);
    setShowHistory(false);
    nodeRefs.current.clear();
  }

  async function removeHistoryItem(id: string) {
    await deleteEntry(id);
    if (deckId === id) setDeckId(null);
    refreshHistory();
  }

  // 캡처용 실제 1080px 슬라이드 노드 참조
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const setNodeRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) nodeRefs.current.set(id, el);
    else nodeRefs.current.delete(id);
  }, []);

  async function handleGenerate() {
    const clean = (mode === "topic" ? topic : mode === "news" ? keyword : source).trim();
    if (!clean) {
      setError(
        mode === "topic"
          ? "주제를 입력해주세요."
          : mode === "news"
            ? "검색 키워드를 입력해주세요."
            : "기사/블로그 본문 또는 URL을 붙여넣어 주세요."
      );
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload =
        mode === "topic"
          ? { mode, topic: clean }
          : mode === "news"
            ? { mode, keyword: clean }
            : { mode, source: clean };
      const res = await fetch("/api/generate-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "생성 실패");
      // 주제 모드인데 근거 자료를 못 찾았으면 정확도 경고를 띄운다
      setUngrounded(mode === "topic" && data.grounded === false);
      // 주제/뉴스는 입력값을, 붙여넣기는 표지 제목에서 주제를 도출
      const newTopic =
        mode === "source" ? deriveTopic(data.slides, "카드뉴스") : clean;
      const newDeck = toDeck(newTopic, accent, data.slides, handle, {
        caption: data.caption,
        hashtags: data.hashtags,
      });
      setDeck(newDeck);
      setDeckId(makeId()); // 새 기록으로 저장 (이후 편집도 자동 반영)
      // 엔딩(cta)은 키컬러 단색이라 사진이 필요 없다 → 배경 생성에서 제외
      void runBgBatch(newDeck.slides.filter((s) => s.kind !== "cta"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  }

  function updateSlide(id: string, patch: Partial<SlideData>) {
    setDeck((d) =>
      d ? { ...d, slides: d.slides.map((s) => (s.id === id ? { ...s, ...patch } : s)) } : d
    );
  }
  function removeSlide(id: string) {
    setDeck((d) => (d ? { ...d, slides: normalize(d.slides.filter((s) => s.id !== id)) } : d));
    nodeRefs.current.delete(id);
  }
  function moveSlide(id: string, dir: -1 | 1) {
    setDeck((d) => {
      if (!d) return d;
      const i = d.slides.findIndex((s) => s.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= d.slides.length) return d;
      const next = [...d.slides];
      [next[i], next[j]] = [next[j], next[i]];
      return { ...d, slides: normalize(next) };
    });
  }
  function addSlide() {
    setDeck((d) => {
      if (!d) return d;
      const newSlide: SlideData = {
        id: makeId(),
        kind: "content",
        bg: "cream",
        index: "00",
        title: "새 슬라이드",
        body: "여기에 내용을 입력하세요.",
      };
      const ctaIdx = d.slides.findIndex((s) => s.kind === "cta");
      const at = ctaIdx === -1 ? d.slides.length : ctaIdx;
      const next = [...d.slides.slice(0, at), newSlide, ...d.slides.slice(at)];
      return { ...d, slides: normalize(next) };
    });
  }

  async function handleDownloadAll() {
    if (!deck) return;
    setExporting(true);
    setError(null);
    try {
      const nodes = deck.slides
        .map((s) => nodeRefs.current.get(s.id))
        .filter((n): n is HTMLDivElement => !!n);
      await downloadAllAsZip(nodes, deck.topic);
    } catch (err) {
      setError(err instanceof Error ? err.message : "내보내기 실패");
    } finally {
      setExporting(false);
    }
  }

  async function handleDownloadOne(id: string, index: number) {
    const node = nodeRefs.current.get(id);
    if (!node) return;
    try {
      await downloadSlide(node, index);
    } catch (err) {
      setError(err instanceof Error ? err.message : "내보내기 실패");
    }
  }

  // 제품 이미지 업로드 → 최대 1024px로 축소해 data URL로 보관
  async function handleProductUpload(file: File) {
    try {
      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const img = new Image();
      img.src = url;
      await img.decode();
      const max = 1024;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
      // 투명 배경 보존 위해 PNG
      setProductImage(c.toDataURL("image/png"));
    } catch {
      setError("이미지를 읽지 못했어요. 다른 파일로 시도해주세요.");
    }
  }

  // 슬라이드 1장 AI 배경 생성 — 그 슬라이드 내용(visual)으로 그린다
  async function generateBg(slide: SlideData) {
    // 연출 지시가 없으면 제목을 피사체 힌트로 사용
    const visual = slide.visual?.trim() || `a scene representing: ${slide.title.replace(/\n/g, " ")}`;
    setBgBusy((prev) => new Set(prev).add(slide.id));
    try {
      const res = await fetch("/api/generate-bg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visual, tone: slide.bg, productImage: productImage ?? undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "배경 생성 실패");
      updateSlide(slide.id, { bgImage: data.image });
    } catch (err) {
      setError(err instanceof Error ? err.message : "배경 생성 실패");
      throw err;
    } finally {
      setBgBusy((prev) => {
        const next = new Set(prev);
        next.delete(slide.id);
        return next;
      });
    }
  }

  // 배경 병렬 생성 — gpt-image-2가 분당 5장 제한이라 동시 실행을 4개로 묶는다.
  // (전부 한꺼번에 던지면 6번째부터 429로 튕김. 서버에서도 429 재시도함)
  async function runBgBatch(slides: SlideData[]) {
    setBgAllRunning(true);
    setError(null);
    const CONCURRENCY = 4;
    const queue = [...slides];
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length > 0) {
        const s = queue.shift();
        if (!s) break;
        await generateBg(s).catch(() => {});
      }
    });
    await Promise.allSettled(workers);
    setBgAllRunning(false);
  }

  function generateAllBg() {
    if (!deck) return;
    void runBgBatch(deck.slides.filter((s) => s.kind !== "cta"));
  }

  // 업로드용 본문 + 해시태그를 클립보드로
  async function copyCaption() {
    if (!deck) return;
    const text = [deck.caption ?? "", (deck.hashtags ?? []).join(" ")]
      .filter(Boolean)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("클립보드 복사에 실패했어요. 직접 선택해서 복사해주세요.");
    }
  }

  return (
    <div className="min-h-full">
      {/* 헤더 */}
      <header
        className="sticky top-0 z-20 flex items-center justify-between border-b px-6 py-3.5 backdrop-blur"
        style={{ borderColor: "var(--line)", background: "color-mix(in srgb, var(--panel) 90%, transparent)" }}
      >
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg text-white" style={{ background: accent }}>🗂️</span>
          <div>
            <div className="text-[15px] font-bold leading-none">CardCraft</div>
            <div className="text-[11px]" style={{ color: "var(--muted)" }}>인스타 카드뉴스 자동 생성</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              refreshHistory();
              setShowHistory((v) => !v);
            }}
            className="rounded-lg border px-3 py-2 text-[13px] font-semibold transition hover:opacity-90"
            style={{ borderColor: "var(--line)", color: "var(--ink)" }}
          >
            📚 기록 {history.length > 0 && `(${history.length})`}
          </button>
          {deck && (
            <>
              <button
                onClick={generateAllBg}
                disabled={bgAllRunning}
                className="rounded-lg border px-4 py-2 text-[13px] font-semibold transition hover:opacity-90"
                style={{ borderColor: "var(--line)", color: "var(--ink)" }}
              >
                {bgAllRunning ? "배경 생성 중…" : "🎨 전체 배경 생성"}
              </button>
              <button
                onClick={handleDownloadAll}
                disabled={exporting}
                className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white transition hover:opacity-90"
                style={{ background: "var(--ink)" }}
              >
                {exporting ? "내보내는 중…" : `전체 다운로드 (ZIP · ${deck.slides.length}장)`}
              </button>
            </>
          )}
        </div>
      </header>

      {/* 기록 패널 */}
      {showHistory && (
        <div className="border-b" style={{ borderColor: "var(--line)", background: "var(--panel)" }}>
          <div className="mx-auto max-w-[1400px] px-6 py-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[14px] font-bold">📚 만든 카드뉴스</span>
              <span className="text-[12px]" style={{ color: "var(--muted)" }}>
                이 브라우저에 저장됩니다 · 최근 20개 유지
              </span>
            </div>
            {history.length === 0 ? (
              <p className="py-6 text-center text-[13px]" style={{ color: "var(--muted)" }}>
                아직 저장된 기록이 없어요. 카드뉴스를 만들면 자동으로 저장됩니다.
              </p>
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {history.map((h) => (
                  <div
                    key={h.id}
                    className="relative shrink-0 rounded-xl border p-2 transition hover:border-[var(--brand)]"
                    style={{
                      borderColor: h.id === deckId ? accent : "var(--line)",
                      width: 150,
                    }}
                  >
                    <button onClick={() => openHistoryItem(h.id)} className="block w-full text-left">
                      <div
                        className="mb-1.5 overflow-hidden rounded-lg bg-[var(--bg)]"
                        style={{ width: 134, height: 134 }}
                      >
                        {h.thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={h.thumb} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="grid h-full place-items-center text-[11px]" style={{ color: "var(--muted)" }}>
                            이미지 없음
                          </div>
                        )}
                      </div>
                      <p className="line-clamp-2 text-[12px] font-semibold leading-tight">{h.topic}</p>
                      <p className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>
                        {h.slideCount}장 · {new Date(h.createdAt).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}
                      </p>
                    </button>
                    <button
                      onClick={() => removeHistoryItem(h.id)}
                      title="삭제"
                      className="absolute right-1 top-1 rounded-full bg-black/50 px-1.5 text-[11px] text-white hover:bg-red-500"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-6 py-6 lg:flex-row">
        {/* 좌측 컨트롤 */}
        <aside className="w-full shrink-0 lg:w-[340px]">
          <div className="sticky top-[76px] flex flex-col gap-4 rounded-2xl border bg-[var(--panel)] p-5" style={{ borderColor: "var(--line)" }}>
            <div>
              {/* 입력 모드 토글 */}
              <div className="mb-2.5 grid grid-cols-3 gap-1 rounded-lg border p-1" style={{ borderColor: "var(--line)" }}>
                {([
                  ["news", "🔥 뉴스"],
                  ["source", "📋 붙여넣기"],
                  ["topic", "✏️ 주제"],
                ] as [InputMode, string][]).map(([m, label]) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className="rounded-md py-1.5 text-[12px] font-semibold transition"
                    style={
                      mode === m
                        ? { background: accent, color: "#fff" }
                        : { color: "var(--muted)" }
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>

              {mode === "news" && (
                <>
                  <input
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
                    placeholder="예: AI 영상 생성"
                    maxLength={60}
                    className="w-full rounded-lg border px-3 py-2.5 text-[14px] outline-none focus:border-[var(--brand)]"
                    style={{ borderColor: "var(--line)", background: "var(--bg)" }}
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {KEYWORD_EXAMPLES.map((ex) => (
                      <button
                        key={ex}
                        onClick={() => setKeyword(ex)}
                        className="rounded-full border px-2.5 py-1 text-[12px] transition hover:border-[var(--brand)]"
                        style={{ borderColor: "var(--line)", color: "var(--muted)" }}
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11px]" style={{ color: "var(--muted)" }}>
                    키워드 관련 최신 뉴스를 자동 수집해 사실 기반으로 카드를 만듭니다.
                  </p>
                </>
              )}

              {mode === "topic" && (
                <>
                  <textarea
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="예: 퇴근 후 저녁 루틴"
                    rows={2}
                    maxLength={100}
                    className="w-full resize-none rounded-lg border px-3 py-2.5 text-[14px] outline-none focus:border-[var(--brand)]"
                    style={{ borderColor: "var(--line)", background: "var(--bg)" }}
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {EXAMPLES.map((ex) => (
                      <button
                        key={ex}
                        onClick={() => setTopic(ex)}
                        className="rounded-full border px-2.5 py-1 text-[12px] transition hover:border-[var(--brand)]"
                        style={{ borderColor: "var(--line)", color: "var(--muted)" }}
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {mode === "source" && (
                <>
                  <textarea
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    placeholder={"기사·블로그 본문을 붙여넣거나\nURL을 입력하세요"}
                    rows={7}
                    className="w-full resize-none rounded-lg border px-3 py-2.5 text-[13px] leading-relaxed outline-none focus:border-[var(--brand)]"
                    style={{ borderColor: "var(--line)", background: "var(--bg)" }}
                  />
                  <p className="mt-1.5 text-[11px]" style={{ color: "var(--muted)" }}>
                    붙인 내용의 사실만 카드로 만듭니다. URL은 추출을 시도하되, 실패하면
                    본문을 직접 붙여주세요.
                  </p>
                </>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-[13px] font-semibold">키컬러</label>
              <div className="flex flex-wrap items-center gap-2">
                {ACCENTS.map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      setAccent(c);
                      setDeck((d) => (d ? { ...d, accent: c } : d));
                    }}
                    className="h-7 w-7 rounded-full transition"
                    style={{ background: c, outline: accent === c ? `2px solid ${c}` : "none", outlineOffset: 2 }}
                    aria-label={c}
                  />
                ))}
                <label className="ml-1 grid h-7 w-7 cursor-pointer place-items-center rounded-full border text-[11px]" style={{ borderColor: "var(--line)" }}>
                  +
                  <input
                    type="color"
                    value={accent}
                    onChange={(e) => {
                      setAccent(e.target.value);
                      setDeck((d) => (d ? { ...d, accent: e.target.value } : d));
                    }}
                    className="sr-only"
                  />
                </label>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-[13px] font-semibold">SNS 계정</label>
              <input
                value={handle}
                onChange={(e) => {
                  const v = e.target.value;
                  setHandle(v);
                  // 엔딩 슬라이드에 즉시 반영
                  setDeck((d) =>
                    d
                      ? {
                          ...d,
                          slides: d.slides.map((s) =>
                            s.kind === "cta" ? { ...s, handle: v } : s
                          ),
                        }
                      : d
                  );
                }}
                placeholder="@my_account"
                maxLength={40}
                className="w-full rounded-lg border px-3 py-2 text-[13px] outline-none focus:border-[var(--brand)]"
                style={{ borderColor: "var(--line)", background: "var(--bg)" }}
              />
              <p className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>
                마지막 장에 표시됩니다.
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-[13px] font-semibold">
                제품 이미지 <span className="font-normal" style={{ color: "var(--muted)" }}>(선택)</span>
              </label>
              {productImage ? (
                <div className="flex items-center gap-3">
                  <div
                    className="shrink-0 overflow-hidden rounded-lg border"
                    style={{ width: 56, height: 56, borderColor: "var(--line)", background: "var(--bg)" }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={productImage} alt="제품" className="h-full w-full object-contain" />
                  </div>
                  <button
                    onClick={() => setProductImage(null)}
                    className="text-[12px] underline"
                    style={{ color: "var(--muted)" }}
                  >
                    제품 이미지 제거
                  </button>
                </div>
              ) : (
                <label
                  className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed py-3 text-[12.5px] transition hover:border-[var(--brand)]"
                  style={{ borderColor: "var(--line)", color: "var(--muted)" }}
                >
                  📦 제품 사진 올리기
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleProductUpload(f);
                    }}
                  />
                </label>
              )}
              <p className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>
                올리면 배경에 <b>실제 제품</b>이 그대로 들어갑니다 (배경은 AI가 자동 제거).
              </p>
            </div>

            <button
              onClick={handleGenerate}
              disabled={loading}
              className="rounded-lg py-3 text-[14px] font-bold text-white transition hover:opacity-90"
              style={{ background: accent }}
            >
              {loading ? "AI가 작성 중…" : deck ? "다시 생성" : "카드뉴스 생성"}
            </button>

            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-600">{error}</p>}

            <p className="text-[12px] leading-relaxed" style={{ color: "var(--muted)" }}>
              💡 슬라이드의 문구·색·순서는 아래에서 직접 편집할 수 있어요. 텍스트는 실제
              폰트로 렌더링되어 한글이 깨지지 않습니다.
            </p>
          </div>
        </aside>

        {/* 우측 슬라이드 그리드 */}
        <main className="min-w-0 flex-1">
          {!deck && !loading && (
            <div className="grid place-items-center rounded-2xl border border-dashed py-24 text-center" style={{ borderColor: "var(--line)" }}>
              <div>
                <div className="text-4xl">🗂️</div>
                <p className="mt-3 text-[15px] font-semibold">주제를 입력하고 생성해보세요</p>
                <p className="mt-1 text-[13px]" style={{ color: "var(--muted)" }}>
                  AI가 표지 → 팁 → 저장유도까지 슬라이드를 자동으로 구성합니다.
                </p>
              </div>
            </div>
          )}

          {loading && (
            <div className="grid place-items-center rounded-2xl border py-24" style={{ borderColor: "var(--line)" }}>
              <div className="text-center">
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent" style={{ color: accent }} />
                <p className="mt-4 text-[14px] font-semibold">
                  {mode === "news" ? "최신 뉴스 수집 + 카드 작성 중…" : "카피팀이 슬라이드를 짜는 중…"}
                </p>
              </div>
            </div>
          )}

          {deck && ungrounded && (
            <div
              className="mb-4 rounded-xl border px-4 py-3 text-[13px] leading-relaxed"
              style={{ borderColor: "#F0C36D", background: "#FFF8E6", color: "#7A5A12" }}
            >
              ⚠️ 이 주제에 대한 <b>자료를 찾지 못해 AI의 일반 지식으로</b> 작성했어요.
              고유명사(서비스·제품명)가 포함된 주제라면 내용이 사실과 다를 수 있습니다.
              정확도가 중요하면 <b>🔥 뉴스</b>나 <b>📋 붙여넣기</b> 모드를 써주세요.
            </div>
          )}

          {deck && (deck.caption || (deck.hashtags?.length ?? 0) > 0) && (
            <div
              className="mb-5 rounded-2xl border bg-[var(--panel)] p-4"
              style={{ borderColor: "var(--line)" }}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[13px] font-bold">📝 업로드용 글</span>
                <button
                  onClick={copyCaption}
                  className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white transition hover:opacity-90"
                  style={{ background: copied ? "#16A34A" : "var(--ink)" }}
                >
                  {copied ? "복사됨 ✓" : "본문 + 해시태그 복사"}
                </button>
              </div>
              {deck.caption && (
                <p className="whitespace-pre-line text-[13px] leading-relaxed">{deck.caption}</p>
              )}
              {(deck.hashtags?.length ?? 0) > 0 && (
                <p className="mt-2 text-[13px] font-medium" style={{ color: accent }}>
                  {deck.hashtags!.join(" ")}
                </p>
              )}
            </div>
          )}

          {deck && (
            <div className="flex flex-wrap gap-5">
              {deck.slides.map((s, i) => (
                <div key={s.id} className="rounded-2xl border bg-[var(--panel)] p-3" style={{ borderColor: "var(--line)", width: PREVIEW_W + 24 }}>
                  {/* 미리보기: 뷰포트(축소) 안에 실제 1080 노드 */}
                  <div className="relative overflow-hidden rounded-xl" style={{ width: PREVIEW_W, height: PREVIEW_W }}>
                    <div style={{ transform: `scale(${SCALE})`, transformOrigin: "top left", width: 1080, height: 1080 }}>
                      <Slide ref={(el) => setNodeRef(s.id, el)} slide={s} accent={deck.accent} />
                    </div>
                    {bgBusy.has(s.id) && (
                      <div className="absolute inset-0 grid place-items-center bg-black/45 text-white">
                        <div className="text-center">
                          <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          <p className="mt-2 text-[12px] font-semibold">배경 생성 중…</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 컨트롤 */}
                  <div className="mt-2.5 flex items-center justify-between text-[12px]" style={{ color: "var(--muted)" }}>
                    <span className="font-semibold uppercase">{s.kind} · {i + 1}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => moveSlide(s.id, -1)} title="위로" className="rounded px-1.5 py-0.5 hover:bg-[var(--bg)]">↑</button>
                      <button onClick={() => moveSlide(s.id, 1)} title="아래로" className="rounded px-1.5 py-0.5 hover:bg-[var(--bg)]">↓</button>
                      <button
                        onClick={() => generateBg(s).catch(() => {})}
                        disabled={bgBusy.has(s.id) || bgAllRunning}
                        title={s.bgImage ? "배경 다시 생성" : "AI 배경 생성"}
                        className="rounded px-1.5 py-0.5 hover:bg-[var(--bg)]"
                      >
                        {s.bgImage ? "🔄" : "🎨"}
                      </button>
                      <button onClick={() => handleDownloadOne(s.id, i)} title="이 장 PNG" className="rounded px-1.5 py-0.5 hover:bg-[var(--bg)]">⬇</button>
                      <button onClick={() => removeSlide(s.id)} title="삭제" className="rounded px-1.5 py-0.5 text-red-500 hover:bg-red-50">✕</button>
                    </div>
                  </div>

                  {/* 편집 필드 */}
                  <div className="mt-2 flex flex-col gap-1.5">
                    {(s.kind === "cover" || s.kind === "cta") && (
                      <input
                        value={s.eyebrow ?? ""}
                        onChange={(e) => updateSlide(s.id, { eyebrow: e.target.value })}
                        placeholder="라벨 (영문)"
                        className="rounded border px-2 py-1 text-[12px] outline-none focus:border-[var(--brand)]"
                        style={{ borderColor: "var(--line)" }}
                      />
                    )}
                    <textarea
                      value={s.title}
                      onChange={(e) => updateSlide(s.id, { title: e.target.value })}
                      rows={2}
                      placeholder="제목 (줄바꿈 가능)"
                      className="resize-none rounded border px-2 py-1 text-[13px] font-semibold outline-none focus:border-[var(--brand)]"
                      style={{ borderColor: "var(--line)" }}
                    />
                    <textarea
                      value={s.body ?? ""}
                      onChange={(e) => updateSlide(s.id, { body: e.target.value })}
                      rows={2}
                      placeholder="설명"
                      className="resize-none rounded border px-2 py-1 text-[12px] outline-none focus:border-[var(--brand)]"
                      style={{ borderColor: "var(--line)" }}
                    />
                    {s.kind === "cta" && (
                      <input
                        value={s.handle ?? ""}
                        onChange={(e) => updateSlide(s.id, { handle: e.target.value })}
                        placeholder="@계정핸들"
                        className="rounded border px-2 py-1 text-[12px] outline-none focus:border-[var(--brand)]"
                        style={{ borderColor: "var(--line)" }}
                      />
                    )}
                    <select
                      value={s.bg}
                      onChange={(e) => updateSlide(s.id, { bg: e.target.value as SlideBg })}
                      className="rounded border px-2 py-1 text-[12px] outline-none"
                      style={{ borderColor: "var(--line)" }}
                    >
                      <option value="ink">배경: 잉크(다크)</option>
                      <option value="cream">배경: 크림(라이트)</option>
                      <option value="accent">배경: 키컬러</option>
                    </select>
                    {s.bgImage && (
                      <button
                        onClick={() => updateSlide(s.id, { bgImage: undefined })}
                        className="text-left text-[11px] underline"
                        style={{ color: "var(--muted)" }}
                      >
                        AI 배경 사진 제거
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {/* 슬라이드 추가 */}
              <button
                onClick={addSlide}
                className="grid place-items-center rounded-2xl border border-dashed text-[13px] transition hover:border-[var(--brand)]"
                style={{ borderColor: "var(--line)", width: PREVIEW_W + 24, minHeight: PREVIEW_W }}
              >
                <span style={{ color: "var(--muted)" }}>＋ 슬라이드 추가</span>
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
