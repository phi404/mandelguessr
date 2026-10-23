import type { ReactNode } from "react";

const icons = {
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  play: <path d="m8 5 11 7-11 7Z" />,
  compass: <><circle cx="12" cy="12" r="9" /><path d="m16 8-2.5 5.5L8 16l2.5-5.5Z" /></>,
  menu: <><path d="M5 8h14M5 16h14" /><circle cx="8" cy="8" r="1" fill="currentColor" /><circle cx="16" cy="16" r="1" fill="currentColor" /></>,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  expand: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />,
  collapse: <path d="M3 8h5V3m8 0v5h5M8 21v-5H3m13 5v-5h5" />,
  reset: <><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6" /></>,
  chevron: <path d="m6 9 6 6 6-6" />,
  move: <><path d="M12 3v18M3 12h18m-12-6 3-3 3 3m-6 12 3 3 3-3M6 9l-3 3 3 3m12-6 3 3-3 3" /></>,
  zoom: <><circle cx="10" cy="10" r="6.5" /><path d="m15 15 6 6M10 7v6m-3-3h6" /></>,
  target: <><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3" /></>,
  share: <><path d="M12 16V3m-5 5 5-5 5 5M5 13v7h14v-7" /></>,
  settings: <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="3" fill="var(--panel)" /><circle cx="15" cy="17" r="3" fill="var(--panel)" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v.2" /></>,
  home: <><path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-7h6v7" /></>,
  fractal: <><path d="M19 12c4-5.5 1-10-3-8.5C10 5.7 8 8.6 8 12s2 6.3 8 8.5c4 1.5 7-3 3-8.5Z" fill="currentColor" stroke="none" /><circle cx="5" cy="12" r="3" fill="currentColor" stroke="none" /></>,
} satisfies Record<string, ReactNode>;

export function UiIcon({ name }: { name: keyof typeof icons }) {
  return <svg className="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{icons[name]}</svg>;
}
