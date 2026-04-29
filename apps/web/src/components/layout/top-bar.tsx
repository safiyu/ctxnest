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
    <header className="h-16 bg-gradient-to-r from-[var(--bg-secondary)] via-[var(--bg-tertiary)] to-[var(--bg-secondary)] flex items-center px-4 border-b border-[var(--border)] gap-3 overflow-visible">
      <div className="flex items-center gap-2">
        <AnimatedLogo size="sm" />
        <span
          className="font-extrabold text-xl tracking-[4px] text-[var(--accent)] drop-shadow-[0_0_14px_rgba(212,144,58,0.55)]"
        >
          CTXNEST
        </span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={onSearch}
          className="px-3 py-1 bg-[var(--bg-tertiary)] text-[13px] text-[var(--text-secondary)] rounded-md hover:bg-[var(--border)] transition-colors flex items-center gap-2 border border-transparent hover:border-[var(--accent)]/30"
        >
          <span>Search...</span>
          <kbd className="text-[11px] font-mono text-[var(--text-secondary)] bg-[var(--bg-secondary)] px-1.5 py-0.5 rounded">⌘K</kbd>
        </button>

        <button
          onClick={onNewFile}
          className="px-3 py-1 bg-[var(--accent)] text-[13px] font-bold tracking-wider text-black rounded-md hover:opacity-90 transition-opacity btn-press"
        >
          + NEW
        </button>

        {mounted && (
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="w-8 h-8 flex items-center justify-center text-base text-[var(--accent)] hover:bg-[var(--bg-tertiary)] rounded-md transition-colors btn-press"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? "☀" : "☽"}
          </button>
        )}

        <button
          onClick={onAbout}
          className="w-8 h-8 flex items-center justify-center text-base text-[var(--accent)] hover:bg-[var(--bg-tertiary)] rounded-md transition-colors btn-press"
          aria-label="About"
        >
          ⓘ
        </button>
      </div>
    </header>
  );
}
