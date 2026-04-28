"use client";

import { useState, ReactNode } from "react";

interface TreeNodeProps {
  label: string;
  icon?: ReactNode;
  active?: boolean;
  initialExpanded?: boolean;
  children?: ReactNode;
  onClick?: () => void;
}

export function TreeNode({
  label,
  icon,
  active = false,
  initialExpanded = false,
  children,
  onClick,
}: TreeNodeProps) {
  const [expanded, setExpanded] = useState(initialExpanded);

  const hasChildren = !!children;

  const handleClick = () => {
    if (hasChildren) {
      setExpanded(!expanded);
    }
    onClick?.();
  };

  return (
    <div>
      <div
        onClick={handleClick}
        className={`
          px-3 py-2 text-sm font-medium cursor-pointer rounded transition-all duration-150
          ${
            active
              ? "bg-amber-accent/10 border-l-[3px] border-amber-accent text-amber-accent font-semibold shadow-[inset_0_0_12px_rgba(212,144,58,0.06)]"
              : "text-slate-800 dark:text-slate-100 border-l-[3px] border-transparent hover:bg-amber-accent/5 hover:border-amber-accent/40 hover:text-amber-accent"
          }
        `}
      >
        <div className="flex items-center gap-2">
          {hasChildren && (
            <span className={`text-xs inline-block transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}>▶</span>
          )}
          {icon && <span className="dark-icon">{icon}</span>}
          <span className="truncate">{label}</span>
        </div>
      </div>

      {hasChildren && expanded && <div className="ml-4 mt-1">{children}</div>}
    </div>
  );
}
