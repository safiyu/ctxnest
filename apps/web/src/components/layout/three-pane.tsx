"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";

interface ThreePaneProps {
  left: ReactNode;
  middle: ReactNode;
  right: ReactNode;
}

export function ThreePane({ left, middle, right }: ThreePaneProps) {
  const [leftWidth, setLeftWidth] = useState(200);
  const [middleWidth, setMiddleWidth] = useState(250);
  const isDraggingLeft = useRef(false);
  const isDraggingMiddle = useRef(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingLeft.current) {
        const newWidth = Math.max(120, Math.min(400, e.clientX));
        setLeftWidth(newWidth);
      } else if (isDraggingMiddle.current) {
        const newWidth = Math.max(120, Math.min(400, e.clientX - leftWidth));
        setMiddleWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      isDraggingLeft.current = false;
      isDraggingMiddle.current = false;
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [leftWidth]);

  return (
    <div className="flex h-[calc(100vh-2.5rem)] overflow-hidden">
      {/* Left pane */}
      <div
        className="flex-shrink-0 overflow-y-auto"
        style={{ width: `${leftWidth}px` }}
      >
        {left}
      </div>

      {/* Left drag handle */}
      <div
        className="w-1 cursor-col-resize hover:bg-amber-accent/30 transition-colors flex-shrink-0"
        onMouseDown={() => {
          isDraggingLeft.current = true;
        }}
      />

      {/* Middle pane */}
      <div
        className="flex-shrink-0 overflow-y-auto"
        style={{ width: `${middleWidth}px` }}
      >
        {middle}
      </div>

      {/* Middle drag handle */}
      <div
        className="w-1 cursor-col-resize hover:bg-amber-accent/30 transition-colors flex-shrink-0"
        onMouseDown={() => {
          isDraggingMiddle.current = true;
        }}
      />

      {/* Right pane */}
      <div className="flex-1 overflow-y-auto">
        {right}
      </div>
    </div>
  );
}
