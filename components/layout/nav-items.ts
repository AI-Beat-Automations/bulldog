export type NavItem = {
  href: string;
  label: string;
};

// Fuente única para la nav del admin (top nav desktop + drawer móvil).
export const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "Conversaciones" },
  { href: "/admin/calls", label: "Calls" },
  { href: "/admin/playground", label: "Playground" },
  { href: "/admin/config", label: "Configuración" },
];

// "Conversaciones" (/admin) cubre /admin y /admin/[id], pero no Calls,
// Playground ni Config (que cuelgan de /admin/...).
export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === "/admin") {
    return (
      pathname === "/admin" ||
      (pathname.startsWith("/admin/") &&
        !pathname.startsWith("/admin/calls") &&
        !pathname.startsWith("/admin/playground") &&
        !pathname.startsWith("/admin/config"))
    );
  }
  return pathname.startsWith(href);
}
