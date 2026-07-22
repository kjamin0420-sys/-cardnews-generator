import { forwardRef } from "react";
import type { CSSProperties } from "react";
import type { Slide as SlideData } from "@/lib/slide-types";
import styles from "./Slide.module.css";

interface Props {
  slide: SlideData;
  accent: string;
  /** 미리보기 축소 배율 (1 = 실제 1080px). 캡처용은 항상 1. */
  scale?: number;
  className?: string;
}

// 그래픽(사진 없음) 모드 배경별 텍스트 컬러
function palette(bg: SlideData["bg"]) {
  if (bg === "ink") return { title: "#F4EEE2", lead: "#C9BFB0" };
  if (bg === "accent") return { title: "#1B1712", lead: "rgba(27,23,18,0.62)" };
  return { title: "#1B1712", lead: "#6B6157" };
}

const Slide = forwardRef<HTMLDivElement, Props>(function Slide(
  { slide, accent, scale = 1, className },
  ref
) {
  const wrapStyle: CSSProperties =
    scale === 1 ? {} : { transform: `scale(${scale})`, transformOrigin: "top left" };

  return (
    <div ref={ref} className={`${styles.slide} ${className ?? ""}`} style={wrapStyle}>
      {slide.bgImage ? (
        <PhotoLayout slide={slide} accent={accent} />
      ) : (
        <GraphicLayout slide={slide} accent={accent} />
      )}
    </div>
  );
});

/* ===== 사진 메인 레이아웃 (레퍼런스 스타일: 이미지 꽉 + 하단 텍스트) ===== */
function PhotoLayout({ slide, accent }: { slide: SlideData; accent: string }) {
  return (
    <>
      <div
        className={styles.layer}
        style={{
          backgroundImage: `url(${slide.bgImage})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <div className={`${styles.layer} ${styles.scrimBottom}`} />

      {/* 상단: 라벨 */}
      {slide.eyebrow && (
        <div className={styles.photoTop}>
          <div className={styles.pEyebrow} style={{ color: accent }}>
            {slide.eyebrow}
          </div>
        </div>
      )}

      {/* 하단: 텍스트 블록 */}
      <div className={styles.photoBottom}>
        {slide.kind === "cover" && <div className={styles.pBar} style={{ background: accent }} />}
        {slide.kind === "content" && (
          <div className={styles.pIndex} style={{ background: accent, color: "#161310" }}>
            {slide.index ?? "01"}
          </div>
        )}
        <div className={styles.pTitle}>{slide.title}</div>
        {slide.body && <div className={styles.pBody}>{slide.body}</div>}
        {slide.kind === "cta" && slide.handle && (
          <div className={styles.pHandle}>
            <span className={styles.dot} style={{ background: accent }} />
            {slide.handle}
          </div>
        )}
      </div>
    </>
  );
}

/* ===== 그래픽 레이아웃 (사진 제거 시 폴백: 단색/그라데이션 + 텍스트) ===== */
function GraphicLayout({ slide, accent }: { slide: SlideData; accent: string }) {
  const p = palette(slide.bg);
  return (
    <>
      {slide.bg === "ink" && <div className={`${styles.layer} ${styles.bgInk}`} />}
      {slide.bg === "cream" && <div className={`${styles.layer} ${styles.bgCream}`} />}
      {slide.bg === "accent" && (
        <div
          className={styles.layer}
          style={{ background: `linear-gradient(160deg, ${accent} 0%, ${shade(accent, -18)} 100%)` }}
        />
      )}
      {slide.bg === "ink" && <div className={`${styles.layer} ${styles.noise}`} />}

      {slide.kind === "cover" && (
        <div className={styles.pad}>
          <div className={styles.bar} style={{ background: accent }} />
          {slide.eyebrow && (
            <div className={styles.kicker} style={{ color: accent }}>
              {slide.eyebrow}
            </div>
          )}
          <div className={styles.spacer} />
          {slide.body && (
            <div className={styles.lead} style={{ color: p.lead, marginBottom: 24 }}>
              {slide.body}
            </div>
          )}
          <div className={styles.huge} style={{ color: p.title }}>
            {slide.title}
          </div>
        </div>
      )}

      {slide.kind === "content" && (
        <div className={styles.pad}>
          <div className={styles.num} style={{ color: accent }}>
            {slide.index ?? "01"}
          </div>
          <div className={styles.spacer} />
          <div className={styles.big} style={{ color: p.title }}>
            {slide.title}
          </div>
          {slide.body && (
            <div className={styles.lead} style={{ color: p.lead, marginTop: 30 }}>
              {slide.body}
            </div>
          )}
        </div>
      )}

      {slide.kind === "cta" && (
        <div className={`${styles.pad} ${styles.padCenter}`}>
          {slide.eyebrow && (
            <div className={styles.kicker} style={{ color: "rgba(27,23,18,0.7)" }}>
              {slide.eyebrow}
            </div>
          )}
          <div className={styles.big} style={{ color: p.title, marginTop: 24 }}>
            {slide.title}
          </div>
          {slide.body && (
            <div className={styles.lead} style={{ color: p.lead, marginTop: 28 }}>
              {slide.body}
            </div>
          )}
          <div className={styles.spacer} />
          {slide.handle && (
            <div className={styles.tag} style={{ color: p.title }}>
              <span className={styles.dot} style={{ background: p.title }} />
              {slide.handle}
            </div>
          )}
        </div>
      )}
    </>
  );
}

// hex 색상을 percent만큼 어둡게/밝게 (그라데이션용)
function shade(hex: string, percent: number): string {
  const m = hex.replace("#", "");
  if (m.length !== 6) return hex;
  const num = parseInt(m, 16);
  const amt = Math.round(2.55 * percent);
  const r = Math.max(0, Math.min(255, (num >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (num & 0xff) + amt));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export default Slide;
