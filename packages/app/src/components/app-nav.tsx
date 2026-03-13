"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { title: "Dashboard", href: "/" },
  { title: "Create", href: "/create" },
  { title: "Settings", href: "/settings" },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="max-w-[1200px] mx-auto px-6 sm:px-10 h-16 flex items-center justify-between">
        <Link href="/" className="font-mono text-sm tracking-tight">
          spectre<span className="text-muted-foreground/40">_</span>
        </Link>

        <nav className="flex items-center gap-8">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`font-mono text-xs transition-colors duration-300 ${
                  isActive
                    ? "text-sp"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.title}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground/50">
          <span className="size-1.5 rounded-full bg-sp animate-pulse" />
          <span className="hidden sm:inline">Base Sepolia</span>
        </div>
      </div>
    </header>
  );
}
