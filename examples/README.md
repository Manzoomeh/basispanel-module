# Examples

Working BasisPanel modules, one folder per technology. Every example implements the **same
contract** from [AGENTS.md](../AGENTS.md) — the six routes, session validation, tenant scoping and
the seven widget rules — so they can be compared side by side.

## Index

| # | Folder | Technology | Database | What it shows | Status |
|---|---|---|---|---|---|
| 1 | [edge-basiscore-sqlite](edge-basiscore-sqlite/) | Python · [BasisCore.Server.Edge](https://github.com/Manzoomeh/BasisCore.Server.Edge) (`bclib` 4.0) | SQLite | Notes app: menu, 2 pages, 3 widgets, sidebar, CRUD API, English + Persian | Tested locally |
| 2 | [node-basiscore-server-sqlite](node-basiscore-server-sqlite/) | Node.js · [BasisCore.Server.Node](https://github.com/Manzoomeh/BasisCore.Server.Node) (`basiscore.server` 2.0) | SQLite (`node:sqlite`) | Same Notes app; module contract as the server's routing connection; one widget rendered on the server by the BasisCore engine (`dbsource` + `print`) | Tested locally |
| 3 | [php-mysql](php-mysql/) | PHP 8.2+ · plain PHP, no framework (Apache or built-in server; Docker Compose included) | MySQL 8 / MariaDB | Same Notes app with PDO prepared statements, own CORS handling, utf8mb4 | Tested locally (PHP 8.3 + MariaDB 11.4) |

More technologies will be added here.

## Folder convention

```
examples/<technology>-<database>/
├── README.md             quick start, routes, how the contract is met
├── menu/<device>/menu.json
├── pages/<device>/<pid>.json
├── widgets/<device>/<widgetID>.html   (or .il.json — BasisCore IL, example 2)
├── sidebars/<device>/<pid>.json     (optional)
├── assets/
├── i18n/                 labels per culture
├── dev/                  local shell simulator
├── tests/                rule checker and smoke test
└── .env.sample
```

The content folders (`menu`, `pages`, `widgets`, `sidebars`) are part of the contract and keep the
same shape in every technology; only the service code differs.
