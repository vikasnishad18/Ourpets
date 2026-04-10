const { useEffect, useMemo, useRef, useState } = React;

function PawIcon(props) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" {...props}>
      <path d="M23 27c-4 0-7-3-7-7s3-8 7-8 7 4 7 8-3 7-7 7Zm18 0c-4 0-7-3-7-7s3-8 7-8 7 4 7 8-3 7-7 7ZM16 45c-4 0-7-3-7-7s3-8 7-8 7 4 7 8-3 7-7 7Zm32 0c-4 0-7-3-7-7s3-8 7-8 7 4 7 8-3 7-7 7ZM32 56c-10 0-18-6-18-13 0-9 8-16 18-16s18 7 18 16c0 7-8 13-18 13Z" />
    </svg>
  );
}

function buildSupabaseRestConfig() {
  const url = (window.OURPETS_SUPABASE_URL || "https://sbiwiyfashlmmxokhjlp.supabase.co").trim();
  const anonKey = (window.OURPETS_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNiaXdpeWZhc2hsbW14b2toamxwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MjQ0NTMsImV4cCI6MjA5MTMwMDQ1M30.VB4YV-7O7hPb22ehqe3oYo_3JbWL1kW1mKJH4_mes5Y").trim();
  return { url, anonKey };
}

function getHost(url) {
  if (!url) return "";
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

const STORAGE_KEY = "ourpets_admin_session_v1";

function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.access_token || !parsed.user) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveSession(session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

async function authPasswordLogin(email, password) {
  const { url, anonKey } = buildSupabaseRestConfig();
  if (!url || !anonKey) {
    return { ok: false, message: "Supabase keys are missing. Set them in index.html/admin.html or config.local.js." };
  }

  const normalizedUrl = url.replace(/\/$/, "");
  const endpoint = `${normalizedUrl}/auth/v1/token?grant_type=password`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  const bodyText = await res.text();
  let data = null;
  try {
    data = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const msg = (data && (data.error_description || data.msg || data.message)) || bodyText || "Login failed.";
    return { ok: false, message: msg };
  }

  // data contains: access_token, refresh_token, expires_in, token_type, user
  if (!data || !data.access_token || !data.user) return { ok: false, message: "Unexpected login response." };
  return { ok: true, session: data };
}

async function authGetUser(accessToken) {
  const { url, anonKey } = buildSupabaseRestConfig();
  const normalizedUrl = url.replace(/\/$/, "");
  const endpoint = `${normalizedUrl}/auth/v1/user`;

  const res = await fetch(endpoint, {
    method: "GET",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) return { ok: false, user: null };
  const user = await res.json();
  return { ok: true, user };
}

async function checkIsAdmin(userId, accessToken) {
  const { url, anonKey } = buildSupabaseRestConfig();
  const normalizedUrl = url.replace(/\/$/, "");
  const endpoint = `${normalizedUrl}/rest/v1/admin_users?select=user_id&user_id=eq.${encodeURIComponent(userId)}&limit=1`;

  const res = await fetch(endpoint, {
    method: "GET",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) return { ok: false, isAdmin: false };
  const rows = await res.json();
  return { ok: true, isAdmin: Array.isArray(rows) && rows.length > 0 };
}

async function fetchAllServices(accessToken) {
  const { url, anonKey } = buildSupabaseRestConfig();
  const normalizedUrl = url.replace(/\/$/, "");
  const endpoint = `${normalizedUrl}/rest/v1/services?select=id,title,description,icon,is_active,sort_order,updated_at&order=sort_order.asc`;

  const res = await fetch(endpoint, {
    method: "GET",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const t = await res.text();
    return { ok: false, services: [], message: t || "Could not load services." };
  }
  const rows = await res.json();
  return { ok: true, services: Array.isArray(rows) ? rows : [] };
}

async function createService(row, accessToken) {
  const { url, anonKey } = buildSupabaseRestConfig();
  const normalizedUrl = url.replace(/\/$/, "");
  const endpoint = `${normalizedUrl}/rest/v1/services`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(row),
  });

  const t = await res.text();
  let data = null;
  try {
    data = t ? JSON.parse(t) : null;
  } catch {
    data = null;
  }

  if (!res.ok) return { ok: false, message: t || "Create failed." };
  return { ok: true, created: Array.isArray(data) && data[0] ? data[0] : null };
}

async function updateService(id, patch, accessToken) {
  const { url, anonKey } = buildSupabaseRestConfig();
  const normalizedUrl = url.replace(/\/$/, "");
  const endpoint = `${normalizedUrl}/rest/v1/services?id=eq.${encodeURIComponent(id)}`;

  const res = await fetch(endpoint, {
    method: "PATCH",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(patch),
  });

  if (!res.ok) {
    const t = await res.text();
    return { ok: false, message: t || "Update failed." };
  }
  return { ok: true };
}

async function deleteService(id, accessToken) {
  const { url, anonKey } = buildSupabaseRestConfig();
  const normalizedUrl = url.replace(/\/$/, "");
  const endpoint = `${normalizedUrl}/rest/v1/services?id=eq.${encodeURIComponent(id)}`;

  const res = await fetch(endpoint, {
    method: "DELETE",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      Prefer: "return=minimal",
    },
  });

  if (!res.ok) {
    const t = await res.text();
    return { ok: false, message: t || "Delete failed." };
  }
  return { ok: true };
}

function AdminApp() {
  const { url, anonKey } = buildSupabaseRestConfig();
  const host = useMemo(() => getHost(url), [url]);
  const configured = !!url && !!anonKey;

  const [mode, setMode] = useState("loading"); // loading | login | not_admin | app
  const [session, setSession] = useState(() => loadSession());
  const [user, setUser] = useState(null);
  const [services, setServices] = useState([]);
  const [toast, setToast] = useState({ kind: "idle", text: "" });
  const [busy, setBusy] = useState(false);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const lastActionAt = useRef(0);

  async function bootstrap(existingSession) {
    if (!configured) {
      setMode("login");
      setToast({ kind: "err", text: "Supabase is not configured. Add keys in config.local.js or admin.html." });
      return;
    }

    if (!existingSession || !existingSession.access_token || !existingSession.user) {
      setMode("login");
      return;
    }

    setBusy(true);
    setToast({ kind: "idle", text: "" });
    try {
      const who = await authGetUser(existingSession.access_token);
      if (!who.ok || !who.user) {
        clearSession();
        setSession(null);
        setMode("login");
        return;
      }

      setUser(who.user);
      const adminCheck = await checkIsAdmin(who.user.id, existingSession.access_token);
      if (!adminCheck.ok || !adminCheck.isAdmin) {
        setMode("not_admin");
        return;
      }

      const s = await fetchAllServices(existingSession.access_token);
      if (!s.ok) {
        setToast({ kind: "err", text: s.message || "Could not load services." });
        setServices([]);
      } else {
        setServices(s.services);
      }

      setMode("app");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    bootstrap(session);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function rateLimit() {
    const now = Date.now();
    if (now - lastActionAt.current < 650) return true;
    lastActionAt.current = now;
    return false;
  }

  async function onLogin(e) {
    e.preventDefault();
    if (busy || rateLimit()) return;
    setBusy(true);
    setToast({ kind: "idle", text: "" });
    try {
      const result = await authPasswordLogin(loginEmail.trim(), loginPassword);
      if (!result.ok) {
        setToast({ kind: "err", text: result.message });
        return;
      }
      saveSession(result.session);
      setSession(result.session);
      await bootstrap(result.session);
    } catch (err) {
      const msg = err && err.message ? err.message : "Login failed.";
      setToast({ kind: "err", text: msg });
    } finally {
      setBusy(false);
    }
  }

  function onLogout() {
    clearSession();
    setSession(null);
    setUser(null);
    setServices([]);
    setMode("login");
    setToast({ kind: "ok", text: "Logged out." });
  }

  async function onReload() {
    if (!session) return;
    setBusy(true);
    setToast({ kind: "idle", text: "" });
    try {
      const s = await fetchAllServices(session.access_token);
      if (!s.ok) {
        setToast({ kind: "err", text: s.message || "Could not load services." });
        return;
      }
      setServices(s.services);
      setToast({ kind: "ok", text: "Services refreshed." });
    } finally {
      setBusy(false);
    }
  }

  function updateLocalService(id, key, value) {
    setServices((rows) =>
      rows.map((r) => {
        if (String(r.id) !== String(id)) return r;
        return { ...r, [key]: value };
      })
    );
  }

  async function onSaveService(id) {
    if (!session || busy || rateLimit()) return;
    const row = services.find((r) => String(r.id) === String(id));
    if (!row) return;
    if (!row.title || !row.description) {
      setToast({ kind: "err", text: "Title and description are required." });
      return;
    }

    setBusy(true);
    setToast({ kind: "idle", text: "" });
    try {
      const patch = {
        title: row.title,
        description: row.description,
        icon: row.icon || "paw",
        is_active: !!row.is_active,
        sort_order: Number(row.sort_order || 100),
      };
      const res = await updateService(row.id, patch, session.access_token);
      if (!res.ok) {
        setToast({ kind: "err", text: res.message });
        return;
      }
      setToast({ kind: "ok", text: "Saved." });
      await onReload();
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteService(id) {
    if (!session || busy || rateLimit()) return;
    const ok = window.confirm("Delete this service?");
    if (!ok) return;

    setBusy(true);
    setToast({ kind: "idle", text: "" });
    try {
      const res = await deleteService(id, session.access_token);
      if (!res.ok) {
        setToast({ kind: "err", text: res.message });
        return;
      }
      setToast({ kind: "ok", text: "Deleted." });
      await onReload();
    } finally {
      setBusy(false);
    }
  }

  async function onAddService() {
    if (!session || busy || rateLimit()) return;
    setBusy(true);
    setToast({ kind: "idle", text: "" });
    try {
      const maxOrder = services.reduce((m, r) => Math.max(m, Number(r.sort_order || 0)), 0);
      const row = {
        title: "New Service",
        description: "Describe the service in a friendly sentence.",
        icon: "paw",
        is_active: true,
        sort_order: maxOrder + 10,
      };
      const res = await createService(row, session.access_token);
      if (!res.ok) {
        setToast({ kind: "err", text: res.message });
        return;
      }
      setToast({ kind: "ok", text: "Created." });
      await onReload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <header className="topbar">
        <div className="container topbar-inner">
          <a className="brand" href="./index.html">
            <span className="brand-mark" aria-hidden="true">
              <PawIcon />
            </span>
            <span>Ourpets • Admin</span>
          </a>
          <nav className="nav" aria-label="Admin">
            <span className="chip" title="Connected project">
              {host || "(no url)"} {configured ? "" : " (not configured)"}
            </span>
            {mode === "app" ? (
              <>
                <button className="chip" onClick={onReload} disabled={busy}>
                  Reload
                </button>
                <button className="chip primary" onClick={onAddService} disabled={busy}>
                  Add Service
                </button>
                <button className="chip" onClick={onLogout} disabled={busy}>
                  Logout
                </button>
              </>
            ) : (
              <a className="chip" href="./index.html">
                Back
              </a>
            )}
          </nav>
        </div>
      </header>

      <main className="section">
        <div className="container">
          <div className="panel form">
            <h2 className="h2" style={{ marginBottom: 8 }}>
              Services Admin
              <small>Edit what shows on the public homepage.</small>
            </h2>

            {!!toast.text && <div className={`toast ${toast.kind === "ok" ? "ok" : "err"}`}>{toast.text}</div>}

            {mode === "loading" && <p className="notice">Loading…</p>}

            {mode === "login" && (
              <form onSubmit={onLogin}>
                <div className="form-grid">
                  <label>
                    Admin email
                    <input value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} autoComplete="email" />
                  </label>
                  <label>
                    Password
                    <input
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      type="password"
                      autoComplete="current-password"
                    />
                  </label>
                </div>
                <div className="cta-row" style={{ marginTop: 12 }}>
                  <button className="btn primary" type="submit" disabled={busy}>
                    {busy ? "Signing in…" : "Sign in"}
                  </button>
                  <span className="notice">
                    Admin access is controlled by the <code>admin_users</code> table.
                  </span>
                </div>
              </form>
            )}

            {mode === "not_admin" && (
              <div>
                <div className="toast err">
                  Signed in as <b>{user && user.email ? user.email : "unknown"}</b>, but this user is not an admin.
                </div>
                <div className="cta-row" style={{ marginTop: 12 }}>
                  <button className="btn" onClick={onLogout}>
                    Logout
                  </button>
                </div>
              </div>
            )}

            {mode === "app" && (
              <div className="admin-table-wrap" style={{ marginTop: 10 }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th style={{ width: "22%" }}>Title</th>
                      <th>Description</th>
                      <th style={{ width: 120 }}>Icon</th>
                      <th style={{ width: 92 }}>Active</th>
                      <th style={{ width: 92 }}>Order</th>
                      <th style={{ width: 190 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {services.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <input
                            value={s.title || ""}
                            onChange={(e) => updateLocalService(s.id, "title", e.target.value)}
                          />
                        </td>
                        <td>
                          <textarea
                            value={s.description || ""}
                            onChange={(e) => updateLocalService(s.id, "description", e.target.value)}
                          />
                        </td>
                        <td>
                          <select value={s.icon || "paw"} onChange={(e) => updateLocalService(s.id, "icon", e.target.value)}>
                            <option value="paw">paw</option>
                            <option value="grooming">grooming</option>
                            <option value="medical">medical</option>
                            <option value="training">training</option>
                          </select>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={!!s.is_active}
                            onChange={(e) => updateLocalService(s.id, "is_active", e.target.checked)}
                          />
                        </td>
                        <td>
                          <input
                            inputMode="numeric"
                            value={String(s.sort_order == null ? "" : s.sort_order)}
                            onChange={(e) => updateLocalService(s.id, "sort_order", e.target.value)}
                          />
                        </td>
                        <td>
                          <div className="admin-actions">
                            <button className="btn primary" type="button" onClick={() => onSaveService(s.id)} disabled={busy}>
                              Save
                            </button>
                            <button className="btn danger" type="button" onClick={() => onDeleteService(s.id)} disabled={busy}>
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="notice">
                  Tip: Open <a href="./index.html">the homepage</a> in another tab and refresh after edits.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<AdminApp />);

