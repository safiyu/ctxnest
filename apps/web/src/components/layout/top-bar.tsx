"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { AnimatedLogo } from "./animated-logo";

interface TopBarProps {
  onSearch: () => void;
  onNewFile: () => void;
  onAbout: () => void;
}

export function TopBar({ onSearch, onNewFile, onAbout }: TopBarProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <header className="h-[88px] bg-gradient-to-r from-[var(--bg-secondary)] via-[var(--bg-tertiary)] to-[var(--bg-secondary)] flex items-center justify-between px-5 border-b border-[var(--border)] overflow-visible shadow-sm">
      <div className="flex items-center">
        <AnimatedLogo size="sm" />
        <span
          className="-ml-4 font-extrabold text-2xl tracking-[4px] font-[family-name:var(--font-title)] text-amber-accent drop-shadow-[0_0_15px_rgba(212,144,58,0.6)]"
        >
          CTXNEST
        </span>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onSearch}
          className="px-4 py-1.5 bg-gray-100 dark:bg-[#2a2a2a] text-sm text-gray-600 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-[#333333] transition-all duration-200 flex items-center gap-3 border border-transparent hover:border-amber-accent/30 hover:shadow-[0_0_8px_rgba(212,144,58,0.15)]"
        >
          <span>Search...</span>
          <kbd className="text-xs text-gray-500 bg-[#1a1a1a] px-1.5 py-0.5 rounded">⌘K</kbd>
        </button>

        <button
          onClick={onNewFile}
          className="px-4 py-1.5 bg-amber-accent text-sm font-bold text-black rounded-md hover:bg-amber-accent-dark transition-colors btn-press"
        >
          + NEW
        </button>

        {mounted && (
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="w-9 h-9 flex items-center justify-center text-lg text-amber-accent hover:bg-[#2a2a2a] rounded-md transition-colors btn-press"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? "☀" : "☽"}
          </button>
        )}

        <button
          onClick={onAbout}
          className="w-9 h-9 flex items-center justify-center text-lg text-amber-accent hover:bg-[#2a2a2a] rounded-md transition-colors btn-press"
          aria-label="About"
        >
          ⓘ
        </button>
      </div>
    </header>
  );
}
