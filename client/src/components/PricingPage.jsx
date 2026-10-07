import { useState } from 'react';

const PLANS = [
  {
    id: 'free',
    name: 'Radar',
    tag: 'Free forever',
    mo: 0,
    yr: 0,
    cta: 'Get started free',
    ctaCls: 'pricing-cta-ghost',
    features: [
      { t: '50 job views per day',               on: true  },
      { t: '3 ATS sources (GH · Lever · WD)',    on: true  },
      { t: 'Basic search & filter',              on: true  },
      { t: '1 saved filter rule',                on: true  },
      { t: '48h refresh cycle',                  on: true  },
      { t: 'Community leaderboard',              on: true  },
      { t: 'Smart AI scoring',                   on: false },
      { t: 'All 800+ companies',                 on: false },
      { t: 'Application streaks & stats',        on: false },
      { t: 'Priority job alerts',                on: false },
    ],
  },
  {
    id: 'pro',
    name: 'Radar Pro',
    tag: 'Most popular',
    mo: 649,
    yr: 499,
    ctaVerb: 'Start Pro',
    ctaCls: 'pricing-cta-violet',
    highlight: true,
    features: [
      { t: 'Unlimited job views',                on: true  },
      { t: 'All 800+ companies & 8 ATS sources', on: true  },
      { t: 'Advanced search & bulk filters',     on: true  },
      { t: '5 custom smart filter rules',        on: true  },
      { t: '2h refresh cycle',                   on: true  },
      { t: 'Full leaderboard + streaks',         on: true  },
      { t: 'Smart AI scoring',                   on: true  },
      { t: 'Progress tracking & stats',          on: true  },
      { t: 'CSV export',                         on: true  },
      { t: 'Priority job alerts (email)',        on: false },
    ],
  },
  {
    id: 'elite',
    name: 'Radar Elite',
    tag: 'For serious hunters',
    mo: 1499,
    yr: 1099,
    ctaVerb: 'Go Elite',
    ctaCls: 'pricing-cta-teal',
    features: [
      { t: 'Everything in Pro',                  on: true  },
      { t: 'Unlimited filter rules',             on: true  },
      { t: '30-min refresh cycle',               on: true  },
      { t: 'Priority email & push alerts',       on: true  },
      { t: 'Resume keyword match score',         on: true  },
      { t: 'REST API access',                    on: true  },
      { t: 'Early access to new company scrapers', on: true },
      { t: 'LinkedIn referral network insights', on: true  },
      { t: 'White-label data export',            on: true  },
      { t: 'Priority support (< 4h)',            on: true  },
    ],
  },
];

const FAQ = [
  {
    q: 'Can I stay on Free forever?',
    a: 'Yes. The free tier never expires — no credit card needed. Upgrade only when you want more firepower.',
  },
  {
    q: 'What counts as a "job view"?',
    a: 'Any time a new job is fetched and shown to you in your feed. Saved jobs, applied jobs, and dismissed jobs don\'t count toward the limit.',
  },
  {
    q: 'What ATS sources are covered?',
    a: 'Greenhouse, Lever, Workday, Ashby, Eightfold, SmartRecruiters, Taleo, and ZohoRecruit — plus custom playwright scrapers for companies with proprietary portals.',
  },
  {
    q: 'How does the 2h refresh cycle work?',
    a: 'Our scraper polls every company\'s job board roughly every 2 hours on Pro. New postings appear in your feed before most job boards index them.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Absolutely. Cancel from your profile page — no cancellation fees, no questions. Annual plans are refunded on a pro-rated basis within the first 14 days.',
  },
];

const fmtINR = (n) => n.toLocaleString('en-IN');

