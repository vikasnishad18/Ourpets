const { useEffect, useMemo, useRef, useState } = React;

function PawIcon(props) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" {...props}>
      <path d="M23 27c-4 0-7-3-7-7s3-8 7-8 7 4 7 8-3 7-7 7Zm18 0c-4 0-7-3-7-7s3-8 7-8 7 4 7 8-3 7-7 7ZM16 45c-4 0-7-3-7-7s3-8 7-8 7 4 7 8-3 7-7 7Zm32 0c-4 0-7-3-7-7s3-8 7-8 7 4 7 8-3 7-7 7ZM32 56c-10 0-18-6-18-13 0-9 8-16 18-16s18 7 18 16c0 7-8 13-18 13Z" />
    </svg>
  );
}

function Icon({ children }) {
  return <div className="icon">{children}</div>;
}

function scrollToId(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function buildSupabaseRestConfig() {
  const url = (window.OURPETS_SUPABASE_URL || "https://sbiwiyfashlmmxokhjlp.supabase.co").trim();
  const anonKey = (window.OURPETS_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNiaXdpeWZhc2hsbW14b2toamxwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MjQ0NTMsImV4cCI6MjA5MTMwMDQ1M30.VB4YV-7O7hPb22ehqe3oYo_3JbWL1kW1mKJH4_mes5Y").trim();
  return { url, anonKey };
}

async function submitInquiry(payload) {
  const { url, anonKey } = buildSupabaseRestConfig();
  if (!url || !anonKey) {
    return {
      ok: false,
      message:
        "Supabase is not configured yet. Edit OURPETS_SUPABASE_URL and OURPETS_SUPABASE_ANON_KEY in index.html (README has steps).",
    };
  }

  const normalizedUrl = url.replace(/\/$/, "");
  const endpoint = `${normalizedUrl}/rest/v1/inquiries`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let details = "";
    try {
      const text = await res.text();
      details = text ? ` (${text})` : "";
    } catch {
      // ignore
    }
    return { ok: false, message: `Could not save inquiry${details}. Check table + RLS policy.` };
  }

  let where = "";
  try {
    where = new URL(normalizedUrl).hostname;
  } catch {
    where = normalizedUrl;
  }
  return { ok: true, message: `Sent! Saved to Supabase (${where}).` };
}

function App() {
  const services = useMemo(
    () => [
      {
        title: "Gentle Grooming",
        desc: "Bath, brush, trim - with treats, calm music, and cozy towels.",
        accent: "pink",
        icon: (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7.5 2a2.5 2.5 0 0 0-2.45 3 5.5 5.5 0 0 0-1.05 3.25V12a5 5 0 0 0 3 4.58V20a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-3.42A5 5 0 0 0 20 12V8.25A5.5 5.5 0 0 0 18.95 5a2.5 2.5 0 1 0-4.57-2.3A6 6 0 0 0 12 2c-.9 0-1.75.2-2.5.56A2.49 2.49 0 0 0 7.5 2Zm3 2.5c.47-.18.98-.28 1.5-.28.64 0 1.25.14 1.8.4a1.1 1.1 0 0 0 1.52-.64 1.26 1.26 0 1 1 2.4.83 1.1 1.1 0 0 0 .33 1.24A3.27 3.27 0 0 1 18 8.25V12a3 3 0 0 1-1.9 2.79 1.1 1.1 0 0 0-.7 1.02V20h-6v-4.19a1.1 1.1 0 0 0-.7-1.02A3 3 0 0 1 6 12V8.25c0-.86.33-1.64.87-2.22a1.1 1.1 0 0 0 .32-1.05A1.26 1.26 0 0 1 7.5 3.2a1.26 1.26 0 0 1 1.2.86 1.1 1.1 0 0 0 1.8.44Z" />
          </svg>
        ),
      },
      {
        title: "Vet-Friendly Essentials",
        desc: "Care products chosen for sensitive skin and waggy comfort.",
        accent: "sky",
        icon: (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M10 2a1 1 0 0 0-1 1v2H7a1 1 0 0 0-1 1v2H4a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h2v2a1 1 0 0 0 1 1h2v2a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-2h2a1 1 0 0 0 1-1v-2h2a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1h-2V6a1 1 0 0 0-1-1h-2V3a1 1 0 0 0-1-1h-4Zm1 2h2v2a1 1 0 0 0 1 1h2v2a1 1 0 0 0 1 1h2v2h-2a1 1 0 0 0-1 1v2h-2a1 1 0 0 0-1 1v2h-2v-2a1 1 0 0 0-1-1H7v-2a1 1 0 0 0-1-1H4v-2h2a1 1 0 0 0 1-1V7h2a1 1 0 0 0 1-1V4Z" />
          </svg>
        ),
      },
      {
        title: "Happy Training",
        desc: "Tiny steps, big cheers - positive reinforcement starter sessions.",
        accent: "mint",
        icon: (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2a5 5 0 0 1 5 5c0 2.24-1.48 4.14-3.52 4.76L14 20a2 2 0 0 1-2 2h0a2 2 0 0 1-2-2l.52-8.24A5.01 5.01 0 0 1 7 7a5 5 0 0 1 5-5Zm0 2a3 3 0 0 0-3 3c0 1.21.72 2.24 1.76 2.72a1.1 1.1 0 0 1 .64 1.08L12 20h0l.6-9.2a1.1 1.1 0 0 1 .64-1.08A3 3 0 0 0 15 7a3 3 0 0 0-3-3Z" />
          </svg>
        ),
      },
    ],
    []
  );

  const products = useMemo(
    () => [
      { name: "Berry Soft Brush", note: "For silky coats", price: "INR 399", tone: "pink" },
      { name: "Minty Paw Balm", note: "Dry paw relief", price: "INR 279", tone: "mint" },
      { name: "Sky Blue Collar", note: "Comfy + cute", price: "INR 499", tone: "sky" },
    ],
    []
  );

  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    pet_type: "Dog",
    service: "Grooming",
    preferred_date: "",
    message: "",
  });
  const [status, setStatus] = useState({ kind: "idle", text: "" });
  const [isSending, setIsSending] = useState(false);
  const lastSentAt = useRef(0);

  const supabaseInfo = useMemo(() => {
    const { url, anonKey } = buildSupabaseRestConfig();
    const configured = !!url && !!anonKey;
    let host = "";
    if (url) {
      try {
        host = new URL(url).hostname;
      } catch {
        host = url;
      }
    }
    return { configured, host };
  }, []);

  function updateField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (isSending) return;
    const now = Date.now();
    if (now - lastSentAt.current < 1200) return;
    lastSentAt.current = now;

    setIsSending(true);
    setStatus({ kind: "idle", text: "" });
    try {
      const payload = {
        full_name: form.full_name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        pet_type: form.pet_type,
        service: form.service,
        preferred_date: form.preferred_date || null,
        message: form.message.trim() || null,
        source: "ourpets-demo",
      };

      if (!payload.full_name) {
        setStatus({ kind: "err", text: "Please enter your name (so we can say hi!)." });
        return;
      }

      const result = await submitInquiry(payload);
      setStatus({ kind: result.ok ? "ok" : "err", text: result.message });
      if (result.ok) {
        setForm((f) => ({ ...f, message: "" }));
      }
    } catch (err) {
      const msg = err && err.message ? err.message : "Something went wrong.";
      setStatus({ kind: "err", text: msg });
    } finally {
      setIsSending(false);
    }
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setStatus({ kind: "idle", text: "" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div>
      <header className="topbar">
        <div className="container topbar-inner">
          <a className="brand" href="#" onClick={(e) => (e.preventDefault(), scrollToId("top"))}>
            <span className="brand-mark" aria-hidden="true">
              <PawIcon />
            </span>
            <span>
              Ourpets <span style={{ color: "#b93b69" }}>•</span> Pet Care Store
            </span>
          </a>
          <nav className="nav" aria-label="Main">
            <a className="chip" href="#services" onClick={(e) => (e.preventDefault(), scrollToId("services"))}>
              Services
            </a>
            <a className="chip" href="#products" onClick={(e) => (e.preventDefault(), scrollToId("products"))}>
              Products
            </a>
            <a className="chip" href="#contact" onClick={(e) => (e.preventDefault(), scrollToId("contact"))}>
              Contact
            </a>
            <button className="chip primary" onClick={() => scrollToId("contact")}>
              Book a Visit
            </button>
          </nav>
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="container hero-grid">
            <div className="panel hero-main">
              <span className="kicker">
                <PawIcon style={{ width: 16, height: 16, fill: "currentColor" }} />
                Adorable care, everyday essentials
              </span>
              <h1 className="title">
                Make your pet’s day
                <br />
                extra cozy.
              </h1>
              <p className="subtitle">
                A cute, user-friendly demo site for <b>Ourpets</b> — featuring services, products, and a contact form
                that can save inquiries to <b>Supabase</b>.
              </p>
              <img src="images/Pet care store interior display.png" alt="Happy pet illustration" style={{width: '100%', borderRadius: '8px', marginTop: '20px'}} />
              <div className="cta-row">
                <button className="btn primary" onClick={() => scrollToId("contact")}>
                  Send an Inquiry
                </button>
                <button className="btn" onClick={() => scrollToId("products")}>
                  Browse Cute Picks
                </button>
              </div>
              <p className="notice">
                Tip: For a live demo, set Supabase keys in <code>index.html</code>. (Your client will love the “sent!”
                moment.)
              </p>
            </div>

            <aside className="panel hero-side" aria-label="Highlights">
              <div className="mini-card">
                <p className="mini-title">
                  Same-day Grooming <span className="tag pink">Popular</span>
                </p>
                <p className="mini-desc">Quick slots daily. Gentle shampoo + fluff finish.</p>
              </div>
              <div className="mini-card">
                <p className="mini-title">
                  Treat Bar <span className="tag">New</span>
                </p>
                <p className="mini-desc">Training treats, dental chews, and “good dog!” snacks.</p>
              </div>
              <div className="mini-card">
                <p className="mini-title">
                  Cozy Delivery <span className="tag sky">Free*</span>
                </p>
                <p className="mini-desc">Free delivery over ₹999 (demo offer). Tiny pawprints included.</p>
              </div>
            </aside>
          </div>
        </section>

        <section className="section" id="services">
          <div className="container">
            <div className="section-header">
              <h2 className="h2">
                Services
                <small>Care that feels like a warm hug (but for pets).</small>
              </h2>
              <span className="pill">
                <span className="dot pink" aria-hidden="true"></span> Gentle &amp; friendly
              </span>
            </div>

            <div className="grid" role="list">
              {services.map((s, index) => {
                const imageNames = ['p1.png.png', 'p2.png.png', 'p3.png.png'];
                return (
                  <div className="card" role="listitem" key={s.title}>
                    <Icon>{s.icon}</Icon>
                    <img src={`images/${imageNames[index]}`} alt={`${s.title} illustration`} style={{width: '100%', borderRadius: '8px', marginBottom: '10px'}} />
                    <h3>{s.title}</h3>
                    <p>{s.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="section" id="products">
          <div className="container">
            <div className="section-header">
              <h2 className="h2">
                Featured Products
                <small>Dummy items for a clean client preview.</small>
              </h2>
              <span className="pill">
                <span className="dot sky" aria-hidden="true"></span> Curated picks
              </span>
            </div>

            <div className="grid" role="list">
              {products.map((p, index) => {
                const imageNames = ['p4.png.png', 'p5.png.png', 'p6.png.png'];
                return (
                  <div className="card" role="listitem" key={p.name}>
                    <Icon>
                      <PawIcon />
                    </Icon>
                    <img src={`images/${imageNames[index]}`} alt={`${p.name} product image`} style={{width: '100%', borderRadius: '8px', marginBottom: '10px'}} />
                    <h3 style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                      <span>{p.name}</span>
                      <span style={{ color: "#b93b69", fontWeight: 900 }}>{p.price}</span>
                    </h3>
                    <p>{p.note}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="section" id="contact">
          <div className="container">
            <div className="section-header">
              <h2 className="h2">
                Contact / Booking
                <small>Submits to Supabase table: <code>inquiries</code>.</small>
              </h2>
              <span className="pill">
                <span className="dot" aria-hidden="true"></span> Saved to Supabase
              </span>
            </div>

            <div className="split">
              <div className="panel form">
                <form onSubmit={onSubmit}>
                  <div className="form-grid">
                    <label>
                      Your name
                      <input
                        value={form.full_name}
                        onChange={(e) => updateField("full_name", e.target.value)}
                        placeholder="e.g., Aanya Sharma"
                        autoComplete="name"
                      />
                    </label>
                    <label>
                      Phone (optional)
                      <input
                        value={form.phone}
                        onChange={(e) => updateField("phone", e.target.value)}
                        placeholder="e.g., +91 98xxxxxx"
                        autoComplete="tel"
                      />
                    </label>
                    <label>
                      Email (optional)
                      <input
                        value={form.email}
                        onChange={(e) => updateField("email", e.target.value)}
                        placeholder="e.g., hello@ourpets.in"
                        autoComplete="email"
                        inputMode="email"
                      />
                    </label>
                    <label>
                      Pet type
                      <select value={form.pet_type} onChange={(e) => updateField("pet_type", e.target.value)}>
                        <option>Dog</option>
                        <option>Cat</option>
                        <option>Bird</option>
                        <option>Other</option>
                      </select>
                    </label>
                    <label>
                      Service
                      <select value={form.service} onChange={(e) => updateField("service", e.target.value)}>
                        <option>Grooming</option>
                        <option>Training</option>
                        <option>Product Inquiry</option>
                        <option>General Question</option>
                      </select>
                    </label>
                    <label>
                      Preferred date (optional)
                      <input
                        value={form.preferred_date}
                        onChange={(e) => updateField("preferred_date", e.target.value)}
                        type="date"
                      />
                    </label>
                    <label className="full">
                      Message (optional)
                      <textarea
                        value={form.message}
                        onChange={(e) => updateField("message", e.target.value)}
                        placeholder="Tell us about your pet (age, breed, special needs) or what you’d like to buy."
                      />
                    </label>
                  </div>

                  <div className="cta-row" style={{ marginTop: 12 }}>
                    <button className="btn primary" type="submit" disabled={isSending}>
                      {isSending ? "Sending…" : "Send Inquiry"}
                    </button>
                    <button
                      className="btn"
                      type="button"
                      onClick={() =>
                        setForm({
                          full_name: "",
                          phone: "",
                          email: "",
                          pet_type: "Dog",
                          service: "Grooming",
                          preferred_date: "",
                          message: "",
                        })
                      }
                    >
                      Clear
                    </button>
                  </div>

                  {!!status.text && (
                    <div className={`toast ${status.kind === "ok" ? "ok" : "err"}`} role="status">
                      {status.text}
                    </div>
                  )}

                  <p className="notice">
                    This is a dummy client demo. You can customize the services/products later or connect a real catalog.
                  </p>
                </form>
              </div>

              <div className="panel form" aria-label="Store details">
                <div className="mini-card">
                  <p className="mini-title">
                    Ourpets Store <span className="tag">Demo</span>
                  </p>
                  <p className="mini-desc">
                    Open daily: 10:00–20:00
                    <br />
                    Address: Your City, India
                    <br />
                    WhatsApp: +91 98xxxxxx
                  </p>
                </div>

                <div className="mini-card">
                  <p className="mini-title">
                    Supabase status{" "}
                    <span className={`tag ${supabaseInfo.configured ? "" : "pink"}`}>
                      {supabaseInfo.configured ? "Configured" : "Not set"}
                    </span>
                  </p>
                  <p className="mini-desc">
                    Table: <b>public.inquiries</b>
                    <br />
                    Project: {supabaseInfo.host ? <b>{supabaseInfo.host}</b> : <b>(missing URL)</b>}
                  </p>
                </div>

                <div className="mini-card">
                  <p className="mini-title">
                    What clients love <span className="tag pink">Aww</span>
                  </p>
                  <p className="mini-desc">
                    “The fluffiest grooming ever.” — Riya
                    <br />
                    “My cat actually purred.” — Aman
                    <br />
                    “The treat bar is dangerous.” — Neha
                  </p>
                </div>

                <div className="mini-card">
                  <p className="mini-title">
                    Quick FAQ <span className="tag sky">Help</span>
                  </p>
                  <p className="mini-desc">
                    <b>Do you have vet items?</b> Yes, curated essentials.
                    <br />
                    <b>Any home pickup?</b> Optional in your real version.
                    <br />
                    <b>Is this real?</b> It’s a client-ready demo.
                  </p>
                </div>

                <p className="notice">
                  Press <b>Esc</b> to clear the message toast.
                </p>
              </div>
            </div>
          </div>
        </section>

        <footer className="footer">
          <div className="container fineprint">
            <span>© {new Date().getFullYear()} Ourpets (demo)</span>
            <span style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <span className="pill">
                <span className="dot pink" aria-hidden="true"></span> React (CDN)
              </span>
              <span className="pill">
                <span className="dot" aria-hidden="true"></span> Supabase REST
              </span>
              <span className="pill">
                <span className="dot sky" aria-hidden="true"></span> Cute UI
              </span>
            </span>
          </div>
        </footer>
      </main>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
