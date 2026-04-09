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
3. In Supabase **Project Settings → API**, copy:
   - Project URL
   - `anon` public key
4. Edit `index.html` and set:

```js
window.OURPETS_SUPABASE_URL = "https://YOUR_PROJECT_ID.supabase.co";
window.OURPETS_SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
```

Now the “Send Inquiry” form will insert rows into `public.inquiries`.

## Files

- `index.html` – page shell + Supabase config
- `styles.css` – adorable styling
- `app.jsx` – React UI + Supabase REST submit
- `supabase.sql` – table + RLS policy for inserts
