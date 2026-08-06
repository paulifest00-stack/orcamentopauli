import React from "react";
import { Minus, Plus } from "lucide-react";

interface IOSStepperProps {
  value: number;
  onChange: (newValue: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}

export function IOSStepper({
  value,
  onChange,
  min = 1,
  max = 9999,
  step = 1,
  className = "",
}: IOSStepperProps) {
  const canDecrement = value > min;
  const canIncrement = value < max;

  const handleDecrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (canDecrement) {
      onChange(Math.max(min, value - step));
    }
  };

  const handleIncrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (canIncrement) {
      onChange(Math.min(max, value + step));
    }
  };

  return (
    <div
      className={`inline-flex items-center rounded-xl bg-zinc-200/60 p-0.5 dark:bg-zinc-800/60 select-none ${className}`}
    >
      <button
        type="button"
        onClick={handleDecrement}
        disabled={!canDecrement}
        aria-label="Diminuir quantidade"
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-white font-medium text-zinc-900 shadow-xs transition-all active:scale-[0.92] disabled:opacity-30 disabled:active:scale-100 dark:bg-zinc-700 dark:text-zinc-100"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="min-w-8 text-center text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        {value}
      </span>
      <button
        type="button"
        onClick={handleIncrement}
        disabled={!canIncrement}
        aria-label="Aumentar quantidade"
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-white font-medium text-zinc-900 shadow-xs transition-all active:scale-[0.92] disabled:opacity-30 disabled:active:scale-100 dark:bg-zinc-700 dark:text-zinc-100"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
