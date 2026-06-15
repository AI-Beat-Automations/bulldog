import type { ReactNode } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { ConfigNav } from "@/components/layout/config-nav";

export default function ConfigLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PageHeader
        title="Configuración"
        subtitle="Ajustes del asistente del chat."
      />
      <div className="px-4 pb-12 sm:px-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
          <aside className="shrink-0 sm:w-52">
            <ConfigNav />
          </aside>
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </div>
    </>
  );
}
