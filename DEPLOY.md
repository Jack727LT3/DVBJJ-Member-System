# Deploy DVBJJ Member System

The app is a single Next.js site:

| URL | Use |
|-----|-----|
| `/` | Member check-in kiosk (iPad / front desk) |
| `/dashboard` | Staff dashboard (username `dvbjj90`, password `dvbjj1of1`) |
| `/admin` | Full admin (Supabase email magic link) |

Recommended host: **[Vercel](https://vercel.com)** (built for Next.js, free tier is enough to start).

---

## 1. Supabase (live data)

Without Supabase, the kiosk search returns no members and the staff dashboard shows **demo sample data**.

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL editor, open `supabase/setup-all.sql`, paste the whole file, and click **Run** (one shot — all migrations).  
   **Already live?** Also run `supabase/migrations/0014_flags_waivers_professors.sql` (staff flags, waiver storage, professor accounts, trial vs guest kiosk signup).
3. In **Project Settings → API**, copy:
   - Project URL → `SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` `secret` key → `SUPABASE_SERVICE_ROLE_KEY` (never expose in the browser)

---

## 2. Deploy on Vercel (GitHub)

Repo: `https://github.com/Jack727LT3/DVBJJ-Member-System`

1. Push the latest `main` branch to GitHub.
2. Go to [vercel.com/new](https://vercel.com/new) → **Import** `DVBJJ-Member-System`.
3. Leave **Root Directory** empty (this repo is already the Next.js app).
4. **Environment variables** — add every variable from `.env.example` for **Production**.
5. Click **Deploy**.

Your live URLs will look like `https://dvbjj-member-system.vercel.app` (name varies).

### Custom domain (optional)

In the Vercel project → **Settings → Domains**, add e.g. `checkin.dvbjj.com` and follow DNS instructions.

---

## 3. Deploy from your Mac (CLI)

```bash
npx vercel login
npx vercel link          # first time: link to a Vercel project
npx vercel env pull .env.local   # optional: pull env from Vercel
npx vercel --prod
```

Add env vars in the Vercel dashboard first, or when prompted during `vercel link`.

---

## 4. After deploy — gym checklist

- [ ] Open the site on the iPad → bookmark the home page (`/`) for check-in.
- [ ] Staff use the same site → **Staff Dashboard** → sign in at `/dashboard`.
- [ ] Confirm Supabase is connected (no yellow “Sample data” banner on staff dashboard).
- [ ] Test a real member phone check-in and staff notifications.

---

## Local development

```bash
cp .env.example .env.local   # fill in real values
npm install
npm run dev
```

Open http://localhost:3000
