import type { Metadata } from "next";
import localFont from "next/font/local";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const dmSans = localFont({
  src: [
    { path: "../fonts/DMSans-Light.woff2", weight: "300", style: "normal" },
    { path: "../fonts/DMSans-Regular.woff2", weight: "400", style: "normal" },
    { path: "../fonts/DMSans-Medium.woff2", weight: "500", style: "normal" },
    { path: "../fonts/DMSans-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-dm-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Hardware Service Decision Copilot",
  description:
    "Asystent wstępnej decyzji serwisowej: oceń zgłoszenie sprzętu na podstawie zdjęcia i opisu usterki.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pl" className={`${dmSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col overflow-x-hidden">
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
