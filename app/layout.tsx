import { Providers } from "@/components/providers";
import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import { getBaseUrl } from "@/lib/base-url";
import { GLASS_BOOT_SCRIPT } from "@/lib/glass-preference";
import { cn } from "@/lib/utils";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});
const appUrl = getBaseUrl();
const socialImage = "/images/social-card.png";
const description = "面向 GitHub 的省心 CMS";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    template: "%s | AIOVTUE",
    default: "AIOVTUE",
  },
  description,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: appUrl,
    siteName: "AIOVTUE",
    title: "AIOVTUE",
    description,
    images: [
      {
        url: socialImage,
        width: 1200,
        height: 630,
        alt: "AIOVTUE 社交卡片",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AIOVTUE",
    description,
    images: [socialImage],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {  
	return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body
        className={cn(
          "min-h-screen bg-background font-sans antialiased",
          inter.variable,
          jetbrainsMono.variable,
        )}
      >
        <Script id="glass-preference-boot" strategy="beforeInteractive">
          {GLASS_BOOT_SCRIPT}
        </Script>
        <Providers user={null}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
