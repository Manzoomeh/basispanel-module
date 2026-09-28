# AGENTS.md — Building a BasisPanel Module

> **Audience:** AI coding agents (and the humans steering them).
> **Purpose:** the exact outputs an application must produce so that BasisPanel can load it as a
> module, how users are authenticated, how access is controlled, and how the module stays
> independent of the platform.
> **Companion:** [README.md](README.md) explains *what* the platform provides. This file tells you
> *what to build*.

---

## 0. Read this first — rules an agent must never break

1. **Never invent registration data.** The module id (`mid`), page ids (`pid`), route prefix,
   service address and allowed business ids are assigned when the module is registered. If you do
   not have a value, leave a clearly marked placeholder and say so. A guessed value fails
   **silently** — the menu entry simply does nothing.
2. **Never write a session key into a file.** Use the tokens in §4.3. A real key in source is a
   leaked credential.
3. **Never store AI or third-party provider keys in the module.** Use the platform AI broker (AIM)
   or the tenant's configured providers.
4. **Never weaken authentication** to make something work. An expired session is handled in the
   widget, not by skipping the check.
5. **Follow the seven widget rules (§5.4) on every widget.** They are checkable; check them.
6. **Scope every data access to the current tenant** (§6.3). Never to the user's home tenant and
   never to "all".

---

## 1. Who can build a module, and why

**Any company can build a BasisPanel module** — for its own use, for its customers, or as a product
to earn revenue. The platform is open to third-party modules by design: any HTTP service that
answers the contract in this file becomes a panel module.

A module built by a third party:

- **belongs to its author** — the code, the hosting, the data model and the release schedule;
- **runs on the author's own infrastructure**, in any region, and is reached by the panel over
  HTTPS;
- **inherits the platform** — single sign-on, tenants, permissions, menus, notifications,
  multi-language, theming and the AI layer — without rebuilding any of it;
- **can be offered to other businesses through the BasisPanel marketplace**, where tenants
  discover modules and activate them for their company or business.

> **Marketplace maturity (honest status):** the module catalogue and per-tenant activation are
> available today; a tenant links a module by address, and developers can override the address
> for one tenant while testing. Public listing pages, developer attribution, categories, version
> display and store pricing are **being built**. Design your module so it is ready for them: carry
> a version (§8.2) and keep your own release notes.

Typical motivations: selling a vertical application (clinic, school, workshop, logistics,
agency…), packaging an integration with an existing system (ERP, accounting, e-commerce, public
services), or giving a customer bespoke software that still lives inside the panel they use.

---

## 2. The deliverables — what the app must output

A BasisPanel module is **one HTTP service plus four content folders**. The folder tree *is* the
API. Produce exactly this:

```
<module_root>/
├── <name>_predicates.py            service entry point: routes and options
├── <name>_methods.py               handlers
├── menu/
│   └── desktop/menu.json           REQUIRED — the menu contribution
├── pages/
│   └── desktop/<pid>.json          REQUIRED — one file per page
├── widgets/
│   └── desktop/<widgetID>.html     REQUIRED — one file per widget
├── sidebars/
│   └── desktop/<pid>.json          OPTIONAL — secondary navigation per page
├── .env.sample                     bind address, port, allowed businesses (no secrets)
├── README.md                       what the module does
└── CHANGELOG.md                    internal release history
```

- `desktop` is the **device** segment. Other devices (for example `tablet`) are sibling folders.
  A missing device folder answers 404 — there is no fallback. Plan for `tablet/` as well.
- Live URLs may carry the device capitalised (`Desktop`). Match the device segment
  case-insensitively.
- The reference implementation is a Python edge service on the `bclib` package. Any stack is
  acceptable **if** it reproduces the routes, response shapes and behaviour below exactly.

### Checklist — a module is complete when

- [ ] the six routes in §3 answer as specified
- [ ] `menu.json` exists and every node carries the registered `mid`
- [ ] every `pid` in the menu has a page file, and every widget id in a page has a widget file
- [ ] every widget passes the seven rules
- [ ] every non-asset route validates the session
- [ ] every data query is scoped to the current tenant
- [ ] no session key, password or provider key appears in any file
- [ ] a version string is exposed (§8.2)

