# Deploy Patel AutoPrint to the Cloud (Free)

This makes the server run 24/7 in the cloud so **you never have to keep this PC on**.
The printer agents on each shop PC just connect to the cloud URL.

> **Free host used:** [Render](https://render.com) — free web service + free PostgreSQL, no credit card.
> **Note:** Render free services sleep after 15 min of no activity. Your shop agents poll every 5s, so while a shop is open the server stays awake. When all shops are closed it sleeps (fine). First request after sleep takes ~30-60s (the agent retries automatically).
> **Free Postgres expires after 90 days** — re-create it or move to Supabase/Neon (free, no expiry) when that happens.

---

## Part 1 — Push code to GitHub (do this ONCE)

You need a free GitHub account: https://github.com/signup

1. Go to https://github.com/new
2. **Repository name:** `patel-autoprint`
3. Keep it **Public** (or Private — either works)
4. **Do NOT** add a README / .gitignore / license (we already have them)
5. Click **Create repository**
6. On the next page, copy the commands under **"…or push an existing repository from the command line"**

   They look like:
   ```
   git remote add origin https://github.com/<your-user>/patel-autoprint.git
   git branch -M main
   git push -u origin main
   ```
7. Run those 3 commands in a terminal **inside this project folder**
   (`C:\Users\mayank\Documents\New OpenCode Project\patel-autoprint`)

> If you'd rather not use the terminal, install [GitHub Desktop](https://desktop.github.com),
> add the local repository (File → Add Local Repository → pick this folder), then click **Publish**.

---

## Part 2 — Deploy on Render (do this ONCE)

You need a free Render account: https://dashboard.render.com/ (sign up with your GitHub)

1. Click **New +** → **Blueprint**
2. Connect your GitHub and select the `patel-autoprint` repo
3. Render reads `render.yaml` automatically — it will create:
   - a **PostgreSQL** database (`patel-autoprint-db`, free)
   - a **Web Service** (`patel-autoprint`, free)
4. Click **Apply** / **Deploy**

Render will then automatically:
- install dependencies
- generate the Prisma client
- create the database tables (`prisma db push`)
- seed the demo shop + admin (`prisma db seed`)
- start the server

**First deploy takes 3–5 minutes.** Watch the logs in the Render dashboard.

---

## Part 3 — Your live URL

When the deploy finishes, Render gives you a URL like:

```
https://patel-autoprint.onrender.com
```

- **Admin panel:** open that URL → log in with
  `admin@patelautoprint.com` / `admin123`
- **Customer uploads:** same URL (the customer portal)
- **Share that URL** with customers instead of the Cloudflare tunnel link.

> To use a custom domain later (e.g. `print.yourshop.com`), go to the Web Service →
> **Settings → Custom Domain** in Render (paid add-on) or point a domain at it.

---

## Part 4 — Point each shop PC's agent at the cloud

On every shop PC that has a printer:

1. Copy the `agent/` folder there (just that folder)
2. Install deps: `cd agent` then `npm install`
3. Configure it:
   ```
   node index.js --setup
   ```
   - **Server URL** → paste your Render URL (e.g. `https://patel-autoprint.onrender.com`)
   - **Email / Password** → the shop admin login
4. Run it: `node index.js` (keep the window open while the shop is open)

That's it — the agent now prints jobs from the cloud, and **this dev PC can stay off**.

---

## Changing the code later

After you edit files here:
```
git add -A
git commit -m "your change"
git push
```
Render auto-redeploys on every push.
(If you change the frontend, rebuild it first: `cd frontend && npm run build`.)

## Troubleshooting

| Problem | Fix |
|----------|-----|
| Deploy fails on DB step | In Render → Web Service → **Manual Deploy** after the DB is created |
| Admin login fails | The seed creates `admin@patelautoprint.com`/`admin123`. Re-run seed from Render shell: `npx prisma db seed` |
| Agent says "connection refused" | Check the Server URL in `agent/config.json` matches your Render URL exactly (https://…) |
| Free Postgres expired (90 days) | Create a new Postgres in Render, copy its Internal URL into the Web Service `DATABASE_URL`, redeploy |
| Server sleeps / slow first print | Normal on free tier; the agent retries. Upgrade to a paid instance for always-on |
