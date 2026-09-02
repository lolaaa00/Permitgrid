import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/lib/wallet";
import NavBar from "@/components/NavBar";

const bodyFont = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

const identFont = JetBrains_Mono({
  variable: "--font-ident",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PermitGrid",
  description:
    "PermitGrid — consensus-backed regulated-work clearance protocol on GenLayer.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${bodyFont.variable} ${identFont.variable} h-full`}
    >
      <body className="min-h-full flex flex-col bg-paper text-ink">
        <WalletProvider>
          <NavBar />
          <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-6">
            {children}
          </main>
          <footer className="hairline-t px-4 py-3 text-xs text-ink-muted">
            <div className="max-w-6xl mx-auto flex flex-wrap gap-x-4 gap-y-1 items-center">
              <span className="font-ident">PERMITGRID</span>
              <span>consensus-backed regulated-work clearance protocol</span>
              <span className="ml-auto font-ident">GenLayer / chain 61999</span>
            </div>
          </footer>
        </WalletProvider>
      </body>
    </html>
  );
}
