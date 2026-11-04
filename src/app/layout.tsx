import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/context/ThemeContext";
import { AppShell } from "@/components/layout/AppShell";

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
    <html lang="en" className="dark">
      <body className="bg-background text-foreground">
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}

