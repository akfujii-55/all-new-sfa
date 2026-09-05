import type { Metadata } from "next";
import { Noto_Sans_JP } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const notoSansJP = Noto_Sans_JP({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: "SFA", template: "%s | SFA" },
  description: "中小企業向けのシンプルな営業支援ツール",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${notoSansJP.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
