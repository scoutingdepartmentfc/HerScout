import React from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "destructive" | "pitch";
  size?: "xs" | "sm" | "md" | "lg";
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      isLoading = false,
      leftIcon,
      rightIcon,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const sizeStyles = {
      xs: "h-7 px-2.5 text-xs font-medium rounded",
      sm: "h-8 px-3 text-xs font-medium rounded-md",
      md: "h-9 px-4 text-sm font-medium rounded-md",
      lg: "h-11 px-6 text-base font-semibold rounded-lg",
    };

    const variantStyles = {
      primary:
        "bg-primary text-white hover:bg-primary/90 shadow-sm border border-transparent focus-visible:ring-primary/40",
      secondary:
        "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border/60 focus-visible:ring-secondary/40",
      outline:
        "bg-transparent text-foreground hover:bg-white/5 border border-border hover:border-white/20 focus-visible:ring-white/20",
      ghost:
        "bg-transparent text-muted-foreground hover:text-foreground hover:bg-white/5 border border-transparent",
      destructive:
        "bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/25 focus-visible:ring-destructive/30",
      pitch:
        "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 focus-visible:ring-emerald-500/30",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          "inline-flex items-center justify-center gap-2 transition-all duration-150 outline-none select-none focus-visible:ring-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]",
          sizeStyles[size],
          variantStyles[variant],
          className
        )}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          leftIcon
        )}
        {children}
        {!isLoading && rightIcon}
      </button>
    );
  }
);

Button.displayName = "Button";

