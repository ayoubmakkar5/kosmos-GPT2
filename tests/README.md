
# Tests

Two suites, both zero-install except the optional UI one.

| Suite | Runs against | Needs |
|---|---|---|
| `tests/e2e.mjs` | a running server (`:3000`) | nothing — plain `fetch` |
| `tests/ui.mjs` | a running server (`:3000`) | `npm i jsdom --no-save` |
| `tests/iframe.mjs` | a running server (`:3000`) | nothing — checks embedded/proxy cookies |

```bash
npm start &                      # or: MODEL_FILE=... node server.js

node tests/e2e.mjs               # API, auth, streaming, isolation  (54+ checks)
SKIP_CHAT=1 node tests/e2e.mjs   # same, without waiting for the model

npm i jsdom --no-save
node tests/ui.mjs                # real front-end in jsdom        (63 checks)
node tests/iframe.mjs            # embedded + HTTPS-proxy cookies (11 checks)
```

Environment variables: `BASE`, `PASSWORD`/`APP_PASSWORD`, `SKIP_CHAT`.

`tests/ui.mjs` boots the actual `public/index.html` + `public/app.js` in jsdom with
a real `fetch`, so it catches template, i18n, streaming and rendering regressions
that a pure API test cannot see.
