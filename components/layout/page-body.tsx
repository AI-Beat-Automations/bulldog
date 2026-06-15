import type { ReactNode } from "react";

export function PageBody({ children }: { children: ReactNode }) {
  return <div className="px-6 py-6">{children}</div>;
}
