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
  const url = (window.OURPETS_SUPABASE_URL || "").trim();
  const anonKey = (window.OURPETS_SUPABASE_ANON_KEY || "").trim();
  return { url, anonKey };
}

const ADMIN_SESSION_STORAGE_KEY = "ourpets_admin_session_v1";

function loadAdminSession() {
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.access_token || !parsed.user) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveAdminSession(session) {
  localStorage.setItem(ADMIN_SESSION_STORAGE_KEY, JSON.stringify(session));
}

function clearAdminSession() {
  localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
}

async function supabaseRequest(pathAndQuery, options) {
  const { url, anonKey } = buildSupabaseRestConfig();
  if (!url || !anonKey) throw new Error("Supabase is not configured. Add keys in config.local.js.");
  const normalizedUrl = url.replace(/\/$/, "");
  const endpoint = `${normalizedUrl}${pathAndQuery.startsWith("/") ? "" : "/"}${pathAndQuery}`;
  const headers = Object.assign({ apikey: anonKey }, options && options.headers ? options.headers : {});
  const res = await fetch(endpoint, Object.assign({}, options, { headers }));
  return res;
}

async function authPasswordLogin(email, password) {
  const { url, anonKey } = buildSupabaseRestConfig();
  if (!url || !anonKey) return { ok: false, message: "Supabase is not configured. Add keys in config.local.js." };

  const normalizedUrl = url.replace(/\/$/, "");
  const endpoint = `${normalizedUrl}/auth/v1/token?grant_type=password`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const msg = (data && (data.error_description || data.msg || data.message)) || text || "Login failed.";
    return { ok: false, message: msg };
  }
  if (!data || !data.access_token || !data.user) return { ok: false, message: "Unexpected login response." };
  return { ok: true, session: data };
}

async function authSignUp(email, password) {
  const { url, anonKey } = buildSupabaseRestConfig();
  if (!url || !anonKey) return { ok: false, message: "Supabase is not configured. Add keys in config.local.js." };

  const normalizedUrl = url.replace(/\/$/, "");
  const endpoint = `${normalizedUrl}/auth/v1/signup`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const msg = (data && (data.error_description || data.msg || data.message)) || text || "Sign up failed.";
    return { ok: false, message: msg };
  }

  // Supabase may return { user, session } or { user, session: null } depending on email confirmation settings.
  return { ok: true, data };
}

