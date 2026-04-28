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

function getFileTypeInfo(title: string): { icon: string; color: string } {
  const ext = title.split(".").pop()?.toLowerCase() || "";
  switch (ext) {
    case "md":
    case "mdx":
      return { icon: "📝", color: "text-blue-400" };
    case "ts":
    case "tsx":
      return { icon: "🔷", color: "text-blue-500" };
    case "js":
    case "jsx":
      return { icon: "🟡", color: "text-yellow-400" };
    case "json":
      return { icon: "📋", color: "text-green-400" };
    case "yml":
    case "yaml":
      return { icon: "⚙️", color: "text-purple-400" };
    case "css":
    case "scss":
      return { icon: "🎨", color: "text-pink-400" };
    default:
      return { icon: "📄", color: "text-gray-400" };
  }
}

export function FileItem({ title, updatedAt, active, onClick }: FileItemProps) {
  const fileInfo = getFileTypeInfo(title);

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
        <span className={`text-base mt-0.5 ${fileInfo.color}`}>{fileInfo.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate text-gray-900 dark:text-gray-100">
            {title}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {formatTimeAgo(updatedAt)}
          </div>
        </div>
      </div>
    </div>
  );
}