---

## 3. Routes — the contract

```
GET <prefix>/:rkey/:culture/:device/menu                     restful → JSON
GET <prefix>/:rkey/:culture/:device/page/:pageID             restful → JSON
GET <prefix>/:rkey/:culture/:device/widget/:widgetID         web     → HTML
GET <prefix>/:rkey/:culture/:device/widget/asset/:fileName   web     → asset
GET <prefix>/asset/:fileName                                 web     → asset
GET <prefix>/:rkey/:culture/:device/sidebarMenu/:pageID      restful → JSON
```

| Segment | Meaning |
|---|---|
| `<prefix>` | The module's public name. Must match its registration. Not a folder |
| `:rkey` | The user's session key, issued by TrustLogin |
| `:culture` | Language, for example `fa` or `en` |
| `:device` | Device profile, for example `Desktop` |

Implementation rules:

- **Accept both `sidebarMenu` and `sidebarmenu`.** The panel calls the capital-M form.
- **Router split.** Paths containing `widget/` or `asset/` are *web* routes: return raw text with a
  MIME type. Everything else is *restful*: return a JSON object. In `bclib`:

  ```python
  "router": {
      "web":     [r"(^|/)widget/", r"(^|/)asset/"],
      "restful": [r".*"],
  },
  "defaultRouter": "restful",
  ```

- **Two response types only.** Widgets are *renderable* (the platform substitutes `[##…##]`
  tokens). Assets are *rendered* (served untouched — a stylesheet must never be token-processed).
- The error `{"errorCode":"http-404","errorMessage":"Suitable handler not found for RESTfulContext!"}`
  means the request fell through to the restful router and matched nothing: a route or prefix
  mistake, not a missing file.
- A module may add **its own API routes** (for its data and actions) beside the six. They follow
  the same authentication and tenancy rules.

---

## 4. Authentication — how users are identified

### 4.1 The model

The module **never** logs anyone in and never sees a password. The user signs in once through
**TrustLogin**, the platform's single sign-on. The panel then calls the module with the session key
in the URL (`:rkey`). The module validates that key on every request.

```
user ──login──▶ TrustLogin ──rkey──▶ BasisPanel shell ──GET …/:rkey/…──▶ your module
                                                                           │
                                          checkrkey(rkey) ◀────────────────┘
```

### 4.2 Validating the session

Every route except the two asset routes must call the TrustLogin `checkrkey` service before doing
anything else. In `bclib` this is a route callback:

```python
app.callback(check_rkey_async)
```

A valid session returns the caller's identity and scope:

```json
{
  "checked": true,
  "rkey": "<session key>",
  "userid": 0,
  "ownerid": 0,
  "dmnid": 0,
  "currentOwnerid": 0,
  "currentDmnid": 0,
  "userroles": [{ "catid": 0, "roleid": 0 }],
  "usercat": "0,1",
  "lid": 0
}
```

| Field | Meaning |
|---|---|
| `userid` | The signed-in user |
| `ownerid`, `dmnid` | The user's **home** company and business — do **not** use for scoping |
| `currentOwnerid`, `currentDmnid` | The company and business **selected right now** — use these |
| `userroles`, `usercat` | Roles and user categories, for your own authorisation |
| `lid` | Language id of the session |

On success, store the key and the current business id in the request context so widgets can use
them:

```python
context.cms.cms["rkey"]  = check_rkey.rkey
context.cms.cms["dmnid"] = str(check_rkey.currentDmnid or "")
```

On failure, answer:

```json
{ "errorid": 1, "message": "Invalid rKey" }
```

### 4.3 Tokens — never hard-code identity

| Where | Token | Resolves to |
|---|---|---|
| Widget HTML | `[##cms.cms.rkey\|cms.cookie.rkey##]` | Session key (cookie fallback) |
| Widget HTML | `[##cms.cms.dmnid##]` | Current business id |
| Page JSON | `[##rkey##]` | Session key |
| Page JSON | `"[##dmnid##]"` | Current business id — **the quotes are part of the token**; the result is a JSON number |

