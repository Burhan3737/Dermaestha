# Slice H · S4 — Public Surface (Landing + Legal) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the public patient-acquisition front door — a verbatim port of the P-01 landing at `/`, the doctor listing relocated to `/browse`, public `/legal/terms` + `/legal/privacy` DRAFT pages, and KPI #1 client telemetry (`landing_view`, `booking_started`) via the existing `track.js`.

**Architecture:** Two new client feature modules — `modules/marketing` (Landing) and `modules/legal` (LegalPage layout + Terms/Privacy) — each exposing a route factory aggregated by `buildRoutes`. The doctor listing route moves `/` → `/browse`; internal "Browse"/post-login links repoint accordingly. Analytics reuses the shipped fire-and-forget `lib/analytics/track.js` (do NOT recreate it). `booking_started` is a one-line emit added to the existing slot-lock path in `useBooking.js`. No server changes.

**Tech Stack:** React 18, react-router-dom v6, @tanstack/react-query, Vitest + @testing-library/react (jsdom), existing global CSS (`styles/tokens.css`, `styles/components.css`) + a co-located `Landing.css`.

---

## Hard constraints (every task + every subagent)

- DO NOT create/edit/delete anything under `agentChangeLogs/`.
- DO NOT edit/commit the design specs (`docs/superpowers/specs/`) or canonical specs (`docs/specification/` 00–15).
- DO NOT `git push`, merge, or create branches. Work stays on `feature/slice-h-s4-public`.
- Reuse `client/src/lib/analytics/track.js` — import it; never reimplement it.
- Match existing code style; surgical changes only.

## File structure

