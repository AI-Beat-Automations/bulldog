"use client";

import * as React from "react";

type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "theme";

// Store externo (módulo) leído vía useSyncExternalStore: evita setState en
// efectos y resuelve correctamente la hidratación (el script inline ya pintó
// la clase antes de hidratar, así que no hay parpadeo).
const listeners = new Set<() => void>();

let snapshot: { theme: Theme; resolvedTheme: ResolvedTheme } = {
  theme: "system",
  resolvedTheme: "light",
};
const serverSnapshot: { theme: Theme; resolvedTheme: ResolvedTheme } = {
  theme: "system",
  resolvedTheme: "light",
};

function getStoredTheme(): Theme {
  try {
    return (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? "system";
  } catch {
    return "system";
  }
}

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyToDom(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

// Devuelve la misma referencia mientras los valores no cambien (requisito de
// useSyncExternalStore para no provocar renders en bucle).
function recompute() {
  const theme = getStoredTheme();
  const resolvedTheme = theme === "system" ? getSystemTheme() : theme;
  if (snapshot.theme !== theme || snapshot.resolvedTheme !== resolvedTheme) {
    snapshot = { theme, resolvedTheme };
  }
  return snapshot;
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const handleSystem = () => {
    const next = recompute();
    applyToDom(next.resolvedTheme);
    onChange();
  };
  const handleStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    const next = recompute();
    applyToDom(next.resolvedTheme);
    onChange();
  };
  mq.addEventListener("change", handleSystem);
  window.addEventListener("storage", handleStorage);
  return () => {
    listeners.delete(onChange);
    mq.removeEventListener("change", handleSystem);
    window.removeEventListener("storage", handleStorage);
  };
}

function getSnapshot() {
  return recompute();
}

function getServerSnapshot() {
  return serverSnapshot;
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // localStorage puede no estar disponible; el cambio en memoria igual aplica.
  }
  const next = recompute();
  applyToDom(next.resolvedTheme);
  listeners.forEach((l) => l());
}

export function useTheme() {
  const { theme, resolvedTheme } = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const toggleTheme = React.useCallback(() => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  }, [resolvedTheme]);

  return { theme, resolvedTheme, setTheme, toggleTheme };
}

/** Script bloqueante que evita el parpadeo (FOUC) al cargar la página. */
export const themeInitScript = `(function(){try{var k='${STORAGE_KEY}';var s=localStorage.getItem(k);var m=window.matchMedia('(prefers-color-scheme: dark)').matches;var d=s==='dark'||((s===null||s==='system')&&m);var e=document.documentElement;e.classList.toggle('dark',d);e.style.colorScheme=d?'dark':'light';}catch(_){}})();`;
