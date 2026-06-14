// @ts-check
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { track } from '../../../../lib/analytics/track.js';
import './Landing.css';

const FEATURED = [
  { name: 'Dr. Ayesha Khan', spec: 'Acne & Pigmentation · 8 yrs', fee: 'PKR 2,000', slot: 'Today 6:30 PM', img: 'https://randomuser.me/api/portraits/women/65.jpg' },
  { name: 'Dr. Bilal Sheikh', spec: 'Hair & Scalp · 12 yrs', fee: 'PKR 2,500', slot: 'Tomorrow 10:00 AM', img: 'https://randomuser.me/api/portraits/men/32.jpg' },
  { name: 'Dr. Zara Malik', spec: 'Eczema & Anti-ageing · 6 yrs', fee: 'PKR 1,800', slot: 'Today 8:00 PM', img: 'https://randomuser.me/api/portraits/women/44.jpg' },
];

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
            {/* Static placeholder card (doc 06 §3) — display-only, no profile link. */}
            <div style={{ display: 'block', maxWidth: 280, width: '100%' }}>
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
            </div>
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
              // Static placeholder card (doc 06 §3) — display-only, no profile link.
              <div key={d.name}>
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
              </div>
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