- `client/src/modules/marketing/marketing.routes.jsx` — route factory; `/` → Landing, with logged-in-patient redirect to `/browse`.
- `client/src/modules/marketing/views/Landing/Landing.jsx` — verbatim port of the mockup, emits `landing_view` on mount.
- `client/src/modules/marketing/views/Landing/Landing.css` — landing-only layout (the mockup's `<style>` block, verbatim).
- `client/src/modules/marketing/views/Landing/Landing.test.jsx` — render + CTA targets + one `landing_view` emit + logged-in-patient redirect.
- `client/src/modules/legal/legal.routes.jsx` — public `/legal/terms`, `/legal/privacy`.
- `client/src/modules/legal/components/LegalPage/LegalPage.jsx` — reusable layout (title, last-updated, DRAFT banner, structured sections).
- `client/src/modules/legal/views/Terms/Terms.jsx` + `Privacy/Privacy.jsx` — DRAFT content.
- `client/src/modules/legal/legal.test.jsx` — render draft + banner, reachable unauthenticated.
- Modified: `client/src/routes.jsx` (aggregate marketing + legal), `client/src/modules/doctor/doctor.routes.jsx` (`/`→`/browse`), `client/src/layouts/PatientLayout/PatientLayout.jsx` (Browse links → `/browse`), `client/src/modules/auth/views/Login/Login.jsx` + `SignUp/SignUp.jsx` (patient redirect → `/browse`), `client/src/modules/booking/useBooking.js` (`booking_started`).
- Modified tests: `Login.test.jsx` (patient redirect target).

## Key decisions (locked)

1. **Hero CTAs (spec-driven deviation from mockup):** the spec (§2) + task mandate hero CTAs → `/browse` and `/signup`. The mockup's hero has primary "Find your dermatologist" → browse and secondary "How it works" → `#how-it-works` anchor. Resolution: keep primary "Find your dermatologist" → `/browse` (verbatim); repoint the secondary hero button to `/signup` and relabel it "Create your account" (same `btn--secondary btn--lg` styling). The "How it works" anchor remains reachable via the topnav link (verbatim from the mockup). This is the single deliberate hero deviation, documented for the controller.
2. **Logged-in patient at `/`:** marketing route redirects a logged-in *patient* session to `/browse` (so the logged-out acquisition page isn't shown to an authenticated patient). Doctor/admin sessions still see the public landing if they navigate to `/` (they are routed to their own dashboards at login). `session.role` is the discriminator (`useSession().session?.role`).
3. **Post-login patient target:** `DASHBOARD.patient` changes from `/` to `/browse` in Login + SignUp (since `/` is now the landing).
4. **Footer / nav links:** footer legal links → `/legal/terms`, `/legal/privacy` (already correct in mockup). Footer "For doctors"/"About" `#` anchors kept as-is (out of scope). Topnav "Browse" → `/browse`; brand → `/` (home).
5. **Featured doctors grid:** static (mockup's three sample cards), per spec ("static for v1 unless trivial"). No data fetch on the landing.
6. **CSS:** port the mockup's `<style>` block verbatim into a co-located `Landing.css` imported by `Landing.jsx` (Vite supports it; vitest/jsdom ignores CSS imports). Reuse existing `.topnav`, `.feature`, `.doc-card`, `.btn*`, `.container` classes from `components.css`.

---

## Task 1: Relocate doctor listing `/` → `/browse` + repoint internal links

**Files:**
- Modify: `client/src/modules/doctor/doctor.routes.jsx`
- Modify: `client/src/layouts/PatientLayout/PatientLayout.jsx`
- Modify: `client/src/modules/auth/views/Login/Login.jsx`
- Modify: `client/src/modules/auth/views/SignUp/SignUp.jsx`
- Test: `client/src/modules/auth/views/Login/Login.test.jsx` (update existing)
- Test: `client/src/modules/doctor/doctor.routes.test.jsx` (create)

- [ ] **Step 1: Update Login.test for the new patient target**

In `Login.test.jsx`, the `setup()` route map currently has `<Route path="/" element={<div>patient-home</div>} />`. Change it to `<Route path="/browse" element={<div>patient-home</div>} />`. The first test ("routes a patient to / on success") title + assertion stay (it asserts `patient-home` renders); rename the title to "routes a patient to /browse on success" for accuracy. Keep the `/doctor` and `/doctor/change-password` routes unchanged.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --workspace client test -- src/modules/auth/views/Login/Login.test.jsx`
Expected: FAIL — patient routed to `/` but no `/browse` element matches yet (Login still navigates to `/`).

- [ ] **Step 3: Repoint the patient redirect in Login + SignUp**

In both `Login.jsx` and `SignUp.jsx`, change:
```js
const DASHBOARD = { patient: '/', doctor: '/doctor', admin: '/admin' };
```
to:
```js
const DASHBOARD = { patient: '/browse', doctor: '/doctor', admin: '/admin' };
```

- [ ] **Step 4: Move the listing route to `/browse`**

In `doctor.routes.jsx`, change the listing entry:
```js
{ path: '/', element: <DoctorListing /> },
```
to:
```js
{ path: '/browse', element: <DoctorListing /> },
```
Leave `/doctors/:id` and the guarded `/doctor*` routes unchanged.

- [ ] **Step 5: Repoint the topnav "Browse" links**

In `PatientLayout.jsx`, change the two listing links from `to="/"` to `to="/browse"`:
- header nav: `<NavLink to="/browse">Browse</NavLink>`
- mobile tabbar: `<NavLink to="/browse" className="tabbar__item">Browse</NavLink>`
Leave the brand `<Link to="/" className="brand">` pointing at `/` (home/landing). Leave the Appointments/Profile links unchanged.

- [ ] **Step 6: Write the doctor route test**

Create `client/src/modules/doctor/doctor.routes.test.jsx`:
```jsx
import { describe, it, expect } from 'vitest';
import { doctorRoutes } from './doctor.routes.jsx';

describe('doctor routes', () => {
  it('serves the doctor listing at /browse, not /', () => {
    const paths = doctorRoutes(null).map((r) => r.path);
    expect(paths).toContain('/browse');
    expect(paths).not.toContain('/');
    expect(paths).toContain('/doctors/:id');
  });
});
```

- [ ] **Step 7: Run the affected tests**

Run: `npm --workspace client test -- src/modules/auth/views/Login/Login.test.jsx src/modules/doctor/doctor.routes.test.jsx`
Expected: PASS (both).

- [ ] **Step 8: Commit**

```bash
git add client/src/modules/doctor/doctor.routes.jsx client/src/layouts/PatientLayout/PatientLayout.jsx client/src/modules/auth/views/Login/Login.jsx client/src/modules/auth/views/SignUp/SignUp.jsx client/src/modules/auth/views/Login/Login.test.jsx client/src/modules/doctor/doctor.routes.test.jsx
git commit -m "feat(s4): relocate doctor listing / -> /browse; repoint browse links + post-login patient target"
```

---

## Task 2: Landing page (P-01) + `landing_view` + marketing route

**Files:**
- Create: `client/src/modules/marketing/views/Landing/Landing.jsx`
- Create: `client/src/modules/marketing/views/Landing/Landing.css`
- Create: `client/src/modules/marketing/marketing.routes.jsx`
- Create: `client/src/modules/marketing/views/Landing/Landing.test.jsx`
- Modify: `client/src/routes.jsx`

- [ ] **Step 1: Write the failing Landing test**

Create `Landing.test.jsx`:
```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Landing } from './Landing.jsx';
import { track } from '../../../../lib/analytics/track.js';

vi.mock('../../../../lib/analytics/track.js', () => ({ track: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

function setup() {
  return render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  );
}

describe('P-01 Landing', () => {
  it('renders the hero headline', () => {
    setup();
    expect(screen.getByText(/see a real skin doctor without leaving home/i)).toBeTruthy();
  });

  it('primary hero CTA links to /browse and signup CTA links to /signup', () => {
    setup();
    const browse = screen.getByRole('link', { name: /find your dermatologist/i });
    expect(browse.getAttribute('href')).toBe('/browse');
    const signup = screen.getByRole('link', { name: /create your account/i });
    expect(signup.getAttribute('href')).toBe('/signup');
  });

  it('footer links to the legal pages', () => {
    setup();
    expect(screen.getByRole('link', { name: /terms of service/i }).getAttribute('href')).toBe('/legal/terms');
    expect(screen.getByRole('link', { name: /privacy policy/i }).getAttribute('href')).toBe('/legal/privacy');
  });

  it('emits landing_view once on mount with referrer meta', () => {
    setup();
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('landing_view', { referrer: document.referrer || null });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --workspace client test -- src/modules/marketing/views/Landing/Landing.test.jsx`
Expected: FAIL — `Landing.jsx` does not exist.

- [ ] **Step 3: Create Landing.css (verbatim mockup `<style>` block)**

Copy the entire contents of the `<style>` block from `mockups/patient-01-landing.html` (lines 15–62: `.hero-inner` through the media queries) into `Landing.css` verbatim.

- [ ] **Step 4: Implement Landing.jsx (verbatim port)**

Port the mockup `<body>` markup to JSX. Use react-router `Link` for internal nav (`/browse`, `/signup`, `/login`, `/doctors/:id`, `/legal/*`); keep `#how-it-works` and `#` anchors as plain `<a>`. Convert `class`→`className`, inline `style="..."`→`style={{...}}`, self-close tags, `&amp;`→`&`, `&#10003;`→`✓`. Emit `landing_view` once on mount.

```jsx
// @ts-check
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { track } from '../../../../lib/analytics/track.js';
import './Landing.css';

export function Landing() {
  useEffect(() => {
    track('landing_view', { referrer: document.referrer || null });
  }, []);

  return (
    <>
      <nav className="topnav">
        <div className="topnav__inner">
          <Link className="brand" to="/">
            <span className="brand__mark" />
            <span className="brand__word">Dermestha</span>
          </Link>
          <div className="topnav__links">
            <Link to="/browse">Browse</Link>
            <a href="#how-it-works">How it works</a>
            <a href="#">For doctors</a>
            <Link to="/login" className="btn btn--secondary btn--sm">Log in</Link>
          </div>
        </div>
      </nav>

      <section className="feature">
        <div className="hero-inner">
          <div className="hero-copy">
            <span className="feature__eyebrow">PMC-Verified Dermatologists</span>
            <h1 className="display" style={{ marginTop: 14, marginBottom: 16 }}>
              See a real skin doctor without leaving home.
            </h1>
            <p className="body-lg" style={{ color: 'var(--color-on-dark)', maxWidth: 460 }}>
              Book a 30-minute video consultation with a verified dermatologist — get a proper
              diagnosis, prescription, and follow-up plan. From anywhere in Pakistan.
            </p>
            <div className="hero-cta">
              <Link to="/browse" className="btn btn--primary btn--lg">Find your dermatologist</Link>
              <Link to="/signup" className="btn btn--secondary btn--lg">Create your account</Link>
            </div>
            <div className="trust-row">
              <span className="trust-item"><span className="trust-dot" />PMC-verified</span>
              <span className="trust-item"><span className="trust-dot" />30-min video</span>
              <span className="trust-item"><span className="trust-dot" />Itemised Rx</span>
            </div>
          </div>
          <div className="hero-card">
            <Link to="/doctors/sample" style={{ textDecoration: 'none', display: 'block', maxWidth: 280, width: '100%' }}>
              <div className="doc-card">
                <div className="doc-card__img">
                  <img src="https://randomuser.me/api/portraits/women/65.jpg" alt="Dr. Ayesha Khan" />
                  <span className="pmc-badge">✓ PMC</span>
                </div>
                <div className="doc-card__body">
                  <p className="doc-card__name">Dr. Ayesha Khan</p>
                  <p className="doc-card__spec">Acne &amp; Pigmentation · 8 yrs</p>
                  <div className="doc-card__foot">
                    <span className="doc-card__fee tnum">PKR 2,000</span>
                    <span className="doc-card__slot tnum">Today 6:30 PM</span>
                  </div>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </section>

      <section className="porcelain section" id="how-it-works">
        <div className="container">
          <div className="section-title">
            <p className="h2">How Dermestha works</p>
            <p className="body-lg muted" style={{ marginTop: 8 }}>
              Three steps to clear skin, from your phone or laptop.
            </p>
          </div>
          <div className="how-grid">
            <div className="step-card">
              <div className="step-num">01</div>
              <p className="h3" style={{ marginBottom: 8 }}>Browse &amp; book</p>
              <p style={{ margin: 0 }}>
                Choose from PMC-verified dermatologists by specialization, availability, and fee.
                Pick a slot that works for you.
              </p>
            </div>
            <div className="step-card">
              <div className="step-num">02</div>
              <p className="h3" style={{ marginBottom: 8 }}>Consult by video</p>
              <p style={{ margin: 0 }}>
                Join a 30-minute HD video call. Your doctor will examine your skin, ask questions,
                and make a proper diagnosis.
              </p>
            </div>
            <div className="step-card">
              <div className="step-num">03</div>
              <p className="h3" style={{ marginBottom: 8 }}>Receive your Rx</p>
              <p style={{ margin: 0 }}>
                Your itemised prescription is available to download instantly after the consultation
                — with dosage, duration, and prices.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="porcelain section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="section-title">
            <p className="h2">Featured specialists</p>
            <p className="body-lg muted" style={{ marginTop: 8 }}>
              Browse our full panel of PMC-verified dermatologists.
            </p>
          </div>
          <div className="doc-grid">
            {FEATURED.map((d) => (
              <Link key={d.name} to="/doctors/sample" style={{ textDecoration: 'none' }}>
                <div className="doc-card">
                  <div className="doc-card__img">
                    <img src={d.img} alt={d.name} />
                    <span className="pmc-badge">✓ PMC</span>
                  </div>
                  <div className="doc-card__body">
                    <p className="doc-card__name">{d.name}</p>
                    <p className="doc-card__spec">{d.spec}</p>
                    <div className="doc-card__foot">
                      <span className="doc-card__fee tnum">{d.fee}</span>
                      <span className="doc-card__slot tnum">{d.slot}</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: 32 }}>
            <Link to="/browse" className="btn btn--secondary">View all specialists</Link>
          </div>
        </div>
      </section>

      <div className="trust-strip">
        <div className="trust-strip-inner">
          <div className="trust-strip-item">
            <span className="trust-strip-num tnum">120+</span>
            <span className="caption">PMC-verified doctors</span>
          </div>
          <div className="trust-strip-item">
            <span className="trust-strip-num tnum">15,000+</span>
            <span className="caption">Consultations completed</span>
          </div>
          <div className="trust-strip-item">
            <span className="trust-strip-num tnum">4.8 / 5</span>
            <span className="caption">Average patient rating</span>
          </div>
          <div className="trust-strip-item">
            <span className="trust-strip-num tnum">30-min</span>
            <span className="caption">Standard consultation</span>
          </div>
        </div>
      </div>

      <footer className="feature feature-footer">
        <div className="feature-footer-inner">
          <span className="feature__eyebrow">Ready to start?</span>
          <h2 className="display" style={{ marginTop: 12, color: '#fff' }}>
            Clearer skin is one click away.
          </h2>
          <p className="body-lg" style={{ color: 'var(--color-on-dark)', marginTop: 12, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto' }}>
            No referral needed. No waiting room. Just expert dermatology, when and where you need it.
          </p>
          <Link to="/browse" className="btn btn--brass btn--lg" style={{ marginTop: 24 }}>
            Find your dermatologist
          </Link>
          <div className="footer-links">
            <a href="#">For doctors</a>
            <a href="#">About Dermestha</a>
            <Link to="/legal/terms">Terms of Service</Link>
            <Link to="/legal/privacy">Privacy Policy</Link>
          </div>
          <p className="footer-copy">
            © 2026 Dermestha · All consultations conducted by PMC-registered physicians
          </p>
        </div>
      </footer>
    </>
  );
}

const FEATURED = [
  { name: 'Dr. Ayesha Khan', spec: 'Acne & Pigmentation · 8 yrs', fee: 'PKR 2,000', slot: 'Today 6:30 PM', img: 'https://randomuser.me/api/portraits/women/65.jpg' },
  { name: 'Dr. Bilal Sheikh', spec: 'Hair & Scalp · 12 yrs', fee: 'PKR 2,500', slot: 'Tomorrow 10:00 AM', img: 'https://randomuser.me/api/portraits/men/32.jpg' },
  { name: 'Dr. Zara Malik', spec: 'Eczema & Anti-ageing · 6 yrs', fee: 'PKR 1,800', slot: 'Today 8:00 PM', img: 'https://randomuser.me/api/portraits/women/44.jpg' },
];
```

Note: there is a `&amp;` inside JSX text (`Acne &amp; Pigmentation`); in the JS string array use a literal `&`. In the inline JSX (`Browse &amp; book`) keep `&amp;` (valid JSX entity) or use `&`. Either renders `&`.

- [ ] **Step 5: Run the Landing test to verify it passes**

Run: `npm --workspace client test -- src/modules/marketing/views/Landing/Landing.test.jsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Create marketing.routes.jsx with the logged-in-patient redirect**

```jsx
// @ts-check
import { Navigate } from 'react-router-dom';
import { Landing } from './views/Landing/Landing.jsx';

/**
 * Marketing module routes (D3). `/` serves the public P-01 landing; a logged-in patient is
 * redirected to /browse so the logged-out acquisition page isn't shown to them.
 */
export const marketingRoutes = (session) => [
  {
    path: '/',
    element: session?.role === 'patient' ? <Navigate to="/browse" replace /> : <Landing />,
  },
];
```

- [ ] **Step 7: Aggregate marketing routes in routes.jsx**

In `routes.jsx`, add the import and spread `...marketingRoutes(session)` into the `buildRoutes` array (place it first so `/` resolves to the landing):
```js
import { marketingRoutes } from './modules/marketing/marketing.routes.jsx';
// ...
export const buildRoutes = (session) => [
  ...marketingRoutes(session),
  ...authRoutes,
  ...doctorRoutes(session),
  // ...rest unchanged
];
```

- [ ] **Step 8: Add a routing test to Landing.test.jsx (or marketing.routes test)**

Append to `Landing.test.jsx` a `buildRoutes`-level test verifying `/` resolves to the landing for a logged-out session and redirects a patient:
```jsx
import { Routes, Route } from 'react-router-dom';
import { buildRoutes } from '../../../../routes.jsx';

describe('marketing routing', () => {
  function renderAt(entry, session) {
    return render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          {buildRoutes(session).map((r) => (
            <Route key={r.path} path={r.path} element={r.element} />
          ))}
          <Route path="/browse" element={<div>browse-listing</div>} />
        </Routes>
      </MemoryRouter>,
    );
  }
  it('serves the landing at / for a logged-out visitor', () => {
    renderAt('/', null);
    expect(screen.getByText(/see a real skin doctor/i)).toBeTruthy();
  });
  it('redirects a logged-in patient from / to /browse', () => {
    renderAt('/', { role: 'patient' });
    expect(screen.getByText('browse-listing')).toBeTruthy();
  });
});
```
Note: `buildRoutes` brings in the real `/browse` (DoctorListing) which needs QueryClient + session mocks; to avoid that, the test overrides `/browse` with a stub AFTER the mapped routes — but mapped routes win on exact match. Instead, in this test mock the doctor listing: add `vi.mock('../../../doctor/views/DoctorListing/DoctorListing.jsx', () => ({ DoctorListing: () => <div>browse-listing</div> }))` at the top of the file, and drop the manual `/browse` stub Route. Verify the redirect lands on the mocked listing.

- [ ] **Step 9: Run the full marketing test file**

Run: `npm --workspace client test -- src/modules/marketing/views/Landing/Landing.test.jsx`
Expected: PASS (6 tests).

- [ ] **Step 10: Commit**

```bash
git add client/src/modules/marketing client/src/routes.jsx
git commit -m "feat(s4): add public P-01 landing at / with landing_view emit + patient redirect"
```

---

## Task 3: Legal pages (`/legal/terms`, `/legal/privacy`) — DRAFT

**Files:**
- Create: `client/src/modules/legal/components/LegalPage/LegalPage.jsx`
- Create: `client/src/modules/legal/views/Terms/Terms.jsx`
- Create: `client/src/modules/legal/views/Privacy/Privacy.jsx`
- Create: `client/src/modules/legal/legal.routes.jsx`
- Create: `client/src/modules/legal/legal.test.jsx`
- Modify: `client/src/routes.jsx`

- [ ] **Step 1: Write the failing legal test**

Create `legal.test.jsx`:
```jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { legalRoutes } from './legal.routes.jsx';

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        {legalRoutes.map((r) => (
          <Route key={r.path} path={r.path} element={r.element} />
        ))}
      </Routes>
    </MemoryRouter>,
  );
}

describe('F16 Legal pages', () => {
  it('renders the Terms draft with title, banner, and a medical-disclaimer section', () => {
    renderAt('/legal/terms');
    expect(screen.getByRole('heading', { name: /terms of service/i })).toBeTruthy();
    expect(screen.getByText(/draft — pending legal review/i)).toBeTruthy();
    expect(screen.getByText(/medical disclaimer/i)).toBeTruthy();
  });
  it('renders the Privacy draft with title, banner, and a data-handling section', () => {
    renderAt('/legal/privacy');
    expect(screen.getByRole('heading', { name: /privacy policy/i })).toBeTruthy();
    expect(screen.getByText(/draft — pending legal review/i)).toBeTruthy();
    expect(screen.getByText(/data handling/i)).toBeTruthy();
  });
  it('exposes both legal routes publicly (no guard wrapper)', () => {
    const paths = legalRoutes.map((r) => r.path);
    expect(paths).toEqual(expect.arrayContaining(['/legal/terms', '/legal/privacy']));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --workspace client test -- src/modules/legal/legal.test.jsx`
Expected: FAIL — `legal.routes.jsx` does not exist.

- [ ] **Step 3: Implement LegalPage layout**

```jsx
// @ts-check
import { Link } from 'react-router-dom';

/**
 * Reusable F16 legal-document layout: brand topnav, title, "last updated", a persistent
 * DRAFT banner, and structured sections. Public/unauthenticated.
 * @param {{ title: string, lastUpdated: string, sections: { heading: string, body: string }[] }} props
 */
export function LegalPage({ title, lastUpdated, sections }) {
  return (
    <>
      <header className="topnav">
        <div className="topnav__inner container">
          <Link to="/" className="brand">
            <span className="brand__mark" />
            <span className="brand__word">Dermestha</span>
          </Link>
        </div>
      </header>
      <main className="container" style={{ maxWidth: 760, padding: 'var(--sp-6) var(--sp-4) 80px' }}>
        <div
          role="note"
          style={{
            border: '1px solid var(--color-warn, #b45309)',
            background: 'var(--color-warn-bg, #fff7ed)',
            color: 'var(--color-warn, #b45309)',
            borderRadius: 'var(--r-md)',
            padding: 'var(--sp-3) var(--sp-4)',
            marginBottom: 'var(--sp-5)',
            fontWeight: 600,
          }}
        >
          DRAFT — pending legal review. This placeholder content is not final and does not
          constitute legal advice. Final lawyer-reviewed copy replaces it before launch.
        </div>
        <h1>{title}</h1>
        <p className="muted">Last updated: {lastUpdated}</p>
        {sections.map((s) => (
          <section key={s.heading} style={{ marginTop: 'var(--sp-5)' }}>
            <h2>{s.heading}</h2>
            <p>{s.body}</p>
          </section>
        ))}
      </main>
    </>
  );
}
```

- [ ] **Step 4: Implement Terms.jsx**

```jsx
// @ts-check
import { LegalPage } from '../../components/LegalPage/LegalPage.jsx';

const SECTIONS = [
  { heading: 'Eligibility', body: 'DRAFT: You must be 18 or older (or have the consent of a parent or guardian) and resident in Pakistan to create an account and book consultations on Dermestha.' },
  { heading: 'Scope of service & medical disclaimer', body: 'DRAFT: Dermestha connects you with PMC-registered dermatologists for remote video consultations. It is not a substitute for emergency care. In a medical emergency contact local emergency services. Consultations are subject to the clinical judgement of the treating physician.' },
  { heading: 'Bookings, payments & refunds', body: 'DRAFT: A consultation fee is shown before you confirm a booking and is captured at confirmation. Refunds are handled in line with our cancellation and no-show terms below and applicable consumer law.' },
  { heading: 'Cancellations & no-shows', body: 'DRAFT: You may cancel up to a defined window before your appointment for a refund. Missed appointments (no-shows) after the grace period may be non-refundable.' },
  { heading: 'Data handling & privacy', body: 'DRAFT: Your personal and health information is processed as described in our Privacy Policy. By using Dermestha you consent to that processing.' },
  { heading: 'Contact', body: 'DRAFT: Questions about these terms can be directed to support@dermestha.example. This address is a placeholder pending final copy.' },
];

export function Terms() {
  return <LegalPage title="Terms of Service" lastUpdated="DRAFT — not yet finalised" sections={SECTIONS} />;
}
```

- [ ] **Step 5: Implement Privacy.jsx**

```jsx
// @ts-check
import { LegalPage } from '../../components/LegalPage/LegalPage.jsx';

const SECTIONS = [
  { heading: 'Eligibility & consent', body: 'DRAFT: By creating an account you consent to the collection and processing of your information as described here. You may withdraw consent by closing your account, subject to records we must retain by law.' },
  { heading: 'Scope of service', body: 'DRAFT: This policy covers information collected when you browse, register, book, and attend video consultations on Dermestha.' },
  { heading: 'Data we collect & how we handle it', body: 'DRAFT: We collect account details, booking and payment metadata, and consultation-related information. Health information is treated as sensitive and access is restricted to your treating physician and authorised staff. Handling follows the controls described in our internal data-handling policy (specification doc 08).' },
  { heading: 'Bookings, payments & third parties', body: 'DRAFT: Payments are processed by a third-party gateway; we store payment metadata, not full card details. Video calls are delivered by a third-party provider under contract.' },
  { heading: 'Retention, cancellations & your rights', body: 'DRAFT: We retain medical and transaction records for the period required by law. You may request access to or correction of your personal data, subject to verification.' },
  { heading: 'Contact', body: 'DRAFT: Privacy questions can be directed to privacy@dermestha.example. This address is a placeholder pending final copy.' },
];

export function Privacy() {
  return <LegalPage title="Privacy Policy" lastUpdated="DRAFT — not yet finalised" sections={SECTIONS} />;
}
```

- [ ] **Step 6: Implement legal.routes.jsx**

```jsx
// @ts-check
import { Terms } from './views/Terms/Terms.jsx';
import { Privacy } from './views/Privacy/Privacy.jsx';

/** Legal module routes (D3). Public/unauthenticated — linked from signup consent + landing footer. */
export const legalRoutes = [
  { path: '/legal/terms', element: <Terms /> },
  { path: '/legal/privacy', element: <Privacy /> },
];
```

- [ ] **Step 7: Aggregate legal routes in routes.jsx**

Add `import { legalRoutes } from './modules/legal/legal.routes.jsx';` and spread `...legalRoutes` into `buildRoutes` (legal routes are static, no session needed).

- [ ] **Step 8: Run the legal test to verify it passes**

Run: `npm --workspace client test -- src/modules/legal/legal.test.jsx`
Expected: PASS (3 tests).

- [ ] **Step 9: Commit**

```bash
git add client/src/modules/legal client/src/routes.jsx
git commit -m "feat(s4): add public /legal/terms + /legal/privacy DRAFT pages with review banner"
```

---

## Task 4: `booking_started` emit on slot-lock success

**Files:**
- Modify: `client/src/modules/booking/useBooking.js`
- Test: `client/src/modules/booking/views/Booking/Booking.test.jsx` (add a case)

- [ ] **Step 1: Add a failing booking_started test**

In `Booking.test.jsx`, add the track mock at the top (after the existing mocks):
```jsx
vi.mock('../../../../lib/analytics/track.js', () => ({ track: vi.fn() }));
```
and import it:
```jsx
import { track } from '../../../../lib/analytics/track.js';
```
Add a test inside `describe('P-06 Booking', ...)`:
```jsx
it('emits booking_started once when the slot lock succeeds', async () => {
  api.post
    .mockResolvedValueOnce({ id: 'a1' }) // lock
    .mockResolvedValueOnce({ redirectUrl: '/dev/checkout?ref=mock_1' }); // pay
  setup();
  await waitFor(() => expect(screen.getByText('Dr A')).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: /confirm & pay/i }));
  await waitFor(() => expect(track).toHaveBeenCalledWith('booking_started', { doctorId: 'd1' }));
  expect(track).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --workspace client test -- src/modules/booking/views/Booking/Booking.test.jsx`
Expected: FAIL — `track` never called.

- [ ] **Step 3: Emit booking_started after the lock succeeds**

In `useBooking.js`, import track and emit right after the lock resolves:
```js
import { track } from '../../lib/analytics/track.js';
// ...
const appt = await api.post('/appointments/lock', body);
track('booking_started', { doctorId });
const { redirectUrl } = await api.post(`/appointments/${appt.id}/pay`);
```

- [ ] **Step 4: Run the booking test to verify it passes**

Run: `npm --workspace client test -- src/modules/booking/views/Booking/Booking.test.jsx`
Expected: PASS (all P-06 cases, incl. the new one).

- [ ] **Step 5: Commit**

```bash
git add client/src/modules/booking/useBooking.js client/src/modules/booking/views/Booking/Booking.test.jsx
git commit -m "feat(s4): emit booking_started on slot-lock success (KPI #1)"
```

---

## Task 5: Full verification

- [ ] **Step 1: Full client suite**

Run: `npm --workspace client test`
Expected: all green; ~122 tests (112 baseline + ~10 new).

- [ ] **Step 2: Server + shared suite (must stay green)**

Run: `npm test`
Expected: 287 tests pass (unchanged — no server edits).

- [ ] **Step 3: Production build**

Run: `npm --workspace client run build`
Expected: build succeeds (no unresolved imports / CSS errors).

- [ ] **Step 4: Commit the plan doc (if not already)**

```bash
git add docs/superpowers/plans/2026-06-13-slice-h-s4-public-surface.md
git commit -m "docs(s4): implementation plan for public surface (landing + legal)"
```

---

## Doc-impact tracker (applied at task END, with approval — DO NOT edit specs mid-task)

Per the design spec §7, the following canonical-spec updates are anticipated. Confirm/finalise during the end-of-task doc-impact check:

| Doc | Change |
| --- | --- |
| 02  | F16 pages built-as-DRAFT; KPI #1 client emit points (`landing_view`, `booking_started`) |
| 05  | New public routes `/` (landing), `/browse` (listing relocation), `/legal/terms`, `/legal/privacy` |
| 06  | P-01 built; routing change (`/`→landing, listing→`/browse`); reusable `LegalPage` pattern |
| 08  | Privacy page ↔ data-handling policy cross-reference |
| 11  | New ADR — "Landing at root, listing → `/browse`; legal pages ship as a review-gated DRAFT" |
| 13  | P-01, F16, legal templates → Built; landing/browse/legal routes |

**Pre-launch gate:** final lawyer-reviewed ToS + Privacy copy replaces the DRAFT before go-live.
</content>
</invoke>