Tokens in widgets and tokens in pages are different families. Do not mix them.

### 4.4 Expired sessions

An expired key produces `Invalid rKey`. Widgets must detect this on their API calls and show a
clear "session expired — sign in again" state instead of a raw error.

---

## 5. Output formats

### 5.1 `menu/<device>/menu.json`

```json
{
  "nodes": [
    {
      "title": "My Module",
      "image": "asset/images/my-module.svg",
      "mid": "<MID>",
      "nodes": [
        { "title": "Dashboard", "mid": "<MID>", "pid": "<PID_DASHBOARD>" },
        { "title": "Records",   "mid": "<MID>", "pid": "<PID_RECORDS>" },
        { "title": "Settings",  "mid": "<MID>", "pid": "<PID_SETTINGS>" }
      ]
    }
  ]
}
```

| Field | Rule |
|---|---|
| `title` | Label shown in the panel (translate per culture) |
| `mid` | Module id — **identical on every node**, equal to the registered value, a JSON number in the real file |
| `pid` | Page id → `pages/<device>/<pid>.json`. A node without `pid` is a group header and opens nothing |
| `image` | Optional icon, relative to the module's asset route |
| `nodes` | Children; one nesting level is the norm |

`<MID>` and `<PID_*>` above are placeholders. Replace them only with registered numbers.

### 5.2 `pages/<device>/<pid>.json`

```json
{
  "container": "container",
  "title": "",
  "customizable": true,
  "groups": [
    {
      "groupname": "my_module_dashboard",
      "options": {},
      "widgets": [
        {
          "id": "<WIDGET_ID>",
          "title": null,
          "name": "",
          "moduleid": "<MID>",
          "isPrimary": true,
          "x": 0, "y": 0, "w": 12, "h": 12,
          "container": "fullPageWidget",
          "widgetName": "MyModule_Dashboard"
        }
      ]
    }
  ]
}
```

| Field | Rule |
|---|---|
| `groups[]` | Widgets in one group can message each other with the owner scope (§7) |
| `id` | Widget id → `widgets/<device>/<id>.html` |
| `moduleid` | **Must equal `mid`** |
| `isPrimary` | The widget that owns the page |
| `x, y, w, h` | Position on a **12-column** grid; `w: 12` is full width |
| `container` | `fullPageWidget` for a single full-page widget; a normal container for a grid |
| `widgetName` | Human-readable key for diagnostics; not used to find the file |

For a grid page, put several objects in `widgets[]`, each with its own `x/y/w/h`.

### 5.3 `widgets/<device>/<widgetID>.html`

One widget is **one self-contained HTML file** — no template engine, no includes. Skeleton:

```html
<link rel="stylesheet" href="<SHARED_STYLESHEET_URL>"/>

<div id="myModuleDashboardWidget">
  <!-- markup; every selector starts from this root id -->
</div>

<script>
  window.MY_MODULE_DASHBOARD_BUILD = '0.1.0';

  (function () {
    var roots = document.querySelectorAll('#myModuleDashboardWidget');
    for (var i = 0; i < roots.length - 1; i++) { try { roots[i].remove(); } catch (e) {} }
  })();

  var ROOT = (function () {
    var roots = document.querySelectorAll('#myModuleDashboardWidget');
    return roots[roots.length - 1] || null;
  })();

  var RKEY  = '[##cms.cms.rkey|cms.cookie.rkey##]';
  var DMNID = '[##cms.cms.dmnid##]';
  // fetch data from your module's own API with absolute URLs, scoped by RKEY
</script>
```

`<SHARED_STYLESHEET_URL>` is the platform's shared stylesheet. **Copy it verbatim from an existing
widget or from your registration record — never construct it.**

### 5.4 The seven widget rules

