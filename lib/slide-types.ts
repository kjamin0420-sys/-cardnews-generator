// 카드뉴스 슬라이드 데이터 모델
// 이미지를 통으로 그리지 않고, 이 데이터를 "레이어 템플릿"에 주입해 렌더링한다.

export type SlideKind = "cover" | "content" | "cta";
export type SlideBg = "ink" | "cream" | "accent";

export interface Slide {
  id: string;
  kind: SlideKind;
  bg: SlideBg;
  eyebrow?: string; // 상단 작은 라벨 (예: "EVENING ROUTINE", "SAVE THIS")
  index?: string; // content 슬라이드 큰 번호 (예: "01")
  title: string; // 메인 헤드라인
  body?: string; // 보조 문구
  handle?: string; // cta 계정 핸들 (예: "@detailcraft.daily")
  visual?: string; // 이 슬라이드에 어울리는 사진 연출 지시 (영문, 구체적 피사체)
  bgImage?: string; // AI 생성 배경 (data URL). 있으면 gradient/solid 대신 사진+스크림 렌더
}

export interface Deck {
  topic: string;
  accent: string; // 키컬러 hex
  slides: Slide[];
  caption?: string; // SNS 업로드용 본문
  hashtags?: string[]; // 주제 기반 해시태그 4~5개
}

// 엔딩 슬라이드는 매번 다르게 쓰지 않고 하나로 고정한다 (사용자 결정)
export const CTA_TITLE = "더 많은 정보를\n원한다면?";

// AI가 반환하는 원본(순서/스타일 결정 전) — id/bg는 클라이언트에서 채운다
export interface RawSlide {
  kind: SlideKind;
  eyebrow?: string;
  index?: string;
  title: string;
  body?: string;
  handle?: string;
  visual?: string;
}

let counter = 0;
export function makeId() {
  counter += 1;
  return `slide_${Date.now().toString(36)}_${counter}`;
}

// AI 원본 → 화면용 Deck. 배경은 표지=ink, cta=accent, 본문은 크림/잉크 교차.
export function toDeck(
  topic: string,
  accent: string,
  raw: RawSlide[],
  handle: string,
  extra?: { caption?: string; hashtags?: string[] }
): Deck {
  let contentSeen = 0;
  const slides: Slide[] = raw.map((r) => {
    // 엔딩은 AI 문구를 쓰지 않고 고정 (키컬러 배경 + 검정 글씨 + SNS 주소)
    if (r.kind === "cta") {
      return {
        id: makeId(),
        kind: "cta" as const,
        bg: "accent" as SlideBg,
        title: CTA_TITLE,
        handle,
      };
    }
    let bg: SlideBg = "cream";
    if (r.kind === "cover") bg = "ink";
    else {
      bg = contentSeen % 2 === 0 ? "cream" : "ink";
      contentSeen += 1;
    }
    return { ...r, id: makeId(), bg };
  });
  return { topic, accent, slides, caption: extra?.caption, hashtags: extra?.hashtags };
}
