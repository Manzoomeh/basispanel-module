# BasisPanel Module

> **Status: Phase 1 — test repository.** This README describes what a BasisPanel module is,
> everything the platform already gives a module for free, and the full technical surface a
> module works with. Working examples live in [examples/](examples/README.md), one per technology.
>
> **Building a module with an AI agent?** Give it [AGENTS.md](AGENTS.md) — the exact files, JSON
> formats, authentication, access control and independence rules a module must follow.

---

## Contents

1. [What a BasisPanel module is](#1-what-a-basispanel-module-is)
2. [Why build on it — any company can build its own software](#2-why-build-on-it--any-company-can-build-its-own-software)
3. [What the platform already provides](#3-what-the-platform-already-provides)
4. [Connecting to the rest of the ecosystem](#4-connecting-to-the-rest-of-the-ecosystem)
5. [Building modules with AI](#5-building-modules-with-ai)
6. [Technical reference — the full capability list](#6-technical-reference--the-full-capability-list)
7. [Phase 1 plan for this repository](#7-phase-1-plan-for-this-repository) — see also [Examples](examples/README.md)
8. [Honest limits](#8-honest-limits)
9. [Glossary](#9-glossary)

**Maturity legend** used throughout:

| Mark | Meaning |
|---|---|
| **Available** | Running in production today |
| **Partial** | Exists and works, but not every part is finished or exposed in the panel |
| **Planned** | Designed, not yet built |

---

## 1. What a BasisPanel module is

BasisPanel is a modular, multi-tenant operating panel. The panel itself — the *shell* — owns
login, navigation, the header, tenant switching, notifications, theming and layout. Everything a
business actually *does* in the panel is delivered by **modules**.

A module is a small HTTP service that answers four questions for the shell:

| The shell asks | Route | The module returns |
|---|---|---|
| Which menu entries do you contribute? | `menu` | A JSON tree of menu nodes |
| What is on page *N*? | `page/:pageID` | A JSON layout of widgets on a 12-column grid |
| What is the HTML of widget *N*? | `widget/:widgetID` | A self-contained HTML fragment |
| What is in the sidebar of page *N*? | `sidebarMenu/:pageID` | A JSON tree of sidebar nodes (optional) |

The shell fetches these over HTTP and places the result inside its own UI. A module owns **no
navigation, no session, no login and no styling framework** — it plugs into the shell's. That is
the whole idea: a module is pure business logic plus screens, and everything around it already
exists.

Any HTTP service that answers this contract becomes a panel module. Registration is **per tenant**:
each company or business can have its own module address, so the same module can serve many
customers, and a developer can point one tenant at a development copy without affecting anyone
else.

A module on disk is **four folders and one service file** — the folder tree *is* the API:

```
<module_root>/
├── <name>_predicates.py          routes + service options (entry point)
├── <name>_methods.py             handlers
├── menu/desktop/menu.json        menu contribution
├── pages/desktop/<pageID>.json   page layouts
├── widgets/desktop/<widgetID>.html
├── sidebars/desktop/<pageID>.json   (optional)
└── assets/                        (only in the module that serves shared assets)
```

---

## 2. Why build on it — any company can build its own software

Building business software normally means building the same foundation again and again: user
accounts, login, companies and branches, roles and permissions, menus, a dashboard, notifications,
file storage, multiple languages, right-to-left layout, hosting, domains, certificates, and now an
AI layer. That foundation is usually 60–80% of the work before the first real feature ships.

**In BasisPanel that foundation is already built, running, and shared.** A new module starts on
top of it and only has to express the business itself — its data, its screens, its rules.

This has three consequences:

1. **Any company can have its own software.** An accounting firm, a clinic, a school, a
   manufacturer, a shop or a logistics company can describe what it needs and get a module that
   lives inside the same panel as everything else it uses — same login, same users, same
   permissions, same look.
2. **AI can build most of it.** The module contract is small, file-based and declarative (JSON
   menus, JSON page layouts, self-contained HTML widgets, plain Python handlers). That is exactly
   the shape an AI coding assistant handles well: every file is small, every rule is checkable,
   and the platform — not the generated code — handles security, tenancy and navigation. See §5.
3. **It is proven, not theoretical.** Eight production modules already run on this contract, and
   several more are in development (CRM v3, the AI assistant manager, network endpoints, workers,
   the site builder family). A new module joins an ecosystem that is already in daily use.

### One integrated, multi-language, multi-region environment

- **One identity everywhere.** A single login (TrustLogin) works across every level and every
  module.
- **Multi-language by design.** The culture (language) is part of every module URL, the session
  carries a language id, and the shell stamps text direction (right-to-left or left-to-right) on
  every component. A module serves each language from the same code.
- **Multi-device.** The device is part of every module URL; the platform defines device profiles
  (Desktop, Tablet and others) and a module can ship a layout per device.
- **Multi-region deployment.** Modules are ordinary HTTP services and can be deployed wherever
  the customer needs them; the platform's network-endpoint service already models regional
  endpoints (for example Tehran and Dubai) with domain, port, certificate and routing — *Partial*.
- **Multi-tenant.** Every request is scoped to the tenant that is selected right now; data from
  one company or business never leaks into another.

---

## 3. What the platform already provides

Everything in this section is supplied by the platform. A module **uses** it; it does not build it.

### 3.1 Identity, access and tenancy

| Capability | Maturity | What a module gets |
|---|---|---|
| Single sign-on (TrustLogin) | Available | One login for every level and module; session key (`rkey`) passed to the module on every call |
| Session validation | Available | `checkrkey` validates the session and returns user id, home and **current** company/business, roles, user categories and language id |
| Three panel levels | Available | **User** (personal), **Company** (organisation / owner) and **Business** (a specific business or site). A module contributes to one level |
| Tenant switching | Available | The user switches company or business from the header; the module always receives the current selection |
| Tenant data isolation | Available | Every query is scoped by the session's company or business |
| Roles and job permissions | Available | User-group tree, positions, roles, per-job permission lists, company IP whitelist |
| Role-sensitive navigation | Available | Menu items are joined to user, group or role permissions; users see only what they may use |
| Plan-dependent features | Available | Plan facilities and role permissions gate features |
| Per-domain allow list | Available | A module can restrict itself to specific businesses (`ALLOWED_DMN_IDS`) |
| CORS handled per registered domain | Available | Browsers are allowed only from domains registered for the tenant |

### 3.2 The shell (user interface frame)

| Capability | Maturity | What a module gets |
|---|---|---|
| Menu and page loading | Available | The module declares menu nodes and page ids; the shell renders the menu and opens pages |
| Widget dashboard | Available | Customisable dashboard built from widgets |
| 12-column page grid | Available | Pages are JSON layouts of widgets on a responsive grid |
| Sidebars | Available | Per-page sidebar menus; the sidebar cycles full, semi and collapsed |
| Notification centre | Available | Real-time (WebSocket) notifications with unseen counts |
| Dark / light theme | Available | Theme toggle for every module |
| Right-to-left and left-to-right | Available | Direction stamped on every component from the culture |
| State restore | Available | The shell restores the last level, tenant and page after reload |
| Entity selectors | Available | Standard pickers for company, business and similar entities |
| Global search and command bar | Partial | Modules publish *intent catalogs* the shell runs from a command bar (⌘K); only CRM publishes intents so far |
| Panel-wide AI assistant | Available | Header assistant with cited answers (⌘J); turns free text into a validated intent |
| Settings area | Available | Settings at each level |
| In-product help | Available | AI help and intent-bar help |

### 3.3 Data, forms and content

| Capability | Maturity | What a module gets |
|---|---|---|
| Schema registry | Available | Data types defined as data (entity–attribute–value), versioned |
| Dynamic forms | Available | Forms generated from schemas, public forms with token and captcha, an AI form maker |
| BasisCore server language | Available | Server-side page language (data sources, lists, trees, QR codes, barcodes) compiled to an intermediate language |
| BasisCore client library | Available | 21 declarative browser commands (see §6.7) for data binding, charts, forms and API calls |
| File manager | Available | Foldered library with permissions and storage quota; sharing with customers by mobile or e-mail |
| Uploads | Available | A dedicated upload service |

### 3.4 Communication and daily work

| Capability | Maturity | What a module gets |
|---|---|---|
| SMS and e-mail | Available | Templated batches through the providers each company configures |
| Calendar, notes and reminders | Available | Personal and company calendars, event templates, shared notes |
| Cartable (work inbox) | Available | One inbox for tickets, processes and activities |
| Internal tickets | Available | Ticket receivers set per user group |

### 3.5 Web infrastructure

| Capability | Maturity | What a module gets |
|---|---|---|
| Hosting and domain administration | Available | Domains, WHOIS, redirects, cache, CDN monitoring, CSR/PFX generation, image optimisation |
| Site builder with AI | Available | AI page generation per language × device, with history and rollback |
| Design-system manifest | Available | Colour and font tokens, CSS layers, validation, history and restore |
| Site traffic analytics | Available | Filters by browser, device, city, URL and bots; links traffic changes to deployments |
| Network endpoints (regions) | Partial | Domain, port, certificate, routing and proxy per region |
| Workers and compute containers | Partial | Customer code served as an API under the customer's own site, with a secrets vault |

### 3.6 Artificial intelligence

| Capability | Maturity | What a module gets |
|---|---|---|
| AI provider broker (AIM) | Available | Provider accounts in an encrypted, write-only vault; named proxies; a model registry. **A module never holds an AI key** |
| AI credit wallet and usage ledger | Available | Prepaid credit debited per call, with cost reporting |
| Knowledge fed by modules | Available | A module pushes its own knowledge items into the assistant's knowledge sources |
| Card-flow engine | Available | Multi-step conversational flows with OTP, able to trigger a business process or create a CRM lead |
| Assistant permission policy | Available | Per-intent enable, risk level and confirmation |
| Weekly AI business brief | Available | Visits, deployments, unanswered comments, renewals, and suggested actions |

### 3.7 Operations and quality

| Capability | Maturity | What a module gets |
|---|---|---|
| Git → CI deployment | Available | Modules deploy through CI; no manual server copies |
| Performance standard | Available (documented) | Budgets for web services, widgets, pages, modules and caching |
| Event chain and error codes | Partial | A permanent id per interface and an occurrence id per error, recorded and notified |

---

## 4. Connecting to the rest of the ecosystem

A module is not an island. Because every module shares the same identity, tenant and client-side
messaging, a new module can work together with what already exists:

| Ecosystem member | Level | What a new module can do with it | Maturity |
|---|---|---|---|
| **CRM v3** | Company | Read and create leads and companies, sales lines on a kanban, forecasts, reports, imports | Available |
| **Basis.Chat / AI assistant** | Business | Publish intents, add knowledge, run card flows, receive leads from chat | Available |
| **AIM (AI manager)** | Platform | Call any registered AI model without handling keys; billed to the tenant's AI wallet | Available |
| **Schema service** | Platform | Store structured data and forms without designing tables | Available |
| **Finance** | Company | Financial features in the same panel | Available (production module) |
| **Task manager** | User / Company | Tasks alongside the module's own work | Available (production module) |
| **Trust / Service / Business** | All levels | User profile, company services, business list and settings | Available (production modules) |
| **Site builder family** | Business | Manifest, import, export, backup, initialiser | Available / Partial |
| **Network endpoints** | Business | Regional domains, ports, certificates, routing | Partial |
| **Workers** | Business | Customer code published as an API under the customer's site | Partial |
| **Calendar, notes, cartable, tickets, file manager** | User / Company | Shared daily-work surfaces | Available |
| **SMS and e-mail signalers** | Company | Notify customers from inside the module | Available |

Integration paths available to a module:

1. **Platform APIs** — the user, company and business APIs (about 45, 130 and 144 routes) and the
   upload API, called with the session key.
2. **Client-side messaging** — widgets publish and subscribe to named *client sources*; a widget
   from one module can react to data published by another on the same page (§6.8).
3. **AI intents and knowledge** — the module publishes what it can do; the panel assistant and
   the command bar can then call it by natural language.
4. **Shared design system** — one shared stylesheet and design tokens, so every module looks like
   part of one product.
5. **Ordinary HTTP** — a module is a normal service and can call any external system the business
   already uses (ERP, accounting, e-commerce, government services).

---

## 5. Building modules with AI

The module contract was shaped by real production work, and it happens to be ideal for
AI-assisted development:

- **Small, isolated files.** One widget is one HTML file; one page is one JSON file; one menu is
  one JSON file. An AI can generate, review and fix each one without holding the whole system in
  its head.
- **Declarative data binding.** BasisCore commands (`api`, `group`, `callback`, `print`, `list`,
  `chart`, `schema`, …) replace hand-written fetch-and-render code.
- **Checkable rules.** The seven widget rules (§6.6) are mechanical and can be verified by a
  script before deployment.
- **The platform does the dangerous parts.** Authentication, tenancy, permissions, CORS and AI keys
  are handled by the platform, not by generated code.
- **Existing AI skills.** Assistant skills already describe the module contract, the BasisCore
  server and client languages, the schema registry and the edge service, so an assistant works
  from verified rules rather than guesses.

A typical AI-assisted flow for a company:

1. Describe the business process in plain language (in any language).
2. The assistant proposes the data (schemas), the menu, the pages and the widgets.
3. The assistant generates the files; the rules are checked automatically.
4. The module is registered for the company's tenant — first in development mode for that tenant
   only — and tested inside the real panel.
5. Deploy through CI; publish intents and knowledge so the panel assistant can operate it.

---

## 6. Technical reference — the full capability list

### 6.1 Routes (the six-route contract)

```
<prefix>/:rkey/:culture/:device/menu                    restful  → JSON
<prefix>/:rkey/:culture/:device/page/:pageID            restful  → JSON
<prefix>/:rkey/:culture/:device/widget/:widgetID        web      → HTML
<prefix>/:rkey/:culture/:device/widget/asset/:fileName  web      → asset
<prefix>/asset/:fileName                                web      → asset
<prefix>/:rkey/:culture/:device/sidebarMenu/:pageID     restful  → JSON
```

- `<prefix>` is the module's public identity and must match its registration.
- `:rkey` is the session key; `:culture` the language; `:device` the device profile.
- **Router split:** `widget/` and `asset/` routes are *web* routes returning raw text with a MIME
  type; everything else is *restful* and returns JSON. A response of
  `Suitable handler not found for RESTfulContext!` means the request fell through to the restful
  router — almost always a route or prefix mistake, not a missing file.
- **Two response types only:** *renderable* for widgets (tokens are substituted) and *rendered*
  for assets (served untouched).

### 6.2 Service runtime

- Python edge service built on the `bclib` package (BasisCore.Server.Edge).
- Predicate router: `app.get`, `app.post`, `app.url`, `app.equal`, `app.in_list`, `app.match`.
- Action decorators for web, restful, client-source, server-source, socket, RabbitMQ and
  named-pipe handlers.
- Named database connections (`DbManager`), response caching, typed request contexts.
- Can run standalone locally, with no platform, for development.

### 6.3 Authentication, tenancy and CORS

- Every non-asset route validates the session with `check_rkey`.
- On success the widget tokens `[##cms.cms.rkey##]` and `[##cms.cms.dmnid##]` become available.
- On failure: `{"errorid":1,"message":"Invalid rKey"}` — widgets must handle an expired session.
- `ALLOWED_DMN_IDS` gates content **softly**: a business that is not allowed receives an empty
  menu, page or widget with status 200, not an error.
- Always scope by the **current** selection (`currentDmnid`, `currentOwnerid`), never the user's
  home value.
- CORS echoes the origin only for domains registered for the tenant.

### 6.4 Panel levels

| Level | API family | Scope identifier |
|---|---|---|
| User | `user` | `userid` |
| Company (owner) | `service` | `currentOwnerid` |
| Business (host) | `business` | `currentDmnid` |

The level is held in the session, not in the URL. A module contributes to one level.

### 6.5 Content files

- **`menu.json`** — a tree of nodes; every node carries the module id (`mid`) and, for pages, a
  page id (`pid`). A wrong `mid` makes the menu entry silently do nothing.
- **Page JSON** — a layout of widgets on a 12-column grid; `moduleid` must equal `mid`.
  Page tokens: `[##dmnid##]` (replaced including its quotes, becoming a number) and `[##rkey##]`.
- **Widget HTML** — one self-contained fragment per widget; no template engine, no includes.
- **Sidebar JSON** — optional per-page sidebar tree.
- **Devices** — one folder per device (`desktop/`, and others such as `tablet/`); a missing
  folder is a 404, not a fallback.

### 6.6 The seven widget rules

1. **No `<style>` block** — CSS lives in the shared stylesheet, scoped to the widget's root id.
2. **Absolute URLs only** — the shell rewrites relative paths against the panel origin.
3. **No external assets** — no public CDNs or web fonts; use project-hosted assets.
4. **No top-level `const` / `let`** — the shell re-injects widgets on navigation; use `var` and a
   stale-root guard. Test: concatenate the script with itself and syntax-check it.
5. **Unique root id** — every selector and DOM query starts from it.
6. **Build marker** — `window.<NAME>_BUILD = '…'`, readable from the console.
7. **Client commands carry `run="AtClient"`**, and no scheduler registration through such a block
   (background work is JavaScript only).

### 6.7 BasisCore client commands available in widgets

`print` · `list` · `view` · `tree` · `chart` · `schema` · `schemalist` · `schemauploader` ·
`inlinesource` · `dbsource` · `api` · `cookie` · `call` · `group` · `repeater` · `callback` ·
`input` · `select` · `form` · `component`

Plus `[##source.member.column##]` and `@expression@` bindings, `data-bc-*` DOM attributes, merge
strategies and source-triggered re-rendering.

### 6.8 Widget-to-widget messaging

- One widget publishes a named *client source*; any command that lists that name in `triggers`
  runs again.
- Two scopes: `owner.setSource` (same page group) and `$bc.setSource` (across groups and modules).
- Publish the data first, then the refresh pulse; namespace source names by feature.
- Supports selector/editor pages, master/detail screens and cross-module reactions.

### 6.9 Assets and styling

- One shared stylesheet for all modules; every widget links to it.
- The asset route serves a single path segment and text types (CSS, JS, JSON, SVG); fonts and
  images belong on the project CDN.
- Design tokens (colour, font) come from the platform design system.

### 6.10 The shell's DOM contract

- Rendered menu nodes carry `data-bc-mid` (module id), `data-bc-pid` (page id) and
  `data-bc-level` — a module can read its own id from the live page.
- Useful for browser tests, automation and debugging.

### 6.11 Deployment and operations

- Git → CI only; CI resets the server copy, so manual edits on servers are lost.
- Order: shared stylesheet first, then widgets.
- Verification: build marker in console, widget 200, stylesheet 200, no external font requests,
  menu entry opens the page.
- Per-tenant registration with a development override, so a tenant can test a new version without
  affecting others.

### 6.12 Performance budgets

Documented standards for measurement, web services, widgets, pages, modules and caching. Observed
production widget latency ranges from about 170 ms (fastest modules) upward; a module should aim
to stay in that range.

### 6.13 Security checklist

- Never write a session key (`rkey`) into a source file.
- Never store AI or provider keys in a module — use AIM.
- Never weaken `check_rkey` to work around an expired session; handle it in the widget.
- Never guess a `mid`, `pid`, prefix, port or business id — these are registration data.

---

## 7. Phase 1 plan for this repository

| Step | Deliverable | Status |
|---|---|---|
| 1 | This README — scope and capability list | Done |
| 2 | Module skeleton: service file, the six routes, four content folders | Done — [example 1](examples/edge-basiscore-sqlite/) |
| 3 | Menu, pages and widgets that show data of the current tenant | Done — Notes module, SQLite |
| 4 | Rule checker for the seven widget rules | Done — `tests/check_widgets.py` |
| 5 | Local run without the platform (mock session + shell simulator) | Done — `/dev/shell` |
| 6 | Registration request for one test tenant (module id, prefix, address) | To do — needs platform owner |
| 7 | CI deployment and verification checklist | To do |

Registration values (module id, page ids, prefix, address, allowed businesses) are platform data
and will be filled in only from the registration record — never guessed.

---

## 8. Honest limits

- Maturity marks describe the state at the time of writing; *Partial* items are not finished.
- Whether the shell actually requests the `tablet` device in production has not been observed.
- The intent command bar is live, but only CRM publishes intents so far.
- Regional endpoints and workers are running services whose panel surfaces are not finished.
- The panel's culture currently comes from host configuration; per-user language preference is
  stored but not yet applied everywhere.

---

## 9. Glossary

| Term | Meaning |
|---|---|
| Shell | The BasisPanel frame: login, header, menu, tenant switching, layout |
| Module | An HTTP service that answers the six-route contract |
| Widget | One self-contained HTML fragment placed on a page |
| `rkey` | The session key issued by TrustLogin |
| `mid` | Module id, assigned at registration |
| `pid` | Page id inside a module |
| `dmnid` | Business (domain) id |
| Level | User, Company or Business panel |
| Client source | A named value widgets publish and subscribe to |
| AIM | The AI provider broker and wallet |
| Culture | The language segment of a module URL |
