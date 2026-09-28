# Example 2 — Notes module with Node.js and BasisCore.Server.Node

The same **Notes** module as [example 1](../edge-basiscore-sqlite/), built entirely in Node.js.
[BasisCore.Server.Node](https://github.com/Manzoomeh/BasisCore.Server.Node) is the web server,
the module contract is implemented as the server's routing connection, data lives in SQLite, and
one widget is **rendered on the server by the BasisCore render engine**. It follows the contract
in [AGENTS.md](../../AGENTS.md).

| | |
|---|---|
| Technology | Node.js 22.13+, `basiscore.server` 2.0.0 (BasisCore.Server.Node), `node:sqlite` |
| Panel level | Business (data is scoped by `currentDmnid`) |
| Menu | 1 group, 2 pages |
| Pages | `1` notes (grid: list + summary), `2` about (full-page) |
| Widgets | `101` list and form (plain HTML), `102` summary (**BasisCore IL, server-rendered**), `103` about |
| Sidebar | page `1` |
| Languages | English, Persian (RTL) |
| Status | Tested locally with the shell simulator; **not registered** in a panel yet |

---

## How it works

```
browser / panel shell
      │  GET notes/:rkey/:culture/:device/...
      ▼
BasisCore.Server.Node  (endpoint → "http" service)
      │  asks the RoutingData connection what to answer
      ▼
src/router.js  — the module contract
      ├─ menu, page, sidebar, API, assets, plain widgets ─▶ index 5: content returned as is
      └─ IL widget (102.il.json) ─▶ index 1: cms.page_il rendered by the BasisCore engine
                                         │  <basis core="dbsource" source="notes">
                                         ▼
                                   src/datasource.js — "notes" connection (SQLite)
```

Both connections are **inline**: plain JavaScript objects passed in the server configuration
(`Connections.inline.RoutingData`, `Connections.inline.notes`). No Python and no separate Edge
process are needed.

The IL widget shows the BasisCore way of rendering data on the server:

| IL command | Does |
|---|---|
| `rawtext` | HTML around the data; `{"Params":[{"Source":"cms","Member":"cms","Column":"rkey"}]}` is the token `[##cms.cms.rkey##]`, resolved by the engine |
| `dbsource` (`source="notes"`, member `summary`) | Loads one record set from `src/datasource.js`. The engine sets `dmnid` itself from the routing data, so a widget cannot read another business's data |
| `print` (`data-member-name="db.summary"`) | Renders each row through its face: `@count`, `@latest` |

The IL is written by hand in `widgets/desktop/102.il.json`. Writing `.bc` markup instead needs
the BasisCore IL parser service (`IL_PARSER_URL`), which this example does not require.

---

## Quick start

```bash
cd examples/node-basiscore-server-sqlite
npm install
cp .env.sample .env        # local defaults: mock session + shell simulator
npm start
```

Open **http://localhost:8792/dev/shell** — a small page that behaves like the BasisPanel shell.
The session key `dev` is accepted only while `NOTES_MOCK_AUTH=1`.

Verify:

```bash
npm run check              # seven widget rules + IL + content consistency (no server needed)
npm run smoke              # 20 checks against the running service
```

### If `npm install` fails on `sqlite3`

`basiscore.server` depends on the native `sqlite3` package. On some platforms (seen on Windows
with Node.js 24) its installer cannot find the prebuilt binary and tries to compile. Install
without scripts, then fetch the prebuilt binaries explicitly:

```bash
npm install --ignore-scripts
cd node_modules/sqlite3 && npx prebuild-install -r napi --target 6 && cd ../..
cd node_modules/sharp && node install/check && cd ../..
```

The module itself uses Node's built-in `node:sqlite`, which prints an *ExperimentalWarning* on
Node.js 22–24. The warning is harmless.

---

## Files

```
node-basiscore-server-sqlite/
├── server.js                  boots BasisCore.Server.Node with the two inline connections
├── src/router.js              the module contract: routing data for every request
├── src/content.js             content files, token substitution, i18n, assets
├── src/datasource.js          "notes" connection for dbsource commands
├── src/auth.js                TrustLogin checkrkey + mock session for development
├── src/store.js               SQLite (node:sqlite), always scoped to the current business
├── src/config.js              configuration from environment / .env
├── menu/desktop/menu.json
├── pages/desktop/1.json, 2.json
├── widgets/desktop/101.html, 102.il.json, 103.html
├── sidebars/desktop/1.json
├── assets/notes.css, notes-icon.svg
├── i18n/en.json, fa.json
├── dev/shell.html             local shell simulator (development only)
├── tests/check-widgets.js     rule checker (plain and IL widgets)
├── tests/smoke-test.js        end-to-end smoke test
├── package.json               basiscore.server pinned to a tested commit
└── .env.sample
```

The content folders are identical in shape to example 1; only `widgets/desktop/102` differs.

---

## Routes

| Route | Response |
|---|---|
| `notes/:rkey/:culture/:device/menu` | menu JSON (index 5) |
| `notes/:rkey/:culture/:device/page/:pageID` | page JSON (index 5) |
| `notes/:rkey/:culture/:device/widget/:widgetID` | HTML — index 5 for `.html`, index 1 for `.il.json` |
| `notes/:rkey/:culture/:device/widget/asset/:fileName` | asset |
| `notes/asset/:fileName` | asset |
| `notes/:rkey/:culture/:device/sidebarMenu/:pageID` (and `sidebarmenu`) | sidebar JSON |
| `GET notes/:rkey/api/notes` | `{"notes": [...], "count": n}` |
| `POST notes/:rkey/api/notes` | `{"note": {...}}` — body `{"title", "body"}` |
| `DELETE notes/:rkey/api/notes/:noteID` | `{"deleted": id}` |
| `dev/shell` | simulator — only when `NOTES_DEV_SHELL=1` |

---

## How it meets the contract

| Requirement | Where |
|---|---|
| Session validated on every non-asset route; `Invalid rKey` with 401 on failure | `src/auth.js`, `router.getRoutingDataAsync` |
| Scope by the **current** business, never the home one | `scope.currentDmnid`; `dmnid` injected by the engine for IL widgets |
| Soft tenant gate: `{"nodes":[]}` / `{}` / `""` | `allowed()` in `src/router.js` |
| `mid` never hard-coded: `"[##mid##]"` → `NOTES_MODULE_ID` as a number | `readJson` in `src/content.js` |
| Device matched case-insensitively; missing sidebar → empty nodes | `src/content.js`, `handleContract` |
| Asset route: single segment, css/js/json/svg, text only, no tokens | `readAsset` |
| Seven widget rules | `widgets/desktop/*`, checked by `npm run check` |
| Data escaped before the `print` command renders it | `src/datasource.js` |
| Widget messaging | `101` announces `notes:changed`; `102` asks the server to re-render and swaps the values |

---

## Things to know about BasisCore.Server.Node

Observed while building this example, with the pinned version:

1. **IP host headers are refused.** A request whose `Host` is an IP address answers
   `403 request_blocked_by_host_policy`. Use a host name — `localhost` locally.
2. **CORS is answered by the server, for any origin.** Preflight `OPTIONS` requests never reach
   the module, and every response echoes the request's `Origin` with
   `Access-Control-Allow-Credentials: true`. This module therefore enforces its own allow list
   (`NOTES_ALLOWED_ORIGINS`) and refuses other origins with 403.
3. **`print` does not escape values.** Escape data in the source (as `src/datasource.js` does).
4. **The built-in `sqlite` connection ignores parameters,** so it cannot scope data by business.
   This example uses an inline connection instead.
5. The routing request carries the path in `request.url`, the method in `request.methode`,
   and a JSON body both parsed (`form`) and raw (`request.body`).

---

## Going to production

1. Register the module (level, prefix `notes`, address) and receive its `mid`.
2. Set `NOTES_MODULE_ID`, `NOTES_ALLOWED_DMN_IDS`, `NOTES_ALLOWED_ORIGINS`,
   `NOTES_PUBLIC_BASE_URL` (HTTPS host name) and `NOTES_STYLESHEET_URL`.
3. Set `NOTES_MOCK_AUTH=0` and `NOTES_DEV_SHELL=0`.
4. Move the rules of `assets/notes.css` into the shared stylesheet.
5. Put TLS in front, or add a certificate to the endpoint (see the BasisCore.Server.Node README).
6. Deploy through CI; check the build markers in the browser console.
