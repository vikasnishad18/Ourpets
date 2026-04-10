const { useEffect, useMemo, useRef, useState } = React;

function PawIcon(props) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" {...props}>
      <path d="M23 27c-4 0-7-3-7-7s3-8 7-8 7 4 7 8-3 7-7 7Zm18 0c-4 0-7-3-7-7s3-8 7-8 7 4 7 8-3 7-7 7ZM16 45c-4 0-7-3-7-7s3-8 7-8 7 4 7 8-3 7-7 7Zm32 0c-4 0-7-3-7-7s3-8 7-8 7 4 7 8-3 7-7 7ZM32 56c-10 0-18-6-18-13 0-9 8-16 18-16s18 7 18 16c0 7-8 13-18 13Z" />
    </svg>
  );
}

function buildSupabaseRestConfig() {
  const url = (window.OURPETS_SUPABASE_URL || "").trim();
  const anonKey = (window.OURPETS_SUPABASE_ANON_KEY || "").trim();
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
      Authorization: `Bearer ${anonKey}`,
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

function parseContentRange(value) {
  // example: "0-19/123"
  if (!value) return { total: null };
  const m = String(value).match(/(\d+)\s*-\s*(\d+)\s*\/\s*(\d+|\*)/);
  if (!m) return { total: null };
  const total = m[3] === "*" ? null : Number(m[3]);
  return { total: Number.isFinite(total) ? total : null };
}

function toIsoDayEnd(dateStr) {
  // dateStr: YYYY-MM-DD
  if (!dateStr) return "";
  return `${dateStr}T23:59:59.999Z`;
}

function buildQuery(params) {
  const parts = [];
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === "") continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

async function supabaseRest(pathWithQuery, accessToken, options) {
  const { url, anonKey } = buildSupabaseRestConfig();
  if (!url || !anonKey) throw new Error("Supabase is not configured. Add keys in config.local.js or admin.html.");
  const normalizedUrl = url.replace(/\/$/, "");
  const endpoint = `${normalizedUrl}${pathWithQuery.startsWith("/") ? "" : "/"}${pathWithQuery}`;

  const headers = Object.assign(
    {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
    options && options.headers ? options.headers : {}
  );

  const res = await fetch(endpoint, Object.assign({}, options, { headers }));
  return res;
}

async function fetchInquiries(accessToken, input) {
  const pageSize = input.pageSize || 20;
  const offset = (input.page || 0) * pageSize;
  const order = `${input.sort || "created_at"}.${input.dir || "desc"}`;

  const params = {
    select: "id,created_at,full_name,phone,email,pet_type,service,preferred_date,message,source",
    order,
    limit: pageSize,
    offset,
  };

  if (input.from) params.created_at = `gte.${input.from}`;
  if (input.to) params.created_at = `lte.${toIsoDayEnd(input.to)}`;
  if (input.service) params.service = `eq.${input.service}`;
  if (input.pet_type) params.pet_type = `eq.${input.pet_type}`;

  const q = (input.q || "").trim();
  if (q) {
    const expr = `(full_name.ilike.*${q}*,email.ilike.*${q}*,phone.ilike.*${q}*,service.ilike.*${q}*)`;
    params.or = expr;
  }

  const res = await supabaseRest(`/rest/v1/inquiries${buildQuery(params)}`, accessToken, {
    method: "GET",
    headers: { Prefer: "count=exact" },
  });

  const range = parseContentRange(res.headers.get("content-range"));
  const t = await res.text();
  if (!res.ok) return { ok: false, rows: [], total: range.total, message: t || "Could not load inquiries." };
  let rows = [];
  try {
    rows = t ? JSON.parse(t) : [];
  } catch {
    rows = [];
  }
  return { ok: true, rows: Array.isArray(rows) ? rows : [], total: range.total };
}

async function fetchUserProfiles(accessToken, input) {
  const pageSize = input.pageSize || 20;
  const offset = (input.page || 0) * pageSize;
  const order = `${input.sort || "updated_at"}.${input.dir || "desc"}`;

  const params = {
    select: "user_id,phone,created_at,updated_at",
    order,
    limit: pageSize,
    offset,
  };

  const q = (input.q || "").trim();
  if (q) {
    // uuid needs exact match via REST
    if (/^[0-9a-fA-F-]{32,36}$/.test(q)) params.user_id = `eq.${q}`;
    else params.phone = `ilike.*${q}*`;
  }
  if (input.has_phone === "yes") params.phone = "not.is.null";
  if (input.has_phone === "no") params.phone = "is.null";

  const res = await supabaseRest(`/rest/v1/user_profiles${buildQuery(params)}`, accessToken, {
    method: "GET",
    headers: { Prefer: "count=exact" },
  });

  const range = parseContentRange(res.headers.get("content-range"));
  const t = await res.text();
  if (!res.ok) return { ok: false, rows: [], total: range.total, message: t || "Could not load user profiles." };
  let rows = [];
  try {
    rows = t ? JSON.parse(t) : [];
  } catch {
    rows = [];
  }
  return { ok: true, rows: Array.isArray(rows) ? rows : [], total: range.total };
}

async function fetchSessionEvents(accessToken, input) {
  const pageSize = input.pageSize || 20;
  const offset = (input.page || 0) * pageSize;
  const order = `${input.sort || "created_at"}.${input.dir || "desc"}`;

  const params = {
    select: "id,created_at,user_id,event_type,is_admin,tz,user_agent",
    order,
    limit: pageSize,
    offset,
  };

  if (input.from) params.created_at = `gte.${input.from}`;
  if (input.to) params.created_at = `lte.${toIsoDayEnd(input.to)}`;
  if (input.event_type) params.event_type = `eq.${input.event_type}`;
  if (input.role === "admin") params.is_admin = "eq.true";
  if (input.role === "user") params.is_admin = "eq.false";

  const q = (input.user_id || "").trim();
  if (q && /^[0-9a-fA-F-]{32,36}$/.test(q)) params.user_id = `eq.${q}`;

  const res = await supabaseRest(`/rest/v1/user_session_events${buildQuery(params)}`, accessToken, {
    method: "GET",
    headers: { Prefer: "count=exact" },
  });

  const range = parseContentRange(res.headers.get("content-range"));
  const t = await res.text();
  if (!res.ok) return { ok: false, rows: [], total: range.total, message: t || "Could not load session events." };
  let rows = [];
  try {
    rows = t ? JSON.parse(t) : [];
  } catch {
    rows = [];
  }
  return { ok: true, rows: Array.isArray(rows) ? rows : [], total: range.total };
}

function downloadCsv(filename, rows, columns) {
  const cols = columns && columns.length ? columns : rows.length ? Object.keys(rows[0]) : [];
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    const needs = /[\",\n]/.test(s);
    const out = s.replace(/\"/g, "\"\"");
    return needs ? `"${out}"` : out;
  };
  const lines = [];
  lines.push(cols.map(esc).join(","));
  for (const r of rows) lines.push(cols.map((c) => esc(r[c])).join(","));
  const csv = lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
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
  const [activeTab, setActiveTab] = useState("services"); // services | inquiries | users | sessions

  const [inq, setInq] = useState({ rows: [], total: null, loading: false, page: 0, pageSize: 20 });
  const [inqFilters, setInqFilters] = useState({ q: "", service: "", pet_type: "", from: "", to: "", dir: "desc" });

  const [users, setUsers] = useState({ rows: [], total: null, loading: false, page: 0, pageSize: 20 });
  const [userFilters, setUserFilters] = useState({ q: "", has_phone: "", dir: "desc" });

  const [sessions, setSessions] = useState({ rows: [], total: null, loading: false, page: 0, pageSize: 20 });
  const [sessionFilters, setSessionFilters] = useState({ user_id: "", event_type: "", role: "", from: "", to: "", dir: "desc" });

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

      setActiveTab("services");
      setMode("app");
    } finally {
      setBusy(false);
    }
  }

  async function loadInquiries(next) {
    if (!session) return;
    setInq((s) => ({ ...s, loading: true }));
    try {
      const res = await fetchInquiries(session.access_token, Object.assign({}, inqFilters, next));
      if (!res.ok) {
        setToast({ kind: "err", text: res.message || "Could not load inquiries." });
        setInq((s) => ({ ...s, rows: [], total: res.total || null, loading: false }));
        return;
      }
      setInq((s) => ({
        ...s,
        rows: res.rows,
        total: res.total,
        page: next && typeof next.page === "number" ? next.page : s.page,
        loading: false,
      }));
    } finally {
      setInq((s) => ({ ...s, loading: false }));
    }
  }

  async function loadUsers(next) {
    if (!session) return;
    setUsers((s) => ({ ...s, loading: true }));
    try {
      const res = await fetchUserProfiles(session.access_token, Object.assign({}, userFilters, next));
      if (!res.ok) {
        setToast({ kind: "err", text: res.message || "Could not load users." });
        setUsers((s) => ({ ...s, rows: [], total: res.total || null, loading: false }));
        return;
      }
      setUsers((s) => ({
        ...s,
        rows: res.rows,
        total: res.total,
        page: next && typeof next.page === "number" ? next.page : s.page,
        loading: false,
      }));
    } finally {
      setUsers((s) => ({ ...s, loading: false }));
    }
  }

  async function loadSessions(next) {
    if (!session) return;
    setSessions((s) => ({ ...s, loading: true }));
    try {
      const res = await fetchSessionEvents(session.access_token, Object.assign({}, sessionFilters, next));
      if (!res.ok) {
        setToast({ kind: "err", text: res.message || "Could not load sessions." });
        setSessions((s) => ({ ...s, rows: [], total: res.total || null, loading: false }));
        return;
      }
      setSessions((s) => ({
        ...s,
        rows: res.rows,
        total: res.total,
        page: next && typeof next.page === "number" ? next.page : s.page,
        loading: false,
      }));
    } finally {
      setSessions((s) => ({ ...s, loading: false }));
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
    setActiveTab("services");
    setInq({ rows: [], total: null, loading: false, page: 0, pageSize: 20 });
    setUsers({ rows: [], total: null, loading: false, page: 0, pageSize: 20 });
    setSessions({ rows: [], total: null, loading: false, page: 0, pageSize: 20 });
    setMode("login");
    setToast({ kind: "ok", text: "Logged out." });
  }

  async function onReload() {
    if (!session) return;
    if (activeTab === "services") {
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
      return;
    }
    if (activeTab === "inquiries") await loadInquiries({ page: inq.page, pageSize: inq.pageSize });
    if (activeTab === "users") await loadUsers({ page: users.page, pageSize: users.pageSize });
    if (activeTab === "sessions") await loadSessions({ page: sessions.page, pageSize: sessions.pageSize });
  }

  function onExportCsv() {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    if (activeTab === "inquiries") downloadCsv(`ourpets-inquiries-${stamp}.csv`, inq.rows, [
      "created_at",
      "full_name",
      "phone",
      "email",
      "pet_type",
      "service",
      "preferred_date",
      "message",
      "source",
    ]);
    if (activeTab === "users") downloadCsv(`ourpets-users-${stamp}.csv`, users.rows, ["user_id", "phone", "created_at", "updated_at"]);
    if (activeTab === "sessions") downloadCsv(`ourpets-sessions-${stamp}.csv`, sessions.rows, [
      "created_at",
      "user_id",
      "event_type",
      "is_admin",
      "tz",
      "user_agent",
    ]);
  }

  useEffect(() => {
    if (mode !== "app") return;
    if (!session) return;
    if (activeTab === "inquiries" && !inq.rows.length) loadInquiries({ page: 0, pageSize: inq.pageSize });
    if (activeTab === "users" && !users.rows.length) loadUsers({ page: 0, pageSize: users.pageSize });
    if (activeTab === "sessions" && !sessions.rows.length) loadSessions({ page: 0, pageSize: sessions.pageSize });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, mode]);

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

