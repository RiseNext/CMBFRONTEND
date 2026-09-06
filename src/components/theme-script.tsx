/**
 * Runs before React hydrates and before first paint, so the correct theme class
 * is on <html> from the very first frame. Without this the app renders light,
 * then flips to dark once JS boots — the flash the brief calls out.
 *
 * Server-rendered as a plain inline script; it must not depend on React.
 */
export function ThemeScript() {
  const script = `(function(){try{var s=localStorage.getItem("risenext.theme");var d=s?s==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;var e=document.documentElement;e.classList.toggle("dark",d);e.style.colorScheme=d?"dark":"light";}catch(_){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: script }} suppressHydrationWarning />;
}
