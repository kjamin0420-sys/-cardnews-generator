import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "카드뉴스 생성기 · CardCraft",
  description: "주제 한 줄로 인스타 카드뉴스를 자동 생성합니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <head>
        {/* Pretendard — 한글 카드뉴스 표준 폰트 (진짜 텍스트 레이어) */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
