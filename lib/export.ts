import { toPng } from "html-to-image";
import JSZip from "jszip";

// 슬라이드 노드는 실제 1080x1080. pixelRatio 1로 캡처하면 정확히 1080px PNG.
const CAPTURE_OPTS = {
  width: 1080,
  height: 1080,
  pixelRatio: 1,
  cacheBust: true,
} as const;

// 웹폰트(Pretendard) 로딩이 끝난 뒤 캡처해야 글자가 안 깨진다.
async function waitForFonts() {
  if (typeof document !== "undefined" && "fonts" in document) {
    try {
      await document.fonts.ready;
    } catch {
      /* 무시 */
    }
  }
}

async function nodeToBlob(node: HTMLElement): Promise<Blob> {
  const dataUrl = await toPng(node, CAPTURE_OPTS);
  const res = await fetch(dataUrl);
  return res.blob();
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** 슬라이드 한 장 PNG 다운로드 */
export async function downloadSlide(node: HTMLElement, index: number) {
  await waitForFonts();
  const blob = await nodeToBlob(node);
  triggerDownload(blob, `card_${String(index + 1).padStart(2, "0")}.png`);
}

/** 전체 슬라이드를 ZIP 하나로 묶어 다운로드 */
export async function downloadAllAsZip(nodes: HTMLElement[], topic: string) {
  await waitForFonts();
  const zip = new JSZip();
  for (let i = 0; i < nodes.length; i++) {
    const blob = await nodeToBlob(nodes[i]);
    zip.file(`card_${String(i + 1).padStart(2, "0")}.png`, blob);
  }
  const content = await zip.generateAsync({ type: "blob" });
  const safe = topic.replace(/[\\/:*?"<>|]/g, "").slice(0, 30) || "cardnews";
  triggerDownload(content, `${safe}.zip`);
}
