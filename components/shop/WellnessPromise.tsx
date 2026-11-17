/**
 * The client's headline promise: low sugar, prebiotic and fibre-rich cakes.
 *
 * Three looks for the same fact. The bar sits above the shop header on every
 * page that has one, the card sits in the home hero, and the band opens the
 * footer. Styles live in globals.css under "Wellness promise".
 */
const PILLARS = [
  {
    label: "Low sugar",
    // A sugar cube with an arrow pointing down.
    d: "M10.5 3 4 6.5v8l6.5 3.5 6.5-3.5v-8L10.5 3ZM4 6.5 10.5 10 17 6.5M10.5 10v8M20 12.5v8M17.75 18.25 20 20.5l2.25-2.25",
  },
  {
    label: "Prebiotic",
    // A sprout.
    d: "M12 21v-8.5M12 12.5c0-4 2.9-6.75 7-6.75 0 4-2.9 6.75-7 6.75ZM12 15c0-3.1-2.4-5.25-5.75-5.25 0 3.1 2.4 5.25 5.75 5.25Z",
  },
  {
    label: "Fibre-rich",
    // An ear of wheat.
    d: "M12 21.5V6.5M12 6.5c-.9-.9-.9-2.6 0-3.5.9.9.9 2.6 0 3.5ZM12 10.5c-2.3 0-3.75-1.4-3.75-3.5 2.3 0 3.75 1.4 3.75 3.5Zm0 0c2.3 0 3.75-1.4 3.75-3.5-2.3 0-3.75 1.4-3.75 3.5ZM12 14.5c-2.3 0-3.75-1.4-3.75-3.5 2.3 0 3.75 1.4 3.75 3.5Zm0 0c2.3 0 3.75-1.4 3.75-3.5-2.3 0-3.75 1.4-3.75 3.5ZM12 18.5c-2.3 0-3.75-1.4-3.75-3.5 2.3 0 3.75 1.4 3.75 3.5Zm0 0c2.3 0 3.75-1.4 3.75-3.5-2.3 0-3.75 1.4-3.75 3.5Z",
  },
];

const SUMMARY = "Low sugar, prebiotic and fibre-rich cakes available";

function Mark({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Pillars({ className }: { className: string }) {
  return (
    <ul className={className} aria-label={SUMMARY}>
      {PILLARS.map((p) => (
        <li key={p.label}>
          <span className="wellness-medal">
            <Mark d={p.d} />
          </span>
          {p.label}
        </li>
      ))}
    </ul>
  );
}

/** A slim strip above the shop header. */
export function WellnessBar() {
  return (
    <div className="wellness-bar">
      <p>
        <span className="wellness-bar-icons" aria-hidden>
          {PILLARS.map((p) => (
            <Mark key={p.label} d={p.d} />
          ))}
        </span>
        <span>
          <strong>Low sugar · Prebiotic · Fibre-rich</strong> cakes available
        </span>
      </p>
    </div>
  );
}

/** The panel that opens the home hero. */
export function WellnessCard() {
  return (
    <div className="wellness-card">
      <p className="wellness-card-head">
        <span className="wellness-kicker">
          <span aria-hidden>✳</span> Feel-good cakes
        </span>
        <span className="wellness-live">Available now</span>
      </p>
      <Pillars className="wellness-pillars wellness-pillars-dark" />
    </div>
  );
}

/** The band that opens the footer. */
export function WellnessBand() {
  return (
    <div className="wellness-band">
      <div className="wellness-band-inner">
        <div>
          <p className="wellness-kicker">The feel-good range</p>
          <p className="wellness-band-title">
            Low sugar, prebiotic &amp; <em>fibre-rich</em> cakes, baked to order.
          </p>
        </div>
        <Pillars className="wellness-pillars wellness-pillars-dark" />
      </div>
    </div>
  );
}
