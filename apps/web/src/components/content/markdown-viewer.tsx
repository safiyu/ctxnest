"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownViewerProps {
  content: string;
}

export function MarkdownViewer({ content }: MarkdownViewerProps) {
  return (
    <div className="prose dark:prose-invert max-w-none p-6">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-amber-accent text-3xl font-bold mb-4">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-amber-accent text-2xl font-bold mb-3">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-amber-accent text-xl font-bold mb-2">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-amber-accent text-lg font-semibold mb-2">
              {children}
            </h4>
          ),
          h5: ({ children }) => (
            <h5 className="text-amber-accent text-base font-semibold mb-2">
              {children}
            </h5>
          ),
          h6: ({ children }) => (
            <h6 className="text-amber-accent text-sm font-semibold mb-2">
              {children}
            </h6>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
