"use client";

import Link from "next/link";
import WalletButton from "./WalletButton";

const LINKS = [
  { href: "/", label: "REGISTER" },
  { href: "/work-orders/new", label: "NEW WORK ORDER" },
  { href: "/providers/new", label: "NEW PROVIDER" },
  { href: "/clearance/new", label: "NEW CLEARANCE" },
  { href: "/about", label: "ABOUT" },
];

export default function NavBar() {
  return (
    <header className="hairline-b bg-paper">
      <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-4">
        <Link href="/" className="font-ident text-lg font-bold tracking-tight">
          PERMITGRID
        </Link>
        <nav aria-label="Primary" className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-ident">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="uppercase tracking-wide text-ink-muted hover:text-ink hover:underline underline-offset-4"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto">
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
