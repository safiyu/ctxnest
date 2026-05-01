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
    <header className="h-16 bg-[#FFFDF7] dark:bg-gradient-to-r dark:from-[var(--bg-secondary)] dark:via-[var(--bg-tertiary)] dark:to-[var(--bg-secondary)] flex items-center px-4 border-b border-[var(--border)] gap-3 overflow-visible">
      <div className="flex items-center gap-0">
        <AnimatedLogo size="sm" />
        <span
          className="font-extrabold text-xl tracking-[4px] text-[#D4903A] drop-shadow-[0_0_14px_rgba(212,144,58,0.55)] -ml-2"
        >
          CTXNEST
        </span>
      </div>

      <div className="flex-1 flex justify-center px-4">
        <button
          onClick={onSearch}
          className="w-full max-w-[400px] h-9 px-4 bg-[var(--bg-tertiary)] text-[13px] text-[#5C3D24] dark:text-[#F5C97A] rounded-lg hover:bg-[var(--bg-secondary)] transition-all flex items-center gap-3 border border-[var(--border)] hover:border-[var(--accent)]/50 group shadow-sm"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-3.5 h-3.5 opacity-70 group-hover:opacity-100"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span className="flex-1 text-left">Search anything in your context...</span>
          <kbd className="text-[10px] font-mono text-[#5C3D24] dark:text-[#F5C97A] bg-[var(--bg-secondary)] px-1.5 py-0.5 rounded border border-[var(--border)]">{modifier}K</kbd>
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
