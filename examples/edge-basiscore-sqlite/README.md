# Example 1 — Notes module with BasisCore Edge and SQLite

A complete, minimal BasisPanel module: a **Notes** app where each business keeps its own notes.
It is built on [BasisCore.Server.Edge](https://github.com/Manzoomeh/BasisCore.Server.Edge)
(`bclib` 4.0) with a local **SQLite** database, and it follows the contract in
[AGENTS.md](../../AGENTS.md).

| | |
|---|---|
| Technology | Python 3.13+, `bclib` 4.0.0, SQLite (standard library) |
| Panel level | Business (data is scoped by `currentDmnid`) |
| Menu | 1 group, 2 pages |
| Pages | `1` notes (grid: list + summary), `2` about (full-page) |
| Widgets | `101` list and form, `102` summary, `103` about |
| Sidebar | page `1` |
| Languages | English, Persian (RTL) |
| Status | Tested locally with the shell simulator; **not registered** in a panel yet |

---

## Quick start

```bash
cd examples/edge-basiscore-sqlite
python -m venv .venv
.venv/Scripts/activate            # Windows
# source .venv/bin/activate       # Linux / macOS
pip install -r requirements.txt
cp .env.sample .env               # local defaults: mock session + shell simulator
python notes_predicates.py
```

Open **http://127.0.0.1:8790/dev/shell** — a small page that behaves like the BasisPanel shell:
it loads the menu, opens pages, injects widgets and lets you switch between English and Persian.
The session key `dev` is accepted only while `NOTES_MOCK_AUTH=1`.

Verify:

```bash
python tests/check_widgets.py     # seven widget rules + content consistency (no server needed)
python tests/smoke_test.py        # 16 checks against the running service
```

---

## Files

```
edge-basiscore-sqlite/
├── notes_predicates.py        entry point: options and every route
├── notes_methods.py           handlers: contract, token substitution, data API
├── notes_auth.py              TrustLogin checkrkey + mock session for development
├── notes_store.py             SQLite storage, always scoped to the current business
├── notes_config.py            configuration from environment / .env
├── menu/desktop/menu.json
├── pages/desktop/1.json, 2.json
├── widgets/desktop/101.html, 102.html, 103.html
├── sidebars/desktop/1.json
├── assets/notes.css, notes-icon.svg
├── i18n/en.json, fa.json      labels per culture
├── dev/shell.html             local shell simulator (development only)
├── tests/check_widgets.py     rule checker
├── tests/smoke_test.py        end-to-end smoke test
├── requirements.txt           bclib pinned to a tested commit
└── .env.sample
```

---

## Routes

| Route | Router | Returns |
|---|---|---|
| `notes/:rkey/:culture/:device/menu` | restful | menu JSON |
| `notes/:rkey/:culture/:device/page/:pageID` | restful | page JSON |
| `notes/:rkey/:culture/:device/widget/:widgetID` | web | widget HTML |
| `notes/:rkey/:culture/:device/widget/asset/:fileName` | web | asset |
| `notes/asset/:fileName` | web | asset |
| `notes/:rkey/:culture/:device/sidebarMenu/:pageID` (and `sidebarmenu`) | restful | sidebar JSON |
| `GET notes/:rkey/api/notes` | restful | `{"notes": [...], "count": n}` |
| `POST notes/:rkey/api/notes` | restful | `{"note": {...}}` — body `{"title", "body"}` |
| `DELETE notes/:rkey/api/notes/:noteID` | restful | `{"deleted": id}` |
| `OPTIONS` on the two API paths | restful | CORS preflight |
| `dev/shell` | web | simulator — only when `NOTES_DEV_SHELL=1` |

`bclib` 4.0 builds its router from the registered handlers, so no router table is needed.

---

## How it meets the contract

| Requirement | Where |
|---|---|
| Session validated on every non-asset route; `Invalid rKey` with 401 on failure | `notes_auth.check_rkey_async` |
| Scope by the **current** business, never the home one | `Scope.current_dmnid`, every query in `notes_store.py` |
| Soft tenant gate: `{"nodes":[]}` / `{}` / `""` when a business is not allowed | `notes_methods._is_allowed` |
| CORS echoes only allowed panel origins | `notes_methods._cors` |
| `mid` never hard-coded: `"[##mid##]"` is replaced by `NOTES_MODULE_ID` as a number | `notes_methods._render_json` |
| Device segment matched case-insensitively (`Desktop` → `desktop/`) | `notes_methods._content_path` |
| Missing sidebar answers empty nodes, not 404 | `get_sidebar_async` |
| Asset route: single segment, css/js/json/svg, text only, never token-processed | `get_asset` |
| Widgets: no `<style>`, absolute URLs, no external assets, no top-level `const`/`let`, unique root id, build marker | `widgets/desktop/*.html`, checked by `tests/check_widgets.py` |
| Expired session shown as a clear message, not a raw error | widget `101`, `error.session` |
| Widget-to-widget messaging | `101` announces `notes:changed` (and `$bc.setSource('notes.changed')` when BasisCore.js is present); `102` refreshes |
| Multi-language and direction | `i18n/*.json`, `[##module.dir##]`, logical CSS properties |

### Token substitution

Tokens are replaced by the service itself, so the module behaves the same served directly or
behind the BasisCore web server. Widgets are therefore returned as *rendered* (final) content.

| In | Token | Becomes |
|---|---|---|
| JSON | `"[##mid##]"` | the registered module id (a number) |
| JSON | `"[##dmnid##]"`, `[##rkey##]` | current business id, session key |
| JSON, widgets | `[##t.<key>##]` | label from `i18n/<culture>.json` |
| widgets | `[##cms.cms.rkey\|cms.cookie.rkey##]`, `[##cms.cms.dmnid##]` | session key, current business id |
| widgets | `[##module.baseurl##]` | absolute URL of this module (`NOTES_PUBLIC_BASE_URL` + prefix) |
| widgets | `[##module.stylesheet##]` | shared stylesheet (`NOTES_STYLESHEET_URL`) or the demo one |
| widgets | `[##module.culture##]`, `[##module.dir##]` | culture and `rtl` / `ltr` |

---

## Configuration

See [.env.sample](.env.sample). The important rule: **registration values are never guessed.**
`NOTES_MODULE_ID`, `NOTES_ALLOWED_DMN_IDS`, `NOTES_ALLOWED_ORIGINS` and `NOTES_STYLESHEET_URL`
come from the module's registration in BasisPanel.

## Going to production

1. Register the module (level, prefix `notes`, address) and receive its `mid`.
2. Set `NOTES_MODULE_ID`, `NOTES_ALLOWED_DMN_IDS`, `NOTES_ALLOWED_ORIGINS`,
   `NOTES_PUBLIC_BASE_URL` (HTTPS) and `NOTES_STYLESHEET_URL`.
3. Set `NOTES_MOCK_AUTH=0` and `NOTES_DEV_SHELL=0`.
4. Move the rules of `assets/notes.css` into the shared stylesheet.
5. Deploy through CI; check the build markers in the browser console and that the menu entry
   opens page `1`.

SQLite suits a single instance. For several instances, replace `notes_store.py` with a server
database; nothing else changes.
