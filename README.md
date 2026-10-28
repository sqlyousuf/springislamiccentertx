# Spring Islamic Center website

A static site (no build step) for Spring Islamic Center, 18901 Kuykendahl Rd, Spring, TX 77388. It's hosted on Cloudflare Workers (static assets).

- `public/` holds everything that gets deployed: `index.html`, `styles.css`, `app.js` and `logo.svg`.
- Prayer times come from **Masjidal** (Klein Islamic Center). If Masjidal can't be reached, or no ID is set, the site shows calculated adhan times from AlAdhan (ISNA method) instead.

## Connect Masjidal

Open [public/app.js](public/app.js) and set `MASJIDAL_ID` at the top. You can find the ID in the Masjidal admin portal, or in the `masjid_id=` part of any Masjidal widget link for the masjid.

## Preview locally

```sh
npx wrangler dev
```

## Deploy to Cloudflare

The Cloudflare Worker is connected to this GitHub repo, so every push to `main` deploys automatically. Its deploy command is `npx wrangler deploy`, and it reads [wrangler.toml](wrangler.toml), which serves the `public/` folder.

To deploy from your own machine instead:

```sh
npx wrangler deploy
```
