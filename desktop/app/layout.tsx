import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TitleBar } from "./components/TitleBar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dragon",
  description: "Paste a YouTube link. Highest quality video, thumbnail, and title.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body className="flex flex-col">
        <TitleBar />
        <div className="scroll-area relative flex-1 overflow-y-auto">
          {/* Accent glow sits behind the content and scrolls with it. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(60rem_28rem_at_50%_-10rem,rgba(255,45,85,0.14),transparent_70%)]"
          />
          {children}
        </div>
      </body>
    </html>
  );
}
