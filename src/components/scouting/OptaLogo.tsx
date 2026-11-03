import React from "react";

interface OptaBadgeProps {
  className?: string;
  size?: "xs" | "sm" | "md" | "lg";
  variant?: "badge" | "icon" | "pill";
  label?: string;
}

export const OPTA_LOGO_URL = "/opta-logo.png";

/**
 * Opta Badge / Logo component with the official Opta by Stats Perform logo.
 * Rendered with a clean white pill/container background so the black typography
 * and red/magenta Opta spark icon stand out clearly on dark themes.
 */
export function OptaLogo({
  className = "",
  size = "sm",
  variant = "badge",
  label,
}: OptaBadgeProps) {
  const heightClasses = {
    xs: "h-3",
    sm: "h-3.5",
    md: "h-4.5",
    lg: "h-5.5",
  }[size];

  const paddingClasses = {
    xs: "px-1.5 py-0.5",
    sm: "px-2 py-0.5",
    md: "px-2.5 py-1",
    lg: "px-3 py-1",
  }[size];

  if (variant === "icon") {
    return (
      <span
        className={`inline-flex items-center justify-center bg-white rounded shadow-sm border border-white/80 select-none ${paddingClasses} ${className}`}
      >
        <img
          src={OPTA_LOGO_URL}
          alt="Opta by Stats Perform"
          className={`w-auto object-contain shrink-0 ${heightClasses}`}
        />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-md bg-white text-slate-900 shadow-sm border border-slate-200 select-none ${paddingClasses} ${className}`}
    >
      <img
        src={OPTA_LOGO_URL}
        alt="Opta"
        className={`w-auto object-contain shrink-0 ${heightClasses}`}
      />
      {label && (
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 border-l border-slate-300 pl-1.5">
          {label}
        </span>
      )}
    </span>
  );
}
