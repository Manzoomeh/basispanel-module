# Example 3 — Notes module with PHP and MySQL

The same **Notes** module as [example 1](../edge-basiscore-sqlite/), written in plain PHP with a
MySQL database — no framework, no Composer packages. It shows that any stack able to answer
HTTP can be a BasisPanel module, and it follows the contract in [AGENTS.md](../../AGENTS.md).

| | |
|---|---|
| Technology | PHP 8.2+ (`pdo_mysql`, `curl`, `mbstring`), MySQL 8 or MariaDB 10.6+ |
| Panel level | Business (data is scoped by `currentDmnid`) |
| Menu | 1 group, 2 pages |
| Pages | `1` notes (grid: list + summary), `2` about (full-page) |
| Widgets | `101` list and form, `102` summary, `103` about |
| Sidebar | page `1` |
| Languages | English, Persian (RTL) |
| Status | Tested locally with PHP 8.3 + MariaDB 11.4 and the shell simulator; **not registered** in a panel yet |

---

## Quick start

### Option A — Docker Compose (PHP 8.3 + Apache, MySQL 8.4)

```bash
cd examples/php-mysql
cp .env.sample .env          # set NOTES_DB_PASSWORD
docker compose up --build
```

The schema in `sql/schema.sql` is applied automatically on the first start.

> The Compose setup is provided for convenience but was **not** exercised during testing; the
> tested path is option B.

### Option B — PHP's built-in server and an existing MySQL/MariaDB

```bash
cd examples/php-mysql
mysql -u root -p -e "CREATE DATABASE notes CHARACTER SET utf8mb4"
mysql -u root -p notes < sql/schema.sql
cp .env.sample .env          # set the NOTES_DB_* values
php -S localhost:8794 -t public public/index.php
```

Open **http://localhost:8794/dev/shell** — a small page that behaves like the BasisPanel shell.
The session key `dev` is accepted only while `NOTES_MOCK_AUTH=1`.

Verify:

```bash
php tests/check_widgets.php  # seven widget rules + content consistency (no server needed)
php tests/smoke_test.php     # 17 checks against the running service
```

In production, point any web server's document root at `public/`; `public/.htaccess` sends every
request to `index.php` on Apache.

---

## Files

```
php-mysql/
├── public/index.php           front controller: request in, [status, headers, body] out
├── public/.htaccess           Apache rewrite to the front controller
├── src/Module.php             the contract, the data API, CORS and the tenant gate
├── src/Content.php            content files, token substitution, i18n, assets
├── src/Auth.php               TrustLogin checkrkey (+ APCu cache when available), mock session
├── src/Store.php              MySQL through PDO, always scoped to the current business
├── src/Config.php             configuration from environment / .env
├── sql/schema.sql             the notes table
├── menu/ pages/ widgets/ sidebars/ assets/ i18n/   same content as example 1
├── dev/shell.html             local shell simulator (development only)
├── tests/check_widgets.php    rule checker
├── tests/smoke_test.php       end-to-end smoke test
├── docker-compose.yml, docker/Dockerfile
└── .env.sample
```

---

## Routes

| Route | Returns |
|---|---|
| `notes/:rkey/:culture/:device/menu` | menu JSON |
| `notes/:rkey/:culture/:device/page/:pageID` | page JSON |
| `notes/:rkey/:culture/:device/widget/:widgetID` | widget HTML |
| `notes/:rkey/:culture/:device/widget/asset/:fileName` | asset |
| `notes/asset/:fileName` | asset |
| `notes/:rkey/:culture/:device/sidebarMenu/:pageID` (and `sidebarmenu`) | sidebar JSON |
| `GET notes/:rkey/api/notes` | `{"notes": [...], "count": n}` |
| `POST notes/:rkey/api/notes` | `{"note": {...}}` — body `{"title", "body"}` |
| `DELETE notes/:rkey/api/notes/:noteID` | `{"deleted": id}` |
| `OPTIONS` on any route | CORS preflight — 204 for an allowed origin, 403 otherwise |
| `dev/shell` | simulator — only when `NOTES_DEV_SHELL=1` |

---

## How it meets the contract

| Requirement | Where |
|---|---|
| Session validated on every non-asset route; `Invalid rKey` with 401 on failure | `Auth::check`, `Module::handle` |
| Scope by the **current** business, never the home one | `$scope['currentDmnid']` in every `Store` query |
| Soft tenant gate: `{"nodes":[]}` / `{}` / `""` | `Module::allowed` |
| CORS only for allowed panel origins; other origins refused with 403 | `Module::corsHeaders` |
| `mid` never hard-coded: `"[##mid##]"` → `NOTES_MODULE_ID` as a number | `Content::json` |
| Device matched case-insensitively; missing sidebar → empty nodes | `Content::path`, `Module::contract` |
| Asset route: single segment, css/js/json/svg, text only, no tokens | `Content::asset` |
| SQL injection | prepared statements only, `PDO::ATTR_EMULATE_PREPARES` off |
| Unicode | `utf8mb4` connection and table — Persian text round-trips |
| Seven widget rules | `widgets/desktop/*.html`, checked by `tests/check_widgets.php` |

---

## Going to production

1. Register the module (level, prefix `notes`, address) and receive its `mid`.
2. Set `NOTES_MODULE_ID`, `NOTES_ALLOWED_DMN_IDS`, `NOTES_ALLOWED_ORIGINS`,
   `NOTES_PUBLIC_BASE_URL` (HTTPS) and `NOTES_STYLESHEET_URL`.
3. Set `NOTES_MOCK_AUTH=0` and `NOTES_DEV_SHELL=0`.
4. Give the database user only `SELECT, INSERT, DELETE` on `notes`.
5. Move the rules of `assets/notes.css` into the shared stylesheet.
6. Enable APCu to cache session checks for 60 seconds (optional).
7. Deploy through CI; check the build markers in the browser console.
