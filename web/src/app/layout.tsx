import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-google", display: "swap" });

export const metadata: Metadata = {
  title: "Codebase Investigator",
  description: "Ask questions about a public GitHub repo, with audited answers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const apiUrl = process.env.API_URL;
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__API__=${JSON.stringify(apiUrl)};`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
