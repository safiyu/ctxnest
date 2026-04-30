"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { AnimatedLogo } from "./animated-logo";

interface TopBarProps {
  onSearch: () => void;
  onAbout: () => void;
}

export function TopBar({ onSearch, onAbout }: TopBarProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setMounted(true);
    setIsMac(navigator.platform.toUpperCase().indexOf("MAC") >= 0);
  }, []);

  const modifier = isMac ? "⌘" : "Ctrl";

  return (
    <header className="h-16 bg-gradient-to-r from-[var(--bg-secondary)] via-[var(--bg-tertiary)] to-[var(--bg-secondary)] flex items-center px-4 border-b border-[var(--border)] gap-3 overflow-visible">
      <div className="flex items-center gap-0">
        <AnimatedLogo size="sm" />
        <span
          className="font-extrabold text-xl tracking-[4px] text-[var(--accent)] drop-shadow-[0_0_14px_rgba(212,144,58,0.55)] -ml-2"
        >
          CTXNEST
        </span>
      </div>

      <div className="flex-1 flex justify-center px-4">
        <button
          onClick={onSearch}
          className="w-full max-w-[400px] h-9 px-4 bg-[var(--bg-tertiary)] text-[13px] text-[var(--text-secondary)] rounded-lg hover:bg-[var(--bg-secondary)] transition-all flex items-center gap-3 border border-[var(--border)] hover:border-[var(--accent)]/50 group shadow-sm"
        >
          <span className="opacity-50 group-hover:opacity-100">🔍</span>
          <span className="flex-1 text-left">Search anything in your context...</span>
          <kbd className="text-[10px] font-mono text-[var(--text-secondary)] bg-[var(--bg-secondary)] px-1.5 py-0.5 rounded border border-[var(--border)]">{modifier}K</kbd>
        </button>
      </div>

      <div className="flex items-center gap-2">
        {mounted && (
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="btn btn-icon-md"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? "☀" : "☽"}
          </button>
        )}

        <button
          onClick={onAbout}
          className="btn btn-icon-md"
          aria-label="About CtxNest"
        >
          ⓘ
        </button>
      </div>
    </header>
  );
}
