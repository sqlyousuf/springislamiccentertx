# Spring Islamic Center website

A static site (no build step) for Spring Islamic Center, 18901 Kuykendahl Rd, Spring, TX 77388. It's hosted on Cloudflare Workers (static assets).

- `public/` holds everything that gets deployed: `index.html`, `styles.css`, `app.js` and `logo.svg`.
- Prayer times come live from **Masjidal**'s public, keyless feed (`https://masjidal.com/api/v1/time/range`), called straight from the browser. If Masjidal can't be reached, the site shows calculated adhan times from AlAdhan (Karachi method, standard Asr) instead.
- The site is built mobile-first, with a bottom quick-action bar on phones (Prayer times, Directions, Call, Donate).

## Masjidal IDs

Both are set at the top of [public/app.js](public/app.js):

- `MASJIDAL_ID = "zKz3YnLO"` — Klein Islamic Center (this masjid): daily adhan, iqamah and the 7-day table. Taken from the `masjid_id=` in the Masjidal/AthanPlus widget on kleinislamiccenter.org.
- `JUMUAH_MASJIDAL_ID = "adJqxqAk"` — Masjid Ibrahim (5500 FM 2920), where KIC's Jumu'ah is held. The KIC feed has no Jumu'ah times.

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
