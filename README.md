# Spring Islamic Center website

A static site (no build step) for Spring Islamic Center, 18901 Kuykendahl Rd, Spring, TX 77388. It's hosted on Cloudflare Pages.

- `public/` holds everything that gets deployed: `index.html`, `styles.css`, `app.js` and `logo.svg`.
- Prayer times come from **Masjidal** (Klein Islamic Center). If Masjidal can't be reached, or no ID is set, the site shows calculated adhan times from AlAdhan (ISNA method) instead.

## Connect Masjidal

Open [public/app.js](public/app.js) and set `MASJIDAL_ID` at the top. You can find the ID in the Masjidal admin portal, or in the `masjid_id=` part of any Masjidal widget link for the masjid.

## Preview locally

```sh
npx wrangler pages dev public
```

## Deploy to Cloudflare Pages

**Option A: connect the Git repo (recommended)**
1. Push this repo to GitHub.
2. In Cloudflare, go to **Workers & Pages → Create → Pages → Connect to Git**.
3. Set the framework preset to **None**, leave the build command empty, and set the build output directory to `public`.

**Option B: deploy from your machine**

```sh
npx wrangler pages deploy public --project-name springislamiccentertx
```
