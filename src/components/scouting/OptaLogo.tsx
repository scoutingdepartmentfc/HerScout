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
 */
export function OptaLogo({
  className = "",
  size = "sm",
  variant = "badge",
  label,
}: OptaBadgeProps) {
  const heightClasses = {
    xs: "h-3.5",
    sm: "h-4",
    md: "h-5",
    lg: "h-6",
  }[size];

  if (variant === "icon") {
    return (
      <img
        src={OPTA_LOGO_URL}
        alt="Opta by Stats Perform"
        className={`inline-block w-auto object-contain shrink-0 ${heightClasses} ${className}`}
      />
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/10 border border-white/15 text-white shadow-sm backdrop-blur-xs select-none ${className}`}
    >
      <img
        src={OPTA_LOGO_URL}
        alt="Opta"
        className={`w-auto object-contain shrink-0 brightness-110 ${heightClasses}`}
      />
      {label && (
        <span className="text-[11px] font-semibold tracking-wide text-slate-200">
          {label}
        </span>
      )}
    </span>
  );
}
