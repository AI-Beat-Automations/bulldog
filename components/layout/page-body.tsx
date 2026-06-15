import type { ReactNode } from "react";

export function PageBody({ children }: { children: ReactNode }) {
  return <div className="px-4 pb-12 sm:px-6">{children}</div>;
}
