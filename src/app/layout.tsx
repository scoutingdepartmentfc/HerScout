import type { Metadata } from "next";
import "./globals.css";
import { Barlow_Condensed, Inter } from "next/font/google";
import { ThemeProvider } from "@/context/ThemeContext";
import { AppShell } from "@/components/layout/AppShell";

const display = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-display",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "SPONDA | Premium Women's Football Scouting & Intelligence",
  description: "Multi-tenant scouting and player intelligence platform for professional football clubs.",
  icons: {
    icon: [
      { url: "/logo1.png", type: "image/png" },
    ],
    shortcut: "/logo1.png",
    apple: [
      { url: "/logo1.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${display.variable} ${inter.variable}`}>
      <body className="bg-background text-foreground">
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}

