import type { ReactNode } from "react";

interface PanelProps {
  title: string;
  /** Right-aligned controls or readouts in the panel header. */
  accessory?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function Panel({
  title,
  accessory,
  children,
  className = "",
  bodyClassName = "",
}: PanelProps) {
  return (
    <section
      className={`flex min-h-0 flex-col border border-edge bg-panel ${className}`}
      aria-label={title}
    >
      <header className="flex h-7 shrink-0 items-center justify-between border-b border-edge-soft bg-panel-alt px-2">
        <h2 className="text-[10px] font-semibold tracking-[0.14em] text-ink-dim uppercase">
          {title}
        </h2>
        {accessory}
      </header>
      <div className={`min-h-0 flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  );
}
