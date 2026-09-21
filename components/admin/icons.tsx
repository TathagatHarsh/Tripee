/**
 * Every icon in the portal, hand-drawn on a 24x24 grid.
 *
 * No icon library, and that is the whole point. lucide-react is 1.4MB installed
 * and tree-shakes to a few kilobytes, which would have been fine; what it does
 * not tree-shake is the decision to have a dependency for eleven paths. These
 * eleven are the eleven this application needs, they are a stroke-based set with
 * one weight and one join, and adding a twelfth is four lines here rather than a
 * version bump.
 *
 * All of them are `currentColor` and `stroke`-based, so an icon inherits the
 * colour of whatever it sits in — the navy sidebar, a terracotta active item, a
 * red destructive button — without a prop for it.
 *
 * `aria-hidden` on every one, unconditionally, and that stays right even where
 * the control is icon-only. Most of this portal puts an icon beside its own
 * words — the sidebar, the buttons, the stat cards — and there a `title` here
 * would make every label read twice. The one place with no visible words is the
 * gallery's reorder row, and there the *button* carries the `aria-label`: the
 * name belongs to the control, not to the drawing inside it, and labelling both
 * is how a screen reader ends up saying "move earlier, move earlier".
 */

const PATHS: Record<string, React.ReactNode> = {
  /* ── navigation ─────────────────────────────────────────────────────── */
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9.3V20h13V9.3" /><path d="M9.75 20v-5.5h4.5V20" /></>,
  orders: <><path d="M5 3.5h14v17l-3.5-2-3.5 2-3.5-2L5 20.5Z" /><path d="M9 8.5h6" /><path d="M9 12.5h6" /></>,
  kitchen: <><path d="M3.5 8.5h17" /><path d="M4.5 8.5v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-10" /><path d="M8 8.5V6a4 4 0 0 1 8 0v2.5" /><path d="M12 12.5v4" /></>,
  delivery: <><path d="M2.5 6.5h10v9h-10z" /><path d="M12.5 9.5h4l3 3v3h-7z" /><circle cx="6.5" cy="17.5" r="1.8" /><circle cx="16.5" cy="17.5" r="1.8" /></>,
  cake: <><path d="M4 20.5h16" /><path d="M5 20.5v-6.2a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6.2" /><path d="M12 12.3V9" /><circle cx="12" cy="7.4" r="1.4" /><path d="M5 16.4c1.8 1.2 3.5-1.2 5.2 0 1.7 1.2 3.4-1.2 5.2 0 1 .7 2 .3 2.6-.2" /></>,
  ingredients: <><path d="M7 3.5h10" /><path d="M8.5 3.5v4.2L5.2 15a4 4 0 0 0 3.6 5.5h6.4a4 4 0 0 0 3.6-5.5L15.5 7.7V3.5" /><path d="M6.2 13.5h11.6" /></>,
  addons: <><circle cx="7" cy="7" r="3.2" /><circle cx="17" cy="8.5" r="2.2" /><circle cx="9" cy="16.5" r="2.4" /><circle cx="17.5" cy="16" r="3" /></>,
  pricing: <><path d="M4.5 4.5h9.6l5.4 5.4v9.6a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1Z" /><path d="M8.5 9h6" /><path d="M8.5 12.5h6" /><path d="M8.5 12.5c3 0 3 4 0 4h1l3.5 3.5" /></>,
  bakery: <><path d="M3.5 20.5h17" /><path d="M5 20.5V9.5l7-5 7 5v11" /><path d="M10 20.5v-5.5h4v5.5" /><path d="M9.5 11h5" /></>,
  staff: <><circle cx="9" cy="8" r="3.4" /><path d="M3 20.5c0-3.4 2.7-5.6 6-5.6s6 2.2 6 5.6" /><path d="M16 5.2a3.4 3.4 0 0 1 0 5.6" /><path d="M17.5 15.4c2 .8 3.5 2.6 3.5 5.1" /></>,
  // A shopfront with an awning: a partner bakery is another shop, not another
  // person on the staff list, and the two icons should not be mistakable.
  vendor: <><path d="M3.5 10.5h17v9.5h-17z" /><path d="M2.5 10.5 4.5 4.5h15l2 6" /><path d="M8.5 10.5v-6" /><path d="M15.5 10.5v-6" /><path d="M9.5 20v-5.5h5V20" /></>,

  /* ── controls ───────────────────────────────────────────────────────── */
  search: <><circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l5 5" /></>,
  bell: <><path d="M6.5 9.5a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5s1.5-1.5 1.5-5.5Z" /><path d="M10 18.5a2.2 2.2 0 0 0 4 0" /></>,
  menu: <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>,
  close: <><path d="M6 6l12 12" /><path d="M18 6 6 18" /></>,
  chevronRight: <path d="M9.5 5.5 16 12l-6.5 6.5" />,
  chevronDown: <path d="M5.5 9.5 12 16l6.5-6.5" />,
  arrowLeft: <><path d="M19 12H5" /><path d="M11 6 5 12l6 6" /></>,
  arrowRight: <><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></>,
  arrowUp: <><path d="M12 19V5" /><path d="M6 11l6-6 6 6" /></>,
  arrowDown: <><path d="M12 5v14" /><path d="M6 13l6 6 6-6" /></>,
  /* The cover photograph. A star rather than a pin or a tick, because "this is
     the one we lead with" is the meaning every gallery already uses it for. */
  star: <path d="M12 3.8 14.5 9l5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4L9.5 9Z" />,
  check: <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  trash: <><path d="M4 7h16" /><path d="M9 7V4.5h6V7" /><path d="M6 7l1 13.5h10L18 7" /><path d="M10.5 11v6" /><path d="M13.5 11v6" /></>,
  edit: <><path d="M4 20h4L20 8l-4-4L4 16Z" /><path d="M14.5 5.5 18.5 9.5" /></>,
  image: <><path d="M3.5 4.5h17v15h-17z" /><circle cx="9" cy="10" r="1.8" /><path d="M3.5 17 9.5 12l3.5 3 3-2.5 4.5 4" /></>,
  upload: <><path d="M12 16.5V4.5" /><path d="M7.5 9 12 4.5 16.5 9" /><path d="M4 15.5v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></>,
  alert: <><path d="M12 4 21 20H3Z" /><path d="M12 10v4.5" /><path d="M12 17.3v.2" /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5" /><path d="M12 7.8v.2" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5.3l3.5 2.2" /></>,
  phone: <path d="M6.2 3.5h3l1.5 4-2 1.5a10 10 0 0 0 6.3 6.3l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.2 5.7a2 2 0 0 1 2-2.2Z" />,
  print: <><path d="M7 8.5V3.5h10v5" /><path d="M7 17.5H4.5v-7a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v7H17" /><path d="M7 14.5h10v6H7z" /></>,
  logout: <><path d="M14 4.5H6.5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1H14" /><path d="M11 12h9.5" /><path d="M17.5 8.5 21 12l-3.5 3.5" /></>,
  external: <><path d="M13 4.5h6.5V11" /><path d="M19.5 4.5 11 13" /><path d="M17 14v5.5H4.5V7H10" /></>,
  shop: <><path d="M3.5 8.5h17l-1 11h-15z" /><path d="M8.5 8.5V6a3.5 3.5 0 0 1 7 0v2.5" /></>,
};

export type IconName = keyof typeof PATHS;

/**
 * `size` is a number of pixels rather than a Tailwind class, because these are
 * drawn at four sizes (14 in a badge, 16 in a table, 18 in the sidebar, 20 in a
 * button) and `width`/`height` attributes keep the SVG square without a utility
 * per call site.
 *
 * `strokeWidth` scales down as the icon grows: 1.75 at 24px is the same optical
 * weight as 1.5 at 18px, and an icon set where the small ones look thin is the
 * usual tell that someone drew them all at one weight.
 */
export function Icon({
  name,
  size = 18,
  className = "",
}: {
  name: IconName | string;
  size?: number;
  className?: string;
}) {
  const path = PATHS[name];
  /* An unknown name renders nothing rather than an empty box. A typo in a nav
     entry should leave a gap, not a mystery glyph somebody investigates. */
  if (!path) return null;

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={size >= 22 ? 1.5 : size >= 18 ? 1.65 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {path}
    </svg>
  );
}
