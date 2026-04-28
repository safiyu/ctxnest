"use client";

interface FileItemProps {
  title: string;
  updatedAt: string;
  active: boolean;
  onClick: () => void;
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
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2.5" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

export function FileItem({ title, updatedAt, active, onClick }: FileItemProps) {

  return (
    <div
      onClick={onClick}
      className={`
        px-4 py-3 cursor-pointer border-l-[3px] transition-all duration-150
        ${
          active
            ? "bg-amber-accent/10 border-amber-accent shadow-[inset_0_0_12px_rgba(212,144,58,0.06)]"
            : "border-transparent hover:bg-amber-accent/5 hover:border-amber-accent/30 hover:translate-x-0.5"
        }
      `}
    >
      <div className="flex items-start gap-3">
        <FileIcon className="w-4 h-4 mt-1 text-amber-accent shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate text-[#0F172A] dark:text-[#F8F9FA]">
            {title}
          </div>
          <div className="text-xs text-[#475569] dark:text-[#94A3B8] mt-1">
            {formatTimeAgo(updatedAt)}
          </div>
        </div>
      </div>
    </div>
  );
}