async function authGetUser(accessToken) {
  const { url, anonKey } = buildSupabaseRestConfig();
  if (!url || !anonKey) return { ok: false, user: null };
  const normalizedUrl = url.replace(/\/$/, "");
  const endpoint = `${normalizedUrl}/auth/v1/user`;
  const res = await fetch(endpoint, {
    method: "GET",
    headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return { ok: false, user: null };
  const user = await res.json();
  return { ok: true, user };
}

async function checkIsAdmin(userId, accessToken) {
  const { url, anonKey } = buildSupabaseRestConfig();
  if (!url || !anonKey) return { ok: false, isAdmin: false };
  const normalizedUrl = url.replace(/\/$/, "");
  const endpoint = `${normalizedUrl}/rest/v1/admin_users?select=user_id&user_id=eq.${encodeURIComponent(userId)}&limit=1`;
  const res = await fetch(endpoint, {
    method: "GET",
    headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return { ok: false, isAdmin: false };
  const rows = await res.json();
  return { ok: true, isAdmin: Array.isArray(rows) && rows.length > 0 };
}

async function logSessionEvent(accessToken, payload) {
  const res = await supabaseRequest("/rest/v1/user_session_events", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    // best effort: don’t block login
    return { ok: false };
  }
  return { ok: true };
}

async function upsertUserProfile(accessToken, row) {
  const res = await supabaseRequest("/rest/v1/user_profiles", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) return { ok: false, message: await res.text() };
  return { ok: true };
}

async function fetchUserProfile(accessToken, userId) {
  const res = await supabaseRequest(`/rest/v1/user_profiles?select=user_id,phone&user_id=eq.${encodeURIComponent(userId)}&limit=1`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return { ok: false, profile: null };
  const rows = await res.json();
  return { ok: true, profile: Array.isArray(rows) && rows[0] ? rows[0] : null };
}

async function fetchSessionEvents(accessToken, limit) {
  const lim = typeof limit === "number" ? limit : 10;
  const res = await supabaseRequest(`/rest/v1/user_session_events?select=id,created_at,event_type,is_admin,tz&order=created_at.desc&limit=${encodeURIComponent(lim)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return { ok: false, events: [] };
  const rows = await res.json();
  return { ok: true, events: Array.isArray(rows) ? rows : [] };
}

async function fetchPublicServices() {
  const { url, anonKey } = buildSupabaseRestConfig();
  if (!url || !anonKey) return { ok: false, services: null };

  const normalizedUrl = url.replace(/\/$/, "");
  const endpoint = `${normalizedUrl}/rest/v1/services?select=id,title,description,icon,sort_order&is_active=eq.true&order=sort_order.asc`;
  const res = await fetch(endpoint, {
    method: "GET",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
  });

  if (!res.ok) return { ok: false, services: null };
  const data = await res.json();
  return { ok: true, services: Array.isArray(data) ? data : null };
}

async function fetchPublicSitePhotos() {
  const { url, anonKey } = buildSupabaseRestConfig();
  if (!url || !anonKey) return { ok: false, rows: null };

  const normalizedUrl = url.replace(/\/$/, "");
  const endpoint = `${normalizedUrl}/rest/v1/site_photos?select=id,section,title,url,sort_order&is_active=eq.true&order=section.asc,sort_order.asc`;
  const res = await fetch(endpoint, {
    method: "GET",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
  });

  if (!res.ok) return { ok: false, rows: null };
  const data = await res.json();
  return { ok: true, rows: Array.isArray(data) ? data : null };
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
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("ourpets_theme") || "pastel";
    } catch {
      return "pastel";
    }
  });

  const fallbackServices = useMemo(
    () => [
      { title: "Gentle Grooming", description: "Bath, brush, trim - with treats, calm music, and cozy towels.", icon: "grooming" },
      { title: "Vet-Friendly Essentials", description: "Care products chosen for sensitive skin and waggy comfort.", icon: "medical" },
      { title: "Happy Training", description: "Tiny steps, big cheers - positive reinforcement starter sessions.", icon: "training" },
    ],
    []
  );

  const [services, setServices] = useState(fallbackServices);
  const [servicesFromDb, setServicesFromDb] = useState(false);
  const [sitePhotos, setSitePhotos] = useState(() => ({}));

  const products = useMemo(
    () => [
      { name: "Berry Soft Brush", note: "For silky coats", price: "INR 399", tone: "pink" },
      { name: "Minty Paw Balm", note: "Dry paw relief", price: "INR 279", tone: "mint" },
      { name: "Sky Blue Collar", note: "Comfy + cute", price: "INR 499", tone: "sky" },
    ],
    []
  );

  const tips = useMemo(
    () => [
      { title: "Quick Grooming Tip", text: "Brush 3–5 minutes daily to reduce shedding and keep coats shiny." },
      { title: "Hydration Tip", text: "Fresh water + a clean bowl every day helps energy and digestion." },
      { title: "Training Tip", text: "Reward the exact moment your pet does the right thing (tiny treats work best)." },
      { title: "Comfort Tip", text: "A familiar blanket can reduce stress during grooming or travel." },
      { title: "Paw Care Tip", text: "Check paws after walks for tiny stones, hot surfaces, or dryness." },
    ],
    []
  );

  const [tipIndex, setTipIndex] = useState(() => Math.floor(Math.random() * tips.length));
  const [productQuery, setProductQuery] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login"); // login | signup
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authPassword2, setAuthPassword2] = useState("");
  const [authPhone, setAuthPhone] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authUser, setAuthUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authToast, setAuthToast] = useState({ kind: "idle", text: "" });
  const [authSession, setAuthSession] = useState(() => loadAdminSession());

  const [profilePhone, setProfilePhone] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [events, setEvents] = useState([]);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sess = loadAdminSession();
      if (!sess) return;
      setAuthSession(sess);

      const who = await authGetUser(sess.access_token);
      if (cancelled) return;
      if (!who.ok || !who.user) {
        clearAdminSession();
        setAuthSession(null);
        return;
      }
      setAuthUser(who.user);

      const adminCheck = await checkIsAdmin(who.user.id, sess.access_token);
      if (cancelled) return;
      setIsAdmin(!!(adminCheck.ok && adminCheck.isAdmin));

      const p = await fetchUserProfile(sess.access_token, who.user.id);
      if (!cancelled && p.ok && p.profile && p.profile.phone) setProfilePhone(p.profile.phone);

      const ev = await fetchSessionEvents(sess.access_token, 10);
      if (!cancelled && ev.ok) setEvents(ev.events);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await fetchPublicServices();
        if (cancelled) return;
        if (result.ok && result.services && result.services.length) {
          setServices(result.services);
          setServicesFromDb(true);
        } else {
          setServices(fallbackServices);
          setServicesFromDb(false);
        }
      } catch {
        if (cancelled) return;
        setServices(fallbackServices);
        setServicesFromDb(false);
      }

      try {
        const ph = await fetchPublicSitePhotos();
        if (cancelled) return;
        if (ph.ok && ph.rows) {
          const grouped = {};
          for (const row of ph.rows) {
            const key = row && row.section ? String(row.section) : "other";
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(row);
          }
          setSitePhotos(grouped);
        } else {
          setSitePhotos({});
        }
      } catch {
        if (cancelled) return;
        setSitePhotos({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fallbackServices]);

  useEffect(() => {
    const night = theme === "night";
    document.body.classList.toggle("theme-night", night);
    try {
      localStorage.setItem("ourpets_theme", theme);
    } catch {
      // ignore
    }
  }, [theme]);

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
      if (e.key !== "Escape") return;
      if (authOpen) {
        setAuthOpen(false);
        return;
      }
      setStatus({ kind: "idle", text: "" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [authOpen]);

  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => (p.name + " " + p.note).toLowerCase().includes(q));
  }, [productQuery, products]);

  async function copyTip() {
    const t = tips[tipIndex];
    const text = `${t.title}: ${t.text}`;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        setStatus({ kind: "ok", text: "Tip copied to clipboard." });
        return;
      }
    } catch {
      // ignore
    }
    setStatus({ kind: "err", text: "Could not copy on this browser. You can manually select the text." });
  }

  async function onAuthSubmit(e) {
    e.preventDefault();
    if (authBusy) return;
    setAuthBusy(true);
    setAuthToast({ kind: "idle", text: "" });
    try {
      const email = authEmail.trim();
      if (!email) {
        setAuthToast({ kind: "err", text: "Please enter your email." });
        return;
      }
      if (!authPassword || authPassword.length < 6) {
        setAuthToast({ kind: "err", text: "Password must be at least 6 characters." });
        return;
      }

      let session = null;

      if (authMode === "signup") {
        if (authPassword !== authPassword2) {
          setAuthToast({ kind: "err", text: "Passwords do not match." });
          return;
        }
        const result = await authSignUp(email, authPassword);
        if (!result.ok) {
          setAuthToast({ kind: "err", text: result.message });
          return;
        }
        session = result.data && result.data.session ? result.data.session : null;
        if (!session) {
          setAuthToast({
            kind: "ok",
            text: "Account created. If email confirmation is enabled, check your inbox, confirm, then sign in.",
          });
          setAuthMode("login");
          setAuthPassword("");
          setAuthPassword2("");
          return;
        }
      } else {
        const result = await authPasswordLogin(email, authPassword);
        if (!result.ok) {
          setAuthToast({ kind: "err", text: result.message });
          return;
        }
        session = result.session;
      }

      saveAdminSession(session);
      setAuthSession(session);
      const who = await authGetUser(session.access_token);
      if (!who.ok || !who.user) {
        setAuthToast({ kind: "err", text: "Signed in, but could not load user profile." });
        return;
      }
      setAuthUser(who.user);

      const adminCheck = await checkIsAdmin(who.user.id, session.access_token);
      const admin = !!(adminCheck.ok && adminCheck.isAdmin);
      setIsAdmin(admin);

      // Optional phone capture (only if user provided one)
      const phone = authPhone.trim();
      if (phone) {
        await upsertUserProfile(session.access_token, { user_id: who.user.id, phone });
        setProfilePhone(phone);
      } else {
        const p = await fetchUserProfile(session.access_token, who.user.id);
        if (p.ok && p.profile && p.profile.phone) setProfilePhone(p.profile.phone);
      }

      // Session history (best effort)
      const tz =
        (Intl && Intl.DateTimeFormat && Intl.DateTimeFormat().resolvedOptions
          ? Intl.DateTimeFormat().resolvedOptions().timeZone
          : "") || "";
      await logSessionEvent(session.access_token, {
        user_id: who.user.id,
        event_type: "login",
        is_admin: admin,
        user_agent: navigator.userAgent || null,
        tz: tz || null,
      });
      const ev = await fetchSessionEvents(session.access_token, 10);
      if (ev.ok) setEvents(ev.events);

      if (admin) {
        setAuthToast({ kind: "ok", text: "Welcome admin! Redirecting to admin panel…" });
        setTimeout(() => {
          window.location.href = "./admin.html";
        }, 450);
        return;
      }

      setAuthToast({ kind: "ok", text: "Signed in. Welcome!" });
      setAuthOpen(false);
    } catch (err) {
      const msg = err && err.message ? err.message : "Login failed.";
      setAuthToast({ kind: "err", text: msg });
    } finally {
      setAuthBusy(false);
    }
  }

  function onLogout() {
    (async () => {
      try {
        const sess = loadAdminSession();
        if (sess && sess.access_token && sess.user && sess.user.id) {
          const tz =
            (Intl && Intl.DateTimeFormat && Intl.DateTimeFormat().resolvedOptions
              ? Intl.DateTimeFormat().resolvedOptions().timeZone
              : "") || "";
          await logSessionEvent(sess.access_token, {
            user_id: sess.user.id,
            event_type: "logout",
            is_admin: isAdmin,
            user_agent: navigator.userAgent || null,
            tz: tz || null,
          });
        }
      } catch {
        // ignore
      } finally {
        clearAdminSession();
        setAuthSession(null);
        setAuthUser(null);
        setIsAdmin(false);
        setProfilePhone("");
        setEvents([]);
        setAuthToast({ kind: "idle", text: "" });
        setStatus({ kind: "ok", text: "Logged out." });
      }
    })();
    setAuthToast({ kind: "idle", text: "" });
  }

  async function onSavePhone() {
    if (!authUser || !authSession || !authSession.access_token) return;
    if (profileBusy) return;
    setProfileBusy(true);
    try {
      const phone = (profilePhone || "").trim();
      const res = await upsertUserProfile(authSession.access_token, { user_id: authUser.id, phone: phone || null });
      if (!res.ok) {
        setStatus({ kind: "err", text: res.message || "Could not save phone." });
        return;
      }
      setStatus({ kind: "ok", text: phone ? "Phone saved." : "Phone cleared." });
      const p = await fetchUserProfile(authSession.access_token, authUser.id);
      if (p.ok && p.profile && p.profile.phone) setProfilePhone(p.profile.phone);
      if (p.ok && (!p.profile || !p.profile.phone)) setProfilePhone("");
    } catch (e) {
      setStatus({ kind: "err", text: (e && e.message) || "Could not save phone." });
    } finally {
      setProfileBusy(false);
    }
  }

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
            <a className="chip" href="#tips" onClick={(e) => (e.preventDefault(), scrollToId("tips"))}>
              Tips
            </a>
            {authUser ? (
              <a className="chip" href="#account" onClick={(e) => (e.preventDefault(), scrollToId("account"))}>
                Account
              </a>
            ) : null}
            <a className="chip" href="#contact" onClick={(e) => (e.preventDefault(), scrollToId("contact"))}>
              Contact
            </a>
            <button className="chip" type="button" onClick={() => setTheme((t) => (t === "night" ? "pastel" : "night"))}>
              {theme === "night" ? "Pastel" : "Night"}
            </button>
            {authUser ? (
              <>
                {isAdmin ? (
                  <a className="chip" href="./admin.html" title="Go to admin panel">
                    Admin
                  </a>
                ) : null}
                <button className="chip" type="button" onClick={onLogout} title={authUser.email || "Logout"}>
                  Logout
                </button>
              </>
            ) : (
              <button className="chip" type="button" onClick={() => setAuthOpen(true)} disabled={!supabaseInfo.configured}>
                Login
              </button>
            )}
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
              <img
                src={(sitePhotos.hero && sitePhotos.hero[0] && sitePhotos.hero[0].url) || "images/Pet care store interior display.png"}
                alt={(sitePhotos.hero && sitePhotos.hero[0] && sitePhotos.hero[0].title) || "Happy pet illustration"}
                style={{ width: "100%", borderRadius: "8px", marginTop: "20px" }}
              />
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
                <span className="dot pink" aria-hidden="true"></span> {servicesFromDb ? "Editable (Admin)" : "Demo data"}
              </span>
            </div>

            <div className="grid" role="list">
              {services.map((s) => (
                <div className="card" role="listitem" key={s.id || s.title}>
                  <Icon>
                    {s.icon === "grooming" ? (
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M7.5 2a2.5 2.5 0 0 0-2.45 3 5.5 5.5 0 0 0-1.05 3.25V12a5 5 0 0 0 3 4.58V20a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-3.42A5 5 0 0 0 20 12V8.25A5.5 5.5 0 0 0 18.95 5a2.5 2.5 0 1 0-4.57-2.3A6 6 0 0 0 12 2c-.9 0-1.75.2-2.5.56A2.49 2.49 0 0 0 7.5 2Zm3 2.5c.47-.18.98-.28 1.5-.28.64 0 1.25.14 1.8.4a1.1 1.1 0 0 0 1.52-.64 1.26 1.26 0 1 1 2.4.83 1.1 1.1 0 0 0 .33 1.24A3.27 3.27 0 0 1 18 8.25V12a3 3 0 0 1-1.9 2.79 1.1 1.1 0 0 0-.7 1.02V20h-6v-4.19a1.1 1.1 0 0 0-.7-1.02A3 3 0 0 1 6 12V8.25c0-.86.33-1.64.87-2.22a1.1 1.1 0 0 0 .32-1.05A1.26 1.26 0 0 1 7.5 3.2a1.26 1.26 0 0 1 1.2.86 1.1 1.1 0 0 0 1.8.44Z" />
                      </svg>
                    ) : s.icon === "medical" ? (
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M10 2a1 1 0 0 0-1 1v2H7a1 1 0 0 0-1 1v2H4a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h2v2a1 1 0 0 0 1 1h2v2a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-2h2a1 1 0 0 0 1-1v-2h2a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1h-2V6a1 1 0 0 0-1-1h-2V3a1 1 0 0 0-1-1h-4Zm1 2h2v2a1 1 0 0 0 1 1h2v2a1 1 0 0 0 1 1h2v2h-2a1 1 0 0 0-1 1v2h-2a1 1 0 0 0-1 1v2h-2v-2a1 1 0 0 0-1-1H7v-2a1 1 0 0 0-1-1H4v-2h2a1 1 0 0 0 1-1V7h2a1 1 0 0 0 1-1V4Z" />
                      </svg>
                    ) : s.icon === "training" ? (
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 2a5 5 0 0 1 5 5c0 2.24-1.48 4.14-3.52 4.76L14 20a2 2 0 0 1-2 2h0a2 2 0 0 1-2-2l.52-8.24A5.01 5.01 0 0 1 7 7a5 5 0 0 1 5-5Zm0 2a3 3 0 0 0-3 3c0 1.21.72 2.24 1.76 2.72a1.1 1.1 0 0 1 .64 1.08L12 20h0l.6-9.2a1.1 1.1 0 0 1 .64-1.08A3 3 0 0 0 15 7a3 3 0 0 0-3-3Z" />
                      </svg>
                    ) : (
                      <PawIcon />
                    )}
                  </Icon>
                  <h3>{s.title}</h3>
                  <p>{s.description || s.desc}</p>
                </div>
              ))}
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
              <div className="full search-row">
                <label style={{ display: "grid", gap: 6 }}>
                  Quick search
                  <input
                    value={productQuery}
                    onChange={(e) => setProductQuery(e.target.value)}
                    placeholder="Search brush, balm, collar…"
                  />
                </label>
                <span className="notice">{filteredProducts.length} items</span>
              </div>

              {filteredProducts.map((p, index) => {
                const fallback = ["images/p4.png", "images/p5.png", "images/p6.png"];
                const urls =
                  sitePhotos.products && Array.isArray(sitePhotos.products) && sitePhotos.products.length
                    ? sitePhotos.products.map((x) => x.url).filter(Boolean)
                    : fallback;
                return (
                  <div className="card" role="listitem" key={p.name}>
                    <Icon>
                      <PawIcon />
                    </Icon>
                    <img
                      src={urls[index % urls.length]}
                      alt={`${p.name} product image`}
                      style={{ width: "100%", borderRadius: "8px", marginBottom: "10px" }}
                    />
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

        <section className="section" id="tips">
          <div className="container">
            <div className="section-header">
              <h2 className="h2">
                Pet Care Tips
                <small>Small habits that make pets happier.</small>
              </h2>
              <span className="pill">
                <span className="dot" aria-hidden="true"></span> Shareable
              </span>
            </div>

            <div className="panel form">
              <div className="mini-card">
                <p className="mini-title">
                  {tips[tipIndex].title} <span className="tag">Today</span>
                </p>
                <p className="mini-desc">{tips[tipIndex].text}</p>
                <div className="cta-row" style={{ marginTop: 10 }}>
                  <button className="btn primary" type="button" onClick={() => setTipIndex((i) => (i + 1) % tips.length)}>
                    Next tip
                  </button>
                  <button className="btn" type="button" onClick={() => setTipIndex(Math.floor(Math.random() * tips.length))}>
                    Surprise me
                  </button>
                  <button className="btn" type="button" onClick={copyTip}>
                    Copy
                  </button>
                </div>
              </div>
              <p className="notice">Use this section during client demo to show “value content” beyond products.</p>
            </div>
          </div>
        </section>

        {authUser ? (
          <section className="section" id="account">
            <div className="container">
              <div className="section-header">
                <h2 className="h2">
                  My Account
                  <small>Optional phone + your recent session history.</small>
                </h2>
                <span className="pill">
                  <span className="dot" aria-hidden="true"></span> Signed in
                </span>
              </div>

              <div className="split">
                <div className="panel form">
                  <div className="mini-card">
                    <p className="mini-title">
                      Profile <span className="tag">{isAdmin ? "Admin" : "User"}</span>
                    </p>
                    <p className="mini-desc">
                      Email: <b>{authUser.email || "unknown"}</b>
                    </p>
                  </div>

                  <div className="mini-card" style={{ marginTop: 12 }}>
                    <p className="mini-title">
                      Phone <span className="tag sky">Optional</span>
                    </p>
                    <label className="full">
                      Phone number
                      <input
                        value={profilePhone}
                        onChange={(e) => setProfilePhone(e.target.value)}
                        placeholder="e.g., +91 98xxxxxx"
                        inputMode="tel"
                        autoComplete="tel"
                      />
                    </label>
                    <div className="cta-row" style={{ marginTop: 10 }}>
                      <button className="btn primary" type="button" onClick={onSavePhone} disabled={profileBusy}>
                        {profileBusy ? "Saving…" : "Save phone"}
                      </button>
                      <span className="notice">Stored in Supabase table: <code>public.user_profiles</code></span>
                    </div>
                  </div>
                </div>

                <div className="panel form">
                  <div className="mini-card">
                    <p className="mini-title">
                      Session history <span className="tag">Latest</span>
                    </p>
                    {events && events.length ? (
                      <div className="admin-table-wrap" style={{ marginTop: 10 }}>
                        <table className="admin-table" style={{ minWidth: 560 }}>
                          <thead>
                            <tr>
                              <th style={{ width: 140 }}>When</th>
                              <th style={{ width: 90 }}>Event</th>
                              <th style={{ width: 90 }}>Role</th>
                              <th>Timezone</th>
                            </tr>
                          </thead>
                          <tbody>
                            {events.map((ev) => (
                              <tr key={ev.id}>
                                <td>{ev.created_at ? new Date(ev.created_at).toLocaleString() : "-"}</td>
                                <td>{ev.event_type}</td>
                                <td>{ev.is_admin ? "admin" : "user"}</td>
                                <td>{ev.tz || "-"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="notice" style={{ marginTop: 10 }}>
                        No events yet. Sign out/in once to populate history.
                      </p>
                    )}
                    <p className="notice">
                      Stored in Supabase table: <code>public.user_session_events</code>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : null}

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

      {authOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Admin login">
          <div className="modal panel">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <div>
                <div className="kicker" style={{ marginBottom: 10 }}>
                  <PawIcon style={{ width: 16, height: 16, fill: "currentColor" }} />
                  Account
                </div>
                <h2 className="h2" style={{ margin: 0 }}>
                  {authMode === "signup" ? "Create account" : "Sign in"}
                  <small>Admins get redirected to `admin.html` automatically.</small>
                </h2>
              </div>
              <button className="chip" type="button" onClick={() => setAuthOpen(false)}>
                Close
              </button>
            </div>

            {!!authToast.text ? (
              <div className={`toast ${authToast.kind === "ok" ? "ok" : "err"}`} style={{ marginTop: 12 }}>
                {authToast.text}
              </div>
            ) : null}

            <form onSubmit={onAuthSubmit} style={{ marginTop: 10 }}>
              <div className="form-grid">
                <label>
                  Email
                  <input value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} autoComplete="email" />
                </label>
                <label>
                  Password
                  <input
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    type="password"
                    autoComplete="current-password"
                  />
                </label>
                {authMode === "signup" ? (
                  <label className="full">
                    Confirm password
                    <input
                      value={authPassword2}
                      onChange={(e) => setAuthPassword2(e.target.value)}
                      type="password"
                      autoComplete="new-password"
                    />
                  </label>
                ) : null}
                {authMode === "signup" ? (
                  <label className="full">
                    Phone (optional)
                    <input
                      value={authPhone}
                      onChange={(e) => setAuthPhone(e.target.value)}
                      placeholder="e.g., +91 98xxxxxx"
                      autoComplete="tel"
                      inputMode="tel"
                    />
                  </label>
                ) : null}
              </div>
              <div className="cta-row" style={{ marginTop: 12 }}>
                <button className="btn primary" type="submit" disabled={authBusy}>
                  {authBusy ? "Please wait…" : authMode === "signup" ? "Create account" : "Sign in"}
                </button>
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    setAuthMode((m) => (m === "login" ? "signup" : "login"));
                    setAuthPassword("");
                    setAuthPassword2("");
                    setAuthPhone("");
                    setAuthToast({ kind: "idle", text: "" });
                  }}
                >
                  {authMode === "login" ? "Create account" : "I already have an account"}
                </button>
                <span className="notice">
                  {supabaseInfo.configured
                    ? "Make sure Email/Password sign-in is enabled in Supabase Auth."
                    : "Set Supabase keys in config.local.js first."}
                </span>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <div className="fab-stack" aria-label="Quick actions">
        <a
          className="fab"
          href="https://wa.me/919800000000"
          target="_blank"
          rel="noreferrer"
          title="WhatsApp (demo)"
          aria-label="WhatsApp (demo)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2a10 10 0 0 0-8.6 15.08L2 22l5.06-1.33A10 10 0 1 0 12 2Zm0 2a8 8 0 0 1 0 16c-1.26 0-2.46-.3-3.54-.86l-.38-.2-2.99.78.8-2.9-.22-.39A7.96 7.96 0 0 1 4 12a8 8 0 0 1 8-8Zm-3.4 4.7c-.18 0-.46.06-.7.33-.23.27-.9.88-.9 2.15s.93 2.5 1.06 2.67c.13.18 1.8 2.9 4.45 3.95 2.2.87 2.65.7 3.13.66.48-.04 1.56-.64 1.78-1.26.22-.62.22-1.16.15-1.27-.06-.11-.24-.18-.5-.31-.27-.13-1.56-.77-1.8-.86-.24-.09-.42-.13-.6.13-.18.27-.68.86-.84 1.04-.15.18-.3.2-.57.07-.27-.13-1.12-.41-2.13-1.3-.79-.7-1.33-1.56-1.49-1.82-.15-.27-.02-.41.12-.55.12-.12.27-.3.4-.46.13-.15.18-.27.27-.44.09-.18.04-.33-.02-.46-.07-.13-.6-1.46-.82-2-.22-.53-.44-.46-.6-.47Z" />
          </svg>
        </a>
        <button className="fab" type="button" onClick={() => scrollToId("top")} title="Back to top" aria-label="Back to top">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5.83 5.4 12.42a1 1 0 1 1-1.4-1.42l7.3-7.3a1 1 0 0 1 1.4 0l7.3 7.3a1 1 0 0 1-1.4 1.42L12 5.83Z" />
            <path d="M12 10.83 5.4 17.42a1 1 0 1 1-1.4-1.42l7.3-7.3a1 1 0 0 1 1.4 0l7.3 7.3a1 1 0 0 1-1.4 1.42L12 10.83Z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
