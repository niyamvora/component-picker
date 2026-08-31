import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Nav } from "@/components/site/nav";
import { Footer } from "@/components/site/footer";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Component Picker — 59 issues, one extension",
    template: "%s · Component Picker",
  },
  description:
    "Hover any component on any site, click, and your clipboard holds an AI-ready bundle. Every issue that built it, and the shot list for the demo.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <div className="relative flex min-h-dvh flex-col">
            {/* Ambient wash — fixed so it never scrolls out from under the glass. */}
            <div
              aria-hidden
              className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(60rem_40rem_at_50%_-10%,color-mix(in_oklab,var(--iris)_22%,transparent),transparent),radial-gradient(50rem_30rem_at_90%_20%,color-mix(in_oklab,var(--cyan)_14%,transparent),transparent)]"
            />
            <div aria-hidden className="grid-bg pointer-events-none fixed inset-0 -z-10 opacity-70" />
            <Nav />
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
