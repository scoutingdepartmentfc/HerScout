import React from "react";
import { cn } from "@/lib/utils";
import { Loader2, AlertCircle, Inbox, CheckCircle2 } from "lucide-react";
import { Button } from "./Button";

export function LoadingState({
  message = "Loading scouting intelligence...",
  className,
}: {
  message?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center p-8 text-center", className)}>
      <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
      <p className="text-sm font-medium text-foreground">{message}</p>
      <p className="text-xs text-muted-foreground mt-1">Retrieving latest player metrics</p>
    </div>
  );
}

export function EmptyState({
  title = "No data found",
  description = "No records match your active filters or query.",
  icon,
  actionLabel,
  onAction,
  className,
}: {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center p-8 text-center border border-dashed border-border/80 rounded-lg bg-navy-950/30", className)}>
      <div className="w-10 h-10 rounded-full bg-secondary/80 flex items-center justify-center mb-3 text-muted-foreground">
        {icon || <Inbox className="w-5 h-5" />}
      </div>
      <h4 className="text-sm font-semibold text-white">{title}</h4>
      <p className="text-xs text-muted-foreground max-w-sm mt-1">{description}</p>
      {actionLabel && onAction && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

export function ErrorState({
  title = "Failed to load intelligence",
  message = "A system error occurred while contacting the database.",
  onRetry,
  className,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center p-8 text-center border border-destructive/30 rounded-lg bg-destructive/5", className)}>
      <div className="w-10 h-10 rounded-full bg-destructive/20 flex items-center justify-center mb-3 text-destructive">
        <AlertCircle className="w-5 h-5" />
      </div>
      <h4 className="text-sm font-semibold text-white">{title}</h4>
      <p className="text-xs text-destructive/80 max-w-sm mt-1">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          Retry Query
        </Button>
      )}
    </div>
  );
}

export function SuccessBanner({
  message,
  onDismiss,
  className,
}: {
  message: string;
  onDismiss?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between p-3 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-medium", className)}>
      <div className="flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
        <span>{message}</span>
      </div>
      {onDismiss && (
        <button onClick={onDismiss} className="hover:underline text-[11px] opacity-80 hover:opacity-100">
          Dismiss
        </button>
      )}
    </div>
  );
}

