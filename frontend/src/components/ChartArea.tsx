import type { ReactNode } from "react";

/**
 * Fills the panel body with an absolutely-positioned box.
 *
 * Recharts' `height="100%"` needs a parent with a definite height; inside the
 * nested flex columns of this layout a percentage can resolve to zero and the
 * chart silently renders blank. `inset-0` sidesteps percentage resolution.
 */
export function ChartArea({ children }: { children: ReactNode }) {
  return <div className="absolute inset-0 p-1">{children}</div>;
}
