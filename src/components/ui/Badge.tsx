import React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "secondary" | "success" | "warning" | "destructive" | "outline" | "tier-a" | "tier-b" | "tier-c";
  size?: "sm" | "md";
}

export const Badge: React.FC<BadgeProps> = ({
  className,
  variant = "default",
  size = "md",
  children,
  ...props
}) => {
  const sizeStyles = {
    sm: "px-1.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase",
    md: "px-2.5 py-1 text-xs font-medium",
  };

  const variantStyles = {
    default: "bg-primary/15 text-primary border-primary/30",
    secondary: "bg-secondary text-secondary-foreground border-border/60",
    success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    warning: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    destructive: "bg-destructive/15 text-destructive border-destructive/30",
    outline: "bg-transparent text-muted-foreground border-border",
    "tier-a": "bg-emerald-500/20 text-emerald-300 border-emerald-400/40 font-bold",
    "tier-b": "bg-sky-500/20 text-sky-300 border-sky-400/40 font-bold",
    "tier-c": "bg-amber-500/20 text-amber-300 border-amber-400/40 font-bold",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border",
        sizeStyles[size],
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
};

