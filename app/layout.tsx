import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "cyrillic", "latin-ext"],
  variable: "--font-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin", "cyrillic", "latin-ext"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Streamer Wheel Provably Fair",
  description: "Commit-reveal fairness skeleton for streamer wheel giveaways",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
