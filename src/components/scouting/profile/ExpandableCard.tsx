"use client";

import { ModalPortal } from "./ModalPortal";
import React, { useEffect, useState } from "react";
import { Maximize2, X } from "lucide-react";

type TagTone = "green" | "amber" | "blue" | "purple" | "red";

const TAG_STYLES: Record<TagTone, React.CSSProperties> = {
  green: { background: "#34d39922", color: "#34d399", borderColor: "#34d39955" },
  amber: { background: "#f5b94222", color: "#f5b942", borderColor: "#f5b94266" },
  blue: { background: "#3b6ff522", color: "#5b8cff", borderColor: "#3b6ff566" },
  purple: { background: "#7166F222", color: "#a59cff", borderColor: "#7166F266" },
  red: { background: "#f0525222", color: "#ff8a8a", borderColor: "#f0525266" },
};

interface ExpandableCardProps {
  title: string;
  tag?: string;
  tagTone?: TagTone;
  subtitle?: string;
  headerRight?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onCardClick?: () => void;
  expandedContent?: React.ReactNode;
  hideExpand?: boolean;
  children: React.ReactNode;
}

export const ExpandableCard: React.FC<ExpandableCardProps> = ({
  title,
  tag,
  tagTone = "green",
  subtitle,
  headerRight,
  className = "",
  style,
  onCardClick,
  expandedContent,
  hideExpand = false,
  children,
}) => {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  return (
    <>
      <div
        onClick={onCardClick}
        style={style}
        className={`s1-card px-3 py-2.5 relative flex flex-col min-h-0 ${className}`}
      >
        <div className="flex items-center gap-2 mb-2 shrink-0">
          <span className="s1-title text-[12px] text-[#e6edf7] whitespace-nowrap">
            {title}
          </span>
          {tag && (
            <span
              style={TAG_STYLES[tagTone]}
              className="text-[9.5px] font-bold tracking-[0.06em] px-1.5 py-[2px] rounded border uppercase whitespace-nowrap"
            >
              {tag}
            </span>
          )}
          {subtitle && (
            <span className="text-[10px] text-[#8796b3] truncate ml-1">{subtitle}</span>
          )}
          <div className="ml-auto flex items-center gap-1.5 shrink-0">
            {headerRight}
            {!hideExpand && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(true);
                }}
                title={`Expand ${title}`}
                className="w-5 h-5 rounded-[5px] border border-[#1c2a45] bg-[#0b1426]/60 hover:bg-[#1c2a45] text-[#8796b3] hover:text-white flex items-center justify-center transition-colors"
              >
                <Maximize2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col">{children}</div>
      </div>

      {expanded && (
        <ModalPortal>
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8"
          onClick={() => setExpanded(false)}
        >
          <div
            className="s1-card w-full max-w-5xl max-h-[88vh] flex flex-col p-5 shadow-2xl border-[#3b6ff5]/40"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 pb-3 mb-3 border-b border-[#1c2a45] shrink-0">
              <span className="s1-title text-sm text-[#e6edf7]">{title}</span>
              {tag && (
                <span
                  style={TAG_STYLES[tagTone]}
                  className="text-[10px] font-bold tracking-[0.06em] px-2 py-0.5 rounded border uppercase"
                >
                  {tag}
                </span>
              )}
              {subtitle && <span className="text-xs text-[#8796b3]">{subtitle}</span>}
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="ml-auto w-7 h-7 rounded-md border border-[#1c2a45] bg-[#0b1426] hover:bg-[#1c2a45] text-[#8796b3] hover:text-white flex items-center justify-center"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 pr-1">
              {expandedContent || children}
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </>
  );
};
