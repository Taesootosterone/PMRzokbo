import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "리햅 · 재활의학 문제은행",
  description: "나의 속도로 쌓아가는 재활의학 학습 공간",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