export default function PricingPage() {
  const [annual, setAnnual] = useState(true);
  const [openFaq, setOpenFaq] = useState(null);

  return (
    <div className="pr-page">

      {/* ── Hero ── */}
      <div className="pr-hero">
        <p className="pr-eyebrow">Simple, honest pricing</p>
        <h1 className="pr-headline">
          Land interviews faster.<br />
          <span className="pr-headline-grad">Pay less than your daily coffee.</span>
        </h1>
        <p className="pr-sub">800+ companies tracked · Real-time alerts · Cancel anytime</p>

        <div className="pr-toggle">
          <button
            className={`pr-tog-btn${!annual ? ' active' : ''}`}
            onClick={() => setAnnual(false)}
          >Monthly</button>
          <button
            className={`pr-tog-btn${annual ? ' active' : ''}`}
            onClick={() => setAnnual(true)}
          >
            Annual
            <span className="pr-tog-save">Save 25%</span>
          </button>
        </div>
      </div>

      {/* ── Cards ── */}
      <div className="pr-grid">
        {PLANS.map(plan => (
          <div
            key={plan.id}
            className={`pr-card${plan.highlight ? ' pr-featured' : ''}`}
          >
            {plan.highlight && (
              <div className="pr-most-popular">Most Popular</div>
            )}

            <div className="pr-card-header">
              <div>
                <p className="pr-plan-name">{plan.name}</p>
                <p className="pr-plan-tag">{plan.tag}</p>
              </div>
              <div className="pr-price-block">
                {plan.mo === 0 ? (
                  <span className="pr-price-free">Free</span>
                ) : (
                  <>
                    {/* Annual: show the monthly-plan rate struck through as
                        the "was" price against the discounted annual rate —
                        reuses the existing mo/yr figures, no separate list
                        price invented. */}
                    {annual && (
                      <span className="pr-price-was">₹{fmtINR(plan.mo)}</span>
                    )}
                    <span className="pr-price-cur">₹</span>
                    <span className="pr-price-num">{fmtINR(annual ? plan.yr : plan.mo)}</span>
                    <span className="pr-price-per">/mo</span>
                  </>
                )}
              </div>
              {annual && plan.mo > 0 && (
                <p className="pr-billed-note">Billed ₹{fmtINR(plan.yr * 12)}/yr — saves ₹{fmtINR((plan.mo - plan.yr) * 12)}</p>
              )}
            </div>

            <button className={`pr-cta ${plan.ctaCls}`}>
              {plan.mo === 0 ? plan.cta : `${plan.ctaVerb} — ₹${fmtINR(annual ? plan.yr : plan.mo)}/mo`}
            </button>

            <ul className="pr-features">
              {plan.features.map((f, i) => (
                <li key={i} className={`pr-feat${f.on ? '' : ' pr-feat-off'}`}>
                  <span className="pr-feat-icon" aria-hidden="true">
                    {f.on
                      ? <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="6" fill="var(--pr-check-bg,rgba(34,197,94,.15))"/><path d="M3.5 6.5l2 2 4-4" stroke="var(--pr-check-col,#22c55e)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      : <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="6" fill="rgba(100,116,132,.08)"/><path d="M4.5 6.5h4" stroke="var(--text-4)" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    }
                  </span>
                  {f.t}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* ── Trust bar ── */}
      <div className="pr-trust">
        {[
          { n: '800+',   l: 'companies tracked'       },
          { n: '8',      l: 'ATS systems covered'     },
          { n: '2h',     l: 'avg. refresh on Pro'     },
          { n: '100%',   l: 'cancel-anytime guarantee'},
        ].map((item, i, arr) => (
          <div key={item.n} style={{ display: 'contents' }}>
            <div className="pr-trust-item">
              <span className="pr-trust-n">{item.n}</span>
              <span className="pr-trust-l">{item.l}</span>
            </div>
            {i < arr.length - 1 && <div className="pr-trust-sep" />}
          </div>
        ))}
      </div>

      {/* ── FAQ ── */}
      <div className="pr-faq">
        <h2 className="pr-faq-title">Common questions</h2>
        <div className="pr-faq-list">
          {FAQ.map((item, i) => (
            <div
              key={i}
              className={`pr-faq-item${openFaq === i ? ' open' : ''}`}
              onClick={() => setOpenFaq(openFaq === i ? null : i)}
            >
              <div className="pr-faq-q">
                {item.q}
                <span className="pr-faq-chevron" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M3 5l4 4 4-4"/>
                  </svg>
                </span>
              </div>
              {openFaq === i && (
                <p className="pr-faq-a">{item.a}</p>
              )}
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
