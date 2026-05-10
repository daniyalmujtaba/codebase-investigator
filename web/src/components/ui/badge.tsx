import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider border",
  {
    variants: {
      tone: {
        neutral: "bg-[var(--color-surface-2)] text-[var(--color-fg-muted)] border-[var(--color-border)]",
        pass:    "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
        trust:   "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
        warn:    "bg-amber-500/10 text-amber-300 border-amber-500/30",
        caution: "bg-amber-500/10 text-amber-300 border-amber-500/30",
        fail:    "bg-rose-500/10 text-rose-300 border-rose-500/30",
        reject:  "bg-rose-500/10 text-rose-300 border-rose-500/30",
        accent:  "bg-[var(--color-accent)]/10 text-[var(--color-accent)] border-[var(--color-accent)]/30",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, className }))} {...props} />;
}