| # | Rule | Why |
|---|---|---|
| R1 | **No `<style>` block.** CSS goes in the shared stylesheet, scoped to the root id. Only exception: CSS inside a JS string that builds a separate print/PDF document | The shell injects many widgets into one document |
| R2 | **Absolute URLs only** | The shell rewrites relative paths against the panel origin, not yours |
| R3 | **No external assets** — no public CDNs, no web-font services | Cross-origin fonts fail without CORS; use data-URIs or the project CDN |
| R4 | **No top-level `const` or `let`.** Use `var` and the stale-root guard above | The shell re-injects widgets on navigation; a redeclared `const` kills the whole script |
| R5 | **Unique root id**; every selector and query starts from it | Two widgets on one page are otherwise indistinguishable |
| R6 | **Build marker** `window.<NAME>_BUILD = '…'` | Answers "is the new code live?" from the console |
| R7 | **Browser-side `<basis>` commands carry `run="AtClient"`.** Never register scheduled background tasks through such a block | Tells the server renderer to leave them alone; scheduler markup crashes the sidebar |

Mechanical test for R4: concatenate the script with itself and syntax-check it
(`node --check`). It must pass.

### 5.5 `sidebars/<device>/<pid>.json` (optional)

Same shape as `menu.json` (`{"nodes": [...]}`). If the file does not exist, answer
`{"nodes": []}` — not 404. Add a sidebar only when a page needs secondary navigation.

### 5.6 Assets

- The asset route serves a **single path segment** (no sub-folders) and **text types only**:
  CSS, JS, JSON, SVG. Read files as UTF-8 text.
- Fonts and raster images go on a CDN with CORS, or inline as data-URIs.
- Styling uses the **shared** platform stylesheet and design tokens so every module looks like one
  product. A module adds its own rules to that stylesheet under its root ids.

### 5.7 BasisCore client commands you may use in widgets

`print` · `list` · `view` · `tree` · `chart` · `schema` · `schemalist` · `schemauploader` ·
`inlinesource` · `dbsource` · `api` · `cookie` · `call` · `group` · `repeater` · `callback` ·
`input` · `select` · `form` · `component`

Bind data with `[##source.member.column##]`; use plain JavaScript where a command does not fit.

---

## 6. Access control

Access is decided in **four layers**. The platform owns the first three; the module owns the
fourth.

### 6.1 Level — where the module appears

A module contributes to **one** panel level:

| Level | What it is | API family | Scope id |
|---|---|---|---|
| User | Personal tools of the signed-in person | `user` | `userid` |
| Company (owner) | An organisation and its staff | `service` | `currentOwnerid` |
| Business (host) | One business or site of a company | `business` | `currentDmnid` |

The level is held in the session, not the URL. Users switch company and business from the panel
header; your module always receives the current selection.

### 6.2 Registration and activation — who gets the module

- A module is registered with its `mid`, prefix and address.
- Registration is **per tenant**: a company or business activates the module, and its address is
  stored for that tenant. The same module can therefore serve many customers, and a tenant can be
  pointed at a development copy without affecting others.
- **Menu visibility follows permissions:** menu items are joined to user, group and role
  permissions, so a user sees only entries they may use.

### 6.3 Tenant gate — which businesses the module answers

- The module may restrict itself to specific businesses with an allow list
  (`ALLOWED_DMN_IDS`, checked against `currentDmnid`).
- The gate is **soft**: a business that is not allowed receives an empty answer, not an error.

  | Route | Not-allowed answer |
  |---|---|
  | `menu` | `{"nodes": []}` |
  | `page` | `{}` |
  | `widget` | `""` |
  | `sidebarMenu` | `{"nodes": []}` |

- **CORS:** echo `Access-Control-Allow-Origin` only for domains registered for the tenant.
  A missing domain fails in the browser while `curl` still receives 200.

### 6.4 The module's own authorisation

Inside the module, decide what the user may do from `userid`, `userroles` and `usercat`, and
**scope every query to `currentOwnerid` / `currentDmnid`**. Never trust an id sent by the browser
over the one returned by `checkrkey`. Destructive actions need an explicit confirmation.

---

## 7. Integration with the ecosystem

