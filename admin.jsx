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
const STORAGE_BUCKET_ID = "ourpets";

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

function formatShortDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

function encodeUrlPath(path) {
  return String(path)
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

function buildPublicStorageUrl(projectUrl, bucketId, objectPath) {
  const normalizedUrl = String(projectUrl || "").replace(/\/$/, "");
  const enc = encodeUrlPath(objectPath);
  return `${normalizedUrl}/storage/v1/object/public/${encodeURIComponent(bucketId)}/${enc}`;
}

async function uploadStorageObject(accessToken, file, objectPath) {
  const { url, anonKey } = buildSupabaseRestConfig();
  if (!url || !anonKey) return { ok: false, publicUrl: "", message: "Supabase is not configured." };
  if (!file) return { ok: false, publicUrl: "", message: "Choose a file to upload." };

  const normalizedUrl = url.replace(/\/$/, "");
  const safeObjectPath = encodeUrlPath(objectPath);
  const endpoint = `${normalizedUrl}/storage/v1/object/${encodeURIComponent(STORAGE_BUCKET_ID)}/${safeObjectPath}`;

  const headersBase = {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": file.type || "application/octet-stream",
    "x-upsert": "true",
  };

  // Supabase Storage accepts upload via POST (and some deployments accept PUT). Try POST then PUT.
  let res = await fetch(endpoint, { method: "POST", headers: headersBase, body: file });
  if (!res.ok && res.status === 405) {
    res = await fetch(endpoint, { method: "PUT", headers: headersBase, body: file });
  }
  if (!res.ok) return { ok: false, publicUrl: "", message: await res.text() };

  const publicUrl = buildPublicStorageUrl(url, STORAGE_BUCKET_ID, objectPath);
  return { ok: true, publicUrl };
}

async function fetchSitePhotos(accessToken, input) {
  const pageSize = input.pageSize || 20;
  const offset = (input.page || 0) * pageSize;
  const order = `${input.sort || "section"}.asc,sort_order.${input.dir || "asc"},created_at.desc`;

  const params = {
    select: "id,created_at,updated_at,section,title,url,is_active,sort_order",
    order,
    limit: pageSize,
    offset,
  };

  const q = (input.q || "").trim();
  if (q) params.or = `(title.ilike.*${q}*,url.ilike.*${q}*,section.ilike.*${q}*)`;
  if (input.section) params.section = `eq.${input.section}`;
  if (input.active === "yes") params.is_active = "eq.true";
  if (input.active === "no") params.is_active = "eq.false";

  const res = await supabaseRest(`/rest/v1/site_photos${buildQuery(params)}`, accessToken, {
    method: "GET",
    headers: { Prefer: "count=exact" },
  });
  const range = parseContentRange(res.headers.get("content-range"));
  const t = await res.text();
  if (!res.ok) return { ok: false, rows: [], total: range.total, message: t || "Could not load photos." };
  let rows = [];
  try {
    rows = t ? JSON.parse(t) : [];
  } catch {
    rows = [];
  }
  return { ok: true, rows: Array.isArray(rows) ? rows : [], total: range.total };
}

async function createSitePhoto(row, accessToken) {
  const res = await supabaseRest("/rest/v1/site_photos", accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  const t = await res.text();
  if (!res.ok) return { ok: false, message: t || "Create failed." };
  let data = null;
  try {
    data = t ? JSON.parse(t) : null;
  } catch {
    data = null;
  }
  return { ok: true, created: Array.isArray(data) && data[0] ? data[0] : null };
}

async function updateSitePhoto(id, patch, accessToken) {
  const res = await supabaseRest(`/rest/v1/site_photos?id=eq.${encodeURIComponent(id)}`, accessToken, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) return { ok: false, message: (await res.text()) || "Update failed." };
  return { ok: true };
}

async function deleteSitePhoto(id, accessToken) {
  const res = await supabaseRest(`/rest/v1/site_photos?id=eq.${encodeURIComponent(id)}`, accessToken, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
  if (!res.ok) return { ok: false, message: (await res.text()) || "Delete failed." };
  return { ok: true };
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
  const [activeTab, setActiveTab] = useState("services"); // services | inquiries | users | sessions | photos

  const [inq, setInq] = useState({ rows: [], total: null, loading: false, page: 0, pageSize: 20 });
  const [inqFilters, setInqFilters] = useState({ q: "", service: "", pet_type: "", from: "", to: "", dir: "desc" });

  const [users, setUsers] = useState({ rows: [], total: null, loading: false, page: 0, pageSize: 20 });
  const [userFilters, setUserFilters] = useState({ q: "", has_phone: "", dir: "desc" });

  const [sessions, setSessions] = useState({ rows: [], total: null, loading: false, page: 0, pageSize: 20 });
  const [sessionFilters, setSessionFilters] = useState({ user_id: "", event_type: "", role: "", from: "", to: "", dir: "desc" });

  const [photos, setPhotos] = useState({ rows: [], total: null, loading: false, page: 0, pageSize: 20 });
  const [photoFilters, setPhotoFilters] = useState({ q: "", section: "", active: "yes", dir: "asc" });
  const [photoDraft, setPhotoDraft] = useState({
    section: "hero",
    title: "",
    url: "",
    is_active: true,
    sort_order: 100,
  });
  const [photoFile, setPhotoFile] = useState(null);

  const [toast, setToast] = useState({ kind: "idle", text: "" });
  const [busy, setBusy] = useState(false);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const lastActionAt = useRef(0);
  const tabMeta = useMemo(
    () => ({
      services: { title: "Services", subtitle: "Edit what shows on the public homepage." },
      inquiries: { title: "Inquiries", subtitle: "View contact/booking requests sent from the homepage." },
      users: { title: "Users", subtitle: "User profiles captured from signups (optional phone)." },
      sessions: { title: "Sessions", subtitle: "Login/logout audit events (optional)." },
      photos: { title: "Photos", subtitle: "Edit section photos and upload new images from your computer." },
    }),
    []
  );

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

  async function loadPhotos(next) {
    if (!session) return;
    setPhotos((s) => ({ ...s, loading: true }));
    try {
      const res = await fetchSitePhotos(session.access_token, Object.assign({}, photoFilters, next));
      if (!res.ok) {
        const raw = res.message || "Could not load photos.";
        const friendly = /site_photos/i.test(raw) && /does not exist|undefined|not found/i.test(raw)
          ? 'Missing table. Re-run `supabase_admin.sql` to create `public.site_photos` and the Storage bucket policies.'
          : raw;
        setToast({ kind: "err", text: friendly });
        setPhotos((s) => ({ ...s, rows: [], total: res.total || null, loading: false }));
        return;
      }
      setPhotos((s) => ({
        ...s,
        rows: res.rows,
        total: res.total,
        page: next && typeof next.page === "number" ? next.page : s.page,
        loading: false,
      }));
    } finally {
      setPhotos((s) => ({ ...s, loading: false }));
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
    setPhotos({ rows: [], total: null, loading: false, page: 0, pageSize: 20 });
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
    if (activeTab === "photos") await loadPhotos({ page: photos.page, pageSize: photos.pageSize });
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
    if (activeTab === "photos") downloadCsv(`ourpets-photos-${stamp}.csv`, photos.rows, [
      "section",
      "title",
      "url",
      "is_active",
      "sort_order",
      "created_at",
      "updated_at",
    ]);
  }

  function canNext(page, pageSize, total, rows) {
    if (typeof total === "number") return (page + 1) * pageSize < total;
    return Array.isArray(rows) && rows.length === pageSize;
  }

  useEffect(() => {
    if (mode !== "app") return;
    if (!session) return;
    if (activeTab === "inquiries" && !inq.rows.length) loadInquiries({ page: 0, pageSize: inq.pageSize });
    if (activeTab === "users" && !users.rows.length) loadUsers({ page: 0, pageSize: users.pageSize });
    if (activeTab === "sessions" && !sessions.rows.length) loadSessions({ page: 0, pageSize: sessions.pageSize });
    if (activeTab === "photos" && !photos.rows.length) loadPhotos({ page: 0, pageSize: photos.pageSize });
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

  function updateLocalPhoto(id, key, value) {
    setPhotos((s) => ({
      ...s,
      rows: (s.rows || []).map((r) => {
        if (String(r.id) !== String(id)) return r;
        return { ...r, [key]: value };
      }),
    }));
  }

  async function onAddPhoto() {
    if (!session || busy || rateLimit()) return;
    const row = {
      section: String(photoDraft.section || "other"),
      title: String(photoDraft.title || "").trim() || null,
      url: String(photoDraft.url || "").trim(),
      is_active: !!photoDraft.is_active,
      sort_order: Number(photoDraft.sort_order || 100),
    };

    if (!row.url) {
      setToast({ kind: "err", text: "Provide a URL, or choose a file to upload." });
      return;
    }

    setBusy(true);
    setToast({ kind: "idle", text: "" });
    try {
      const res = await createSitePhoto(row, session.access_token);
      if (!res.ok) {
        setToast({ kind: "err", text: res.message || "Could not add photo." });
        return;
      }
      setToast({ kind: "ok", text: "Photo added." });
      setPhotoDraft((d) => ({ ...d, title: "", url: "" }));
      setPhotoFile(null);
      await loadPhotos({ page: 0, pageSize: photos.pageSize });
    } finally {
      setBusy(false);
    }
  }

  async function onUploadAndAddPhoto() {
    if (!session || busy || rateLimit()) return;
    if (!photoFile) {
      setToast({ kind: "err", text: "Choose a file to upload." });
      return;
    }

    const section = String(photoDraft.section || "other");
    const fileName = String(photoFile.name || "upload").replace(/[^\w.\-]+/g, "_");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const objectPath = `site_photos/${section}/${stamp}_${fileName}`;

    setBusy(true);
    setToast({ kind: "idle", text: "" });
    try {
      const up = await uploadStorageObject(session.access_token, photoFile, objectPath);
      if (!up.ok) {
        setToast({ kind: "err", text: up.message || "Upload failed." });
        return;
      }
      const row = {
        section,
        title: String(photoDraft.title || "").trim() || fileName,
        url: up.publicUrl,
        is_active: !!photoDraft.is_active,
        sort_order: Number(photoDraft.sort_order || 100),
      };
      const res = await createSitePhoto(row, session.access_token);
      if (!res.ok) {
        setToast({ kind: "err", text: res.message || "Could not save photo row." });
        return;
      }
      setToast({ kind: "ok", text: "Uploaded + added." });
      setPhotoDraft((d) => ({ ...d, title: "", url: "" }));
      setPhotoFile(null);
      await loadPhotos({ page: 0, pageSize: photos.pageSize });
    } finally {
      setBusy(false);
    }
  }

  async function onSavePhoto(id) {
    if (!session || busy || rateLimit()) return;
    const row = (photos.rows || []).find((r) => String(r.id) === String(id));
    if (!row) return;
    if (!row.section || !row.url) {
      setToast({ kind: "err", text: "Section and URL are required." });
      return;
    }

    setBusy(true);
    setToast({ kind: "idle", text: "" });
    try {
      const patch = {
        section: String(row.section),
        title: row.title == null ? null : String(row.title),
        url: String(row.url),
        is_active: !!row.is_active,
        sort_order: Number(row.sort_order || 100),
      };
      const res = await updateSitePhoto(row.id, patch, session.access_token);
      if (!res.ok) {
        setToast({ kind: "err", text: res.message || "Update failed." });
        return;
      }
      setToast({ kind: "ok", text: "Saved." });
      await loadPhotos({ page: photos.page, pageSize: photos.pageSize });
    } finally {
      setBusy(false);
    }
  }

  async function onDeletePhoto(id) {
    if (!session || busy || rateLimit()) return;
    const ok = window.confirm("Delete this photo row?");
    if (!ok) return;

    setBusy(true);
    setToast({ kind: "idle", text: "" });
    try {
      const res = await deleteSitePhoto(id, session.access_token);
      if (!res.ok) {
        setToast({ kind: "err", text: res.message || "Delete failed." });
        return;
      }
      setToast({ kind: "ok", text: "Deleted." });
      await loadPhotos({ page: Math.max(0, photos.page - 1), pageSize: photos.pageSize });
    } finally {
      setBusy(false);
    }
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
                {activeTab === "services" ? (
                  <button className="chip primary" onClick={onAddService} disabled={busy}>
                    Add Service
                  </button>
                ) : (
                  <button className="chip" onClick={onExportCsv} disabled={busy}>
                    Export CSV
                  </button>
                )}
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
              {(tabMeta[activeTab] && tabMeta[activeTab].title) || "Admin"}
              <small>{(tabMeta[activeTab] && tabMeta[activeTab].subtitle) || ""}</small>
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
              <div style={{ marginTop: 10 }}>
                <div className="admin-tabs" role="tablist" aria-label="Admin sections">
                  <button className={`tab ${activeTab === "services" ? "active" : ""}`} type="button" onClick={() => setActiveTab("services")}>
                    Services
                  </button>
                  <button className={`tab ${activeTab === "inquiries" ? "active" : ""}`} type="button" onClick={() => setActiveTab("inquiries")}>
                    Inquiries
                  </button>
                  <button className={`tab ${activeTab === "users" ? "active" : ""}`} type="button" onClick={() => setActiveTab("users")}>
                    Users
                  </button>
                  <button className={`tab ${activeTab === "sessions" ? "active" : ""}`} type="button" onClick={() => setActiveTab("sessions")}>
                    Sessions
                  </button>
                  <button className={`tab ${activeTab === "photos" ? "active" : ""}`} type="button" onClick={() => setActiveTab("photos")}>
                    Photos
                  </button>
                </div>

                {activeTab === "services" && (
                  <div className="admin-table-wrap">
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
                              <input value={s.title || ""} onChange={(e) => updateLocalService(s.id, "title", e.target.value)} />
                            </td>
                            <td>
                              <textarea value={s.description || ""} onChange={(e) => updateLocalService(s.id, "description", e.target.value)} />
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
                              <input type="checkbox" checked={!!s.is_active} onChange={(e) => updateLocalService(s.id, "is_active", e.target.checked)} />
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

                {activeTab === "inquiries" && (
                  <div className="admin-table-wrap">
                    <div className="admin-toolbar">
                      <div className="admin-filters">
                        <label>
                          Search
                          <input value={inqFilters.q} onChange={(e) => setInqFilters((s) => ({ ...s, q: e.target.value }))} placeholder="Name, phone, email, service…" />
                        </label>
                        <label>
                          Service
                          <input value={inqFilters.service} onChange={(e) => setInqFilters((s) => ({ ...s, service: e.target.value }))} placeholder="e.g. Grooming" />
                        </label>
                        <label>
                          Pet type
                          <input value={inqFilters.pet_type} onChange={(e) => setInqFilters((s) => ({ ...s, pet_type: e.target.value }))} placeholder="Dog / Cat" />
                        </label>
                        <label>
                          From
                          <input value={inqFilters.from} onChange={(e) => setInqFilters((s) => ({ ...s, from: e.target.value }))} type="date" />
                        </label>
                        <label>
                          To
                          <input value={inqFilters.to} onChange={(e) => setInqFilters((s) => ({ ...s, to: e.target.value }))} type="date" />
                        </label>
                        <label>
                          Order
                          <select value={inqFilters.dir} onChange={(e) => setInqFilters((s) => ({ ...s, dir: e.target.value }))}>
                            <option value="desc">Newest</option>
                            <option value="asc">Oldest</option>
                          </select>
                        </label>
                        <div className="admin-actions" style={{ alignSelf: "end" }}>
                          <button className="btn primary" type="button" onClick={() => loadInquiries({ page: 0, pageSize: inq.pageSize })} disabled={inq.loading || busy}>
                            Apply
                          </button>
                        </div>
                      </div>
                      <div className="notice">{inq.total != null ? `${inq.total} total` : `${inq.rows.length} loaded`}</div>
                    </div>

                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th style={{ width: 170 }}>Created</th>
                          <th style={{ width: 200 }}>Name</th>
                          <th style={{ width: 140 }}>Phone</th>
                          <th style={{ width: 220 }}>Email</th>
                          <th style={{ width: 120 }}>Pet</th>
                          <th style={{ width: 180 }}>Service</th>
                          <th style={{ width: 140 }}>Preferred</th>
                          <th>Message</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(inq.rows || []).map((r) => (
                          <tr key={r.id}>
                            <td className="mono">{formatShortDateTime(r.created_at)}</td>
                            <td>{r.full_name || ""}</td>
                            <td className="mono">{r.phone || ""}</td>
                            <td className="mono">{r.email || ""}</td>
                            <td>{r.pet_type || ""}</td>
                            <td>{r.service || ""}</td>
                            <td className="mono">{r.preferred_date || ""}</td>
                            <td className="notice" style={{ margin: 0 }}>
                              {r.message || ""}
                            </td>
                          </tr>
                        ))}
                        {!inq.loading && (!inq.rows || !inq.rows.length) ? (
                          <tr>
                            <td colSpan={8}>
                              <div className="notice">No inquiries found.</div>
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>

                    <div className="cta-row" style={{ marginTop: 10 }}>
                      <button
                        className="btn"
                        type="button"
                        disabled={inq.loading || busy || inq.page <= 0}
                        onClick={() => loadInquiries({ page: Math.max(0, inq.page - 1), pageSize: inq.pageSize })}
                      >
                        Prev
                      </button>
                      <button
                        className="btn"
                        type="button"
                        disabled={inq.loading || busy || !canNext(inq.page, inq.pageSize, inq.total, inq.rows)}
                        onClick={() => loadInquiries({ page: inq.page + 1, pageSize: inq.pageSize })}
                      >
                        Next
                      </button>
                      <span className="notice">
                        Page {inq.page + 1}
                        {typeof inq.total === "number" ? ` of ${Math.max(1, Math.ceil(inq.total / inq.pageSize))}` : ""}
                      </span>
                    </div>
                  </div>
                )}

                {activeTab === "users" && (
                  <div className="admin-table-wrap">
                    <div className="admin-toolbar">
                      <div className="admin-filters">
                        <label>
                          Search
                          <input value={userFilters.q} onChange={(e) => setUserFilters((s) => ({ ...s, q: e.target.value }))} placeholder="User ID or phone…" />
                        </label>
                        <label>
                          Has phone
                          <select value={userFilters.has_phone} onChange={(e) => setUserFilters((s) => ({ ...s, has_phone: e.target.value }))}>
                            <option value="">All</option>
                            <option value="yes">Yes</option>
                            <option value="no">No</option>
                          </select>
                        </label>
                        <label>
                          Order
                          <select value={userFilters.dir} onChange={(e) => setUserFilters((s) => ({ ...s, dir: e.target.value }))}>
                            <option value="desc">Newest</option>
                            <option value="asc">Oldest</option>
                          </select>
                        </label>
                        <div className="admin-actions" style={{ alignSelf: "end" }}>
                          <button className="btn primary" type="button" onClick={() => loadUsers({ page: 0, pageSize: users.pageSize })} disabled={users.loading || busy}>
                            Apply
                          </button>
                        </div>
                      </div>
                      <div className="notice">{users.total != null ? `${users.total} total` : `${users.rows.length} loaded`}</div>
                    </div>

                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>User ID</th>
                          <th style={{ width: 160 }}>Phone</th>
                          <th style={{ width: 170 }}>Created</th>
                          <th style={{ width: 170 }}>Updated</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(users.rows || []).map((r) => (
                          <tr key={r.user_id}>
                            <td className="mono">{r.user_id}</td>
                            <td className="mono">{r.phone || ""}</td>
                            <td className="mono">{formatShortDateTime(r.created_at)}</td>
                            <td className="mono">{formatShortDateTime(r.updated_at)}</td>
                          </tr>
                        ))}
                        {!users.loading && (!users.rows || !users.rows.length) ? (
                          <tr>
                            <td colSpan={4}>
                              <div className="notice">No users found.</div>
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>

                    <div className="cta-row" style={{ marginTop: 10 }}>
                      <button
                        className="btn"
                        type="button"
                        disabled={users.loading || busy || users.page <= 0}
                        onClick={() => loadUsers({ page: Math.max(0, users.page - 1), pageSize: users.pageSize })}
                      >
                        Prev
                      </button>
                      <button
                        className="btn"
                        type="button"
                        disabled={users.loading || busy || !canNext(users.page, users.pageSize, users.total, users.rows)}
                        onClick={() => loadUsers({ page: users.page + 1, pageSize: users.pageSize })}
                      >
                        Next
                      </button>
                      <span className="notice">
                        Page {users.page + 1}
                        {typeof users.total === "number" ? ` of ${Math.max(1, Math.ceil(users.total / users.pageSize))}` : ""}
                      </span>
                    </div>
                  </div>
                )}

                {activeTab === "sessions" && (
                  <div className="admin-table-wrap">
                    <div className="admin-toolbar">
                      <div className="admin-filters">
                        <label>
                          User ID
                          <input value={sessionFilters.user_id} onChange={(e) => setSessionFilters((s) => ({ ...s, user_id: e.target.value }))} placeholder="uuid…" />
                        </label>
                        <label>
                          Type
                          <select value={sessionFilters.event_type} onChange={(e) => setSessionFilters((s) => ({ ...s, event_type: e.target.value }))}>
                            <option value="">All</option>
                            <option value="login">login</option>
                            <option value="logout">logout</option>
                          </select>
                        </label>
                        <label>
                          Role
                          <select value={sessionFilters.role} onChange={(e) => setSessionFilters((s) => ({ ...s, role: e.target.value }))}>
                            <option value="">All</option>
                            <option value="admin">admin</option>
                            <option value="user">user</option>
                          </select>
                        </label>
                        <label>
                          From
                          <input value={sessionFilters.from} onChange={(e) => setSessionFilters((s) => ({ ...s, from: e.target.value }))} type="date" />
                        </label>
                        <label>
                          To
                          <input value={sessionFilters.to} onChange={(e) => setSessionFilters((s) => ({ ...s, to: e.target.value }))} type="date" />
                        </label>
                        <label>
                          Order
                          <select value={sessionFilters.dir} onChange={(e) => setSessionFilters((s) => ({ ...s, dir: e.target.value }))}>
                            <option value="desc">Newest</option>
                            <option value="asc">Oldest</option>
                          </select>
                        </label>
                        <div className="admin-actions" style={{ alignSelf: "end" }}>
                          <button className="btn primary" type="button" onClick={() => loadSessions({ page: 0, pageSize: sessions.pageSize })} disabled={sessions.loading || busy}>
                            Apply
                          </button>
                        </div>
                      </div>
                      <div className="notice">{sessions.total != null ? `${sessions.total} total` : `${sessions.rows.length} loaded`}</div>
                    </div>

                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th style={{ width: 170 }}>Created</th>
                          <th>User ID</th>
                          <th style={{ width: 100 }}>Type</th>
                          <th style={{ width: 90 }}>Admin</th>
                          <th style={{ width: 160 }}>TZ</th>
                          <th>User agent</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(sessions.rows || []).map((s) => (
                          <tr key={s.id}>
                            <td className="mono">{formatShortDateTime(s.created_at)}</td>
                            <td className="mono">{s.user_id}</td>
                            <td>{s.event_type}</td>
                            <td>{s.is_admin ? "yes" : "no"}</td>
                            <td className="mono">{s.tz || ""}</td>
                            <td className="notice" style={{ margin: 0 }}>
                              {s.user_agent || ""}
                            </td>
                          </tr>
                        ))}
                        {!sessions.loading && (!sessions.rows || !sessions.rows.length) ? (
                          <tr>
                            <td colSpan={6}>
                              <div className="notice">No session events found.</div>
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>

                    <div className="cta-row" style={{ marginTop: 10 }}>
                      <button
                        className="btn"
                        type="button"
                        disabled={sessions.loading || busy || sessions.page <= 0}
                        onClick={() => loadSessions({ page: Math.max(0, sessions.page - 1), pageSize: sessions.pageSize })}
                      >
                        Prev
                      </button>
                      <button
                        className="btn"
                        type="button"
                        disabled={sessions.loading || busy || !canNext(sessions.page, sessions.pageSize, sessions.total, sessions.rows)}
                        onClick={() => loadSessions({ page: sessions.page + 1, pageSize: sessions.pageSize })}
                      >
                        Next
                      </button>
                      <span className="notice">
                        Page {sessions.page + 1}
                        {typeof sessions.total === "number" ? ` of ${Math.max(1, Math.ceil(sessions.total / sessions.pageSize))}` : ""}
                      </span>
                    </div>
                  </div>
                )}

                {activeTab === "photos" && (
                  <div className="admin-table-wrap">
                    <div className="admin-toolbar">
                      <div className="admin-filters">
                        <label>
                          Section
                          <select value={photoFilters.section} onChange={(e) => setPhotoFilters((s) => ({ ...s, section: e.target.value }))}>
                            <option value="">All</option>
                            <option value="hero">hero</option>
                            <option value="products">products</option>
                            <option value="tips">tips</option>
                            <option value="services">services</option>
                            <option value="contact">contact</option>
                            <option value="other">other</option>
                          </select>
                        </label>
                        <label>
                          Search
                          <input value={photoFilters.q} onChange={(e) => setPhotoFilters((s) => ({ ...s, q: e.target.value }))} placeholder="Title, URL, section…" />
                        </label>
                        <label>
                          Active
                          <select value={photoFilters.active} onChange={(e) => setPhotoFilters((s) => ({ ...s, active: e.target.value }))}>
                            <option value="">All</option>
                            <option value="yes">Active</option>
                            <option value="no">Inactive</option>
                          </select>
                        </label>
                        <label>
                          Order
                          <select value={photoFilters.dir} onChange={(e) => setPhotoFilters((s) => ({ ...s, dir: e.target.value }))}>
                            <option value="asc">Section + order</option>
                            <option value="desc">Reverse order</option>
                          </select>
                        </label>
                        <div className="admin-actions" style={{ alignSelf: "end" }}>
                          <button className="btn primary" type="button" onClick={() => loadPhotos({ page: 0, pageSize: photos.pageSize })} disabled={photos.loading || busy}>
                            Apply
                          </button>
                        </div>
                      </div>

                      <div className="admin-filters" style={{ gridTemplateColumns: "repeat(6, minmax(160px, 1fr))" }}>
                        <label>
                          Upload section
                          <select value={photoDraft.section} onChange={(e) => setPhotoDraft((d) => ({ ...d, section: e.target.value }))}>
                            <option value="hero">hero</option>
                            <option value="products">products</option>
                            <option value="tips">tips</option>
                            <option value="services">services</option>
                            <option value="contact">contact</option>
                            <option value="other">other</option>
                          </select>
                        </label>
                        <label>
                          Title
                          <input value={photoDraft.title} onChange={(e) => setPhotoDraft((d) => ({ ...d, title: e.target.value }))} placeholder="Optional title" />
                        </label>
                        <label style={{ gridColumn: "span 2" }}>
                          URL (optional)
                          <input value={photoDraft.url} onChange={(e) => setPhotoDraft((d) => ({ ...d, url: e.target.value }))} placeholder="Paste an image URL, or upload a file" />
                        </label>
                        <label>
                          Order
                          <input inputMode="numeric" value={String(photoDraft.sort_order)} onChange={(e) => setPhotoDraft((d) => ({ ...d, sort_order: e.target.value }))} />
                        </label>
                        <label>
                          Active
                          <select value={photoDraft.is_active ? "yes" : "no"} onChange={(e) => setPhotoDraft((d) => ({ ...d, is_active: e.target.value === "yes" }))}>
                            <option value="yes">Yes</option>
                            <option value="no">No</option>
                          </select>
                        </label>
                        <label style={{ gridColumn: "span 2" }}>
                          File (optional)
                          <input type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)} />
                        </label>
                        <div className="admin-actions" style={{ alignSelf: "end" }}>
                          <button className="btn primary" type="button" onClick={photoFile ? onUploadAndAddPhoto : onAddPhoto} disabled={busy}>
                            {photoFile ? "Upload + Add" : "Add"}
                          </button>
                        </div>
                      </div>

                      <div className="notice">
                        {photos.total != null ? `${photos.total} total` : `${photos.rows.length} loaded`} • Storage bucket: <code>{STORAGE_BUCKET_ID}</code>
                      </div>
                    </div>

                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th style={{ width: 92 }}>Preview</th>
                          <th style={{ width: 120 }}>Section</th>
                          <th style={{ width: 180 }}>Title</th>
                          <th>URL</th>
                          <th style={{ width: 90 }}>Active</th>
                          <th style={{ width: 90 }}>Order</th>
                          <th style={{ width: 170 }}>Updated</th>
                          <th style={{ width: 200 }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(photos.rows || []).map((p) => (
                          <tr key={p.id}>
                            <td>
                              <div className="photo-preview">{p.url ? <img src={p.url} alt={p.title || "photo"} loading="lazy" /> : null}</div>
                            </td>
                            <td>
                              <select value={p.section || "other"} onChange={(e) => updateLocalPhoto(p.id, "section", e.target.value)}>
                                <option value="hero">hero</option>
                                <option value="products">products</option>
                                <option value="tips">tips</option>
                                <option value="services">services</option>
                                <option value="contact">contact</option>
                                <option value="other">other</option>
                              </select>
                            </td>
                            <td>
                              <input value={p.title || ""} onChange={(e) => updateLocalPhoto(p.id, "title", e.target.value)} />
                            </td>
                            <td>
                              <input value={p.url || ""} onChange={(e) => updateLocalPhoto(p.id, "url", e.target.value)} placeholder="https://..." />
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <input type="checkbox" checked={!!p.is_active} onChange={(e) => updateLocalPhoto(p.id, "is_active", e.target.checked)} />
                            </td>
                            <td>
                              <input inputMode="numeric" value={String(p.sort_order == null ? "" : p.sort_order)} onChange={(e) => updateLocalPhoto(p.id, "sort_order", e.target.value)} />
                            </td>
                            <td className="mono">{formatShortDateTime(p.updated_at)}</td>
                            <td>
                              <div className="admin-actions">
                                <button className="btn primary" type="button" onClick={() => onSavePhoto(p.id)} disabled={busy}>
                                  Save
                                </button>
                                <button className="btn danger" type="button" onClick={() => onDeletePhoto(p.id)} disabled={busy}>
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {!photos.loading && (!photos.rows || !photos.rows.length) ? (
                          <tr>
                            <td colSpan={8}>
                              <div className="notice">No photos found.</div>
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>

                    <div className="cta-row" style={{ marginTop: 10 }}>
                      <button
                        className="btn"
                        type="button"
                        disabled={photos.loading || busy || photos.page <= 0}
                        onClick={() => loadPhotos({ page: Math.max(0, photos.page - 1), pageSize: photos.pageSize })}
                      >
                        Prev
                      </button>
                      <button
                        className="btn"
                        type="button"
                        disabled={photos.loading || busy || !canNext(photos.page, photos.pageSize, photos.total, photos.rows)}
                        onClick={() => loadPhotos({ page: photos.page + 1, pageSize: photos.pageSize })}
                      >
                        Next
                      </button>
                      <span className="notice">
                        Page {photos.page + 1}
                        {typeof photos.total === "number" ? ` of ${Math.max(1, Math.ceil(photos.total / photos.pageSize))}` : ""}
                      </span>
                    </div>
                  </div>
                )}
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

