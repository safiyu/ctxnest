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
        className={`relative flex items-center gap-1.5 py-1.5 px-2 rounded text-sm cursor-pointer transition-colors ${
          active
            ? "bg-[var(--accent-soft)] text-[var(--accent)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
        }`}
      >
        {active && <span className="absolute -left-1 top-1 bottom-1 w-0.5 bg-[var(--accent)] rounded-full" />}
        {hasChildren && (
          <span className={`text-[10px] inline-block transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}>▶</span>
        )}
        {icon && <span className="dark-icon">{icon}</span>}
        <span className="truncate">{label}</span>
      </div>

      {hasChildren && expanded && <div className="ml-3 mt-0.5">{children}</div>}
    </div>
  );
}
