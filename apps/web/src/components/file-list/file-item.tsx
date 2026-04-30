"use client";

interface FileItemProps {
  id: number;
  title: string;
  updatedAt: string;
  active: boolean;
  onClick: () => void;
  estTokens?: number | null;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return (n / 1000).toFixed(1) + "k";
  return Math.round(n / 1000) + "k";
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins === 1) return "1 min ago";
  if (diffMins < 60) return `${diffMins} mins ago`;
  if (diffHours === 1) return "1 hour ago";
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 30) return `${diffDays} days ago`;

  return date.toLocaleDateString();
}

const FileIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

const DownloadIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

export function FileItem({ id, title, updatedAt, active, onClick, estTokens, selectMode, selected, onToggleSelect }: FileItemProps) {
  const handleRowClick = (e: React.MouseEvent) => {
    if (selectMode) {
      e.preventDefault();
      onToggleSelect?.();
      return;
    }
    onClick();
  };

  return (
    <div
      onClick={handleRowClick}
      className={`
        group relative px-4 py-3 cursor-pointer border-l-[3px] transition-all duration-150
        ${
          active && !selectMode
            ? "bg-amber-accent/10 border-amber-accent shadow-[inset_0_0_12px_rgba(212,144,58,0.06)]"
            : selectMode && selected
            ? "bg-amber-accent/15 border-amber-accent/60"
            : "border-transparent hover:bg-amber-accent/5 hover:border-amber-accent/30 hover:translate-x-0.5"
        }
      `}
    >
      <div className="flex items-start gap-3">
        {selectMode ? (
          <input
            type="checkbox"
            checked={!!selected}
            onChange={() => onToggleSelect?.()}
            onClick={(e) => e.stopPropagation()}
            className="mt-1 cursor-pointer accent-amber-accent"
          />
        ) : (
          <FileIcon className="w-4 h-4 mt-1 text-amber-accent shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold truncate text-[#0F172A] dark:text-[#F8F9FA]">
            {title}
          </div>
          <div className="text-sm text-[#475569] dark:text-[#94A3B8] mt-1">
            {formatTimeAgo(updatedAt)}
            {typeof estTokens === "number" && estTokens > 0 ? ` · ~${formatTokens(estTokens)} tok` : ""}
          </div>
        </div>
        {!selectMode && (
          <button
            type="button"
            onClick={async (e) => {
              e.stopPropagation();
              try {
                const res = await fetch(`/api/files/${id}/download`);
                if (!res.ok) {
                  let msg = `HTTP ${res.status}`;
                  try {
                    const body = await res.json();
                    if (body?.error) msg = body.error;
                  } catch {}
                  alert(`Download failed: ${msg}`);
                  return;
                }
                const disposition = res.headers.get("content-disposition") || "";
                const match = /filename="([^"]+)"/.exec(disposition);
                const filename = match?.[1] ?? `${title}.md`;
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
              } catch (err: any) {
                alert(`Download failed: ${err?.message ?? String(err)}`);
              }
            }}
            title="Download .md"
            aria-label="Download file"
            className="btn btn-icon-sm opacity-0 group-hover:opacity-100"
          >
            <DownloadIcon className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