- **Widget messaging.** A widget publishes a named *client source*; any command listing that name
  in `triggers` re-runs. `owner.setSource` reaches the same page group; `$bc.setSource` reaches
  across groups and modules. Publish data first, then the refresh pulse. Namespace names by
  feature (`mymodule.records`, `mymodule.refresh`) — shared generic names collide across modules.
- **Platform APIs.** User, company, business and upload APIs are called with the session key.
  Take each host from a working call; the API is split across hosts per route.
- **AI.** Call models through AIM (no keys in the module), push the module's help and knowledge to
  the assistant, and publish *intents* so the command bar and the panel assistant can operate the
  module by natural language.
- **Existing modules.** CRM, calendar, cartable, file manager, schema service and messaging
  signalers can be used from the same session. See README §4.

---

## 8. Independence — what the module owns

A BasisPanel module is **independent by construction**:

| Aspect | Independence |
|---|---|
| Code | Lives in the author's own repository. The platform never needs the source |
| Hosting | Runs on the author's servers, in any region, behind HTTPS |
| Data | The module owns its database and schema. It shares only identity and tenant scope with the platform |
| Release | Deployed on the author's schedule. The platform loads whatever the registered address serves |
| Technology | Any stack that honours the contract. `bclib` is the reference, not a requirement |
| Failure | Login and session stay with the platform. A module that follows the widget rules keeps its failures inside its own widgets; separate mode (§8.1) isolates it completely |

### 8.1 Two display modes

| Mode | Registration flag | Behaviour |
|---|---|---|
| **Integrated** | `multi: false` | Widgets are injected into the panel page. Full access to shared styles, messaging and tokens. The seven rules apply |
| **Separate** | `multi: true` | The module is shown in its own frame. Maximum isolation — useful for an existing web application that cannot follow the widget rules |

Prefer integrated mode for new modules; use separate mode to bring an existing application into
the panel quickly.

### 8.2 Versioning

Expose the module version publicly (for example an asset `release.json` and an About page) and keep
internal detail in `CHANGELOG.md`. Public release text announces the version and features; it must
never describe a security weakness.

---

## 9. Multi-language, multi-device, multi-region

- **Language:** `:culture` is in every URL and `lid` is in the session. Serve every label in the
  requested language; never hard-code one language in widgets.
- **Direction:** the shell stamps right-to-left or left-to-right on every component. Use logical
  CSS properties (`margin-inline-start`, not `margin-left`).
- **Device:** ship `desktop/` and plan `tablet/`.
- **Region:** deploy the service close to its users; the address is registered per tenant, so
  different customers can use different regional deployments.

---

## 10. Service configuration

| Variable | Purpose |
|---|---|
| `<MODULE>_HOST` / `<MODULE>_PORT` | Bind address and port — each module has its own port |
| `BC_EDGE_MODE` | `server` (standalone) or `endpoint` (behind a dispatcher) |
| `BC_EDGE_NO_LISTEN=1` | Import without listening — for tests and static checks |
| `CHECK_RKEY_API` | TrustLogin validation endpoint |
| `ALLOWED_DMN_IDS` | Allowed business ids (empty until registered) |

Keep real values out of the repository; commit only `.env.sample`.

---

## 11. Verification before release

1. Every route answers: menu, page, widget, sidebar (both spellings), assets.
2. An invalid `rkey` returns `Invalid rKey`; a not-allowed business returns the empty answers.
3. Every widget passes R1–R7; the R4 self-concatenation check passes.
4. Search the tree for anything that looks like a session key, password or provider key.
5. In the real panel: the build marker is visible in the console, the widget and stylesheet
   answer 200, no external font request appears, and the menu entry opens the page.
6. Deploy through CI only. Manual copies on a server are overwritten by the next deployment.

---

## 12. Questions to ask the owner instead of guessing

- Which **level** (user, company, business) does the module belong to?
- What are the registered **`mid`**, **prefix**, **page ids** and **address**?
- Which **businesses** may use it during testing?
- **Integrated** or **separate** display mode?
- Where is the **shared stylesheet** URL for this installation?
