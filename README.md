# Ourpets (Demo Website)

An adorable, user-friendly demo site for a pet care store named **Ourpets**.

It’s built as simple **HTML + CSS + React (CDN)** (no build step), and includes a **Supabase**-backed contact/booking form (data entry).

## 1) Run locally

Because the site uses external CDN scripts, open it via a tiny local server:

```bash
python -m http.server 5173
```

Then open:

- `http://localhost:5173/`

On Windows PowerShell you can also run:

```powershell
.\start.ps1
```

## 2) Supabase setup (data entry)

1. Create a Supabase project.
2. In Supabase **SQL Editor**, run `supabase.sql`.
3. In Supabase **SQL Editor**, run `supabase_admin.sql` (services + admin role).
3. In Supabase **Project Settings → API**, copy:
   - Project URL
   - `anon` public key
4. Edit `index.html` and set:

```js
window.OURPETS_SUPABASE_URL = "https://YOUR_PROJECT_ID.supabase.co";
window.OURPETS_SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
```

Now the “Send Inquiry” form will insert rows into `public.inquiries`.

### Local keys (recommended)

Instead of committing keys into HTML, create `config.local.js` (it’s gitignored):

```js
window.OURPETS_SUPABASE_URL = "https://YOUR_PROJECT_ID.supabase.co";
window.OURPETS_SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
```

This works for both `index.html` and `admin.html`.

## 3) Admin panel (edit services)

Admin URL:

- `http://localhost:5173/admin.html`

Steps:

1. Supabase → **Authentication → Users** → create a user (email + password).
2. Supabase → **SQL Editor**, run:

```sql
select id, email from auth.users order by created_at desc limit 5;
```

3. Copy the `id` for your admin user and allowlist it:

```sql
insert into public.admin_users (user_id) values ('PASTE-USER-UUID-HERE');
```

Now login on `admin.html` and edit services. The homepage reads services from `public.services` (when Supabase is configured).

## Files

- `index.html` – page shell + Supabase config
- `styles.css` – adorable styling
- `app.jsx` – React UI + Supabase REST submit + theme/tips
- `supabase.sql` – table + RLS policy for inserts
- `supabase_admin.sql` – services table + admin role policies
- `admin.html` – admin URL
- `admin.jsx` – admin UI (login + CRUD)

## Nice demo features

- Theme toggle (Pastel / Night) in the top bar
- Product quick search
- “Pet Care Tips” section (copy/share)
- Floating quick buttons (WhatsApp demo + back-to-top)
