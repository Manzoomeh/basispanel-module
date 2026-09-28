"""Notes — a BasisPanel module built on BasisCore.Server.Edge (bclib 4.x) and SQLite.

Entry point. Declares the service options and every route of the module:

    the six-route panel contract   menu, page, widget, widget asset, asset, sidebarMenu
    the module's own data API      notes list / create / delete (+ CORS preflight)
    a local shell simulator        dev/shell (only when NOTES_DEV_SHELL=1)

Run:  python notes_predicates.py
"""
import asyncio
import os

# The event loop must exist before bclib is imported (some Python builds).
try:
    asyncio.get_event_loop()
except RuntimeError:
    asyncio.set_event_loop(asyncio.new_event_loop())

from bclib import edge  # noqa: E402
from bclib.context import HttpContext, RESTfulContext  # noqa: E402

import notes_methods as m  # noqa: E402
from notes_config import CONFIG  # noqa: E402

P = CONFIG.prefix  # the module's public identity; must match its registration

app = edge.from_options({
    "name": CONFIG.prefix,
    "http": f"{CONFIG.host}:{CONFIG.port}",
    "log_request": CONFIG.log_request,
    "log_error": True,
})


# ---------------------------------------------------------------- panel contract (restful)

@app.restful_handler(app.get(f"{P}/:rkey/:culture/:device/menu"))
async def menu(context: RESTfulContext):
    return await m.get_menu_async(context)


@app.restful_handler(app.get(f"{P}/:rkey/:culture/:device/page/:pageID"))
async def page(context: RESTfulContext):
    return await m.get_page_async(context)


# The panel calls sidebarMenu with a capital M; accept the lower-case form too.
@app.restful_handler(app.any(
    app.get(f"{P}/:rkey/:culture/:device/sidebarMenu/:pageID"),
    app.get(f"{P}/:rkey/:culture/:device/sidebarmenu/:pageID"),
))
async def sidebar(context: RESTfulContext):
    return await m.get_sidebar_async(context)


# ---------------------------------------------------------------- panel contract (web)
# Order matters: the asset routes are more specific than widget/:widgetID.

@app.web_handler(app.get(f"{P}/:rkey/:culture/:device/widget/asset/:fileName"))
def widget_asset(context: HttpContext):
    return m.get_asset(context)


@app.web_handler(app.get(f"{P}/asset/:fileName"))
def asset(context: HttpContext):
    return m.get_asset(context)


@app.web_handler(app.get(f"{P}/:rkey/:culture/:device/widget/:widgetID"))
async def widget(context: HttpContext):
    return await m.get_widget_async(context)


# ---------------------------------------------------------------- module data API

@app.restful_handler(app.all(app.url(f"{P}/:rkey/api/notes"), app.is_options()))
def notes_preflight(context: RESTfulContext):
    return m.preflight(context)


@app.restful_handler(app.all(app.url(f"{P}/:rkey/api/notes/:noteID"), app.is_options()))
def note_preflight(context: RESTfulContext):
    return m.preflight(context)


@app.restful_handler(app.get(f"{P}/:rkey/api/notes"))
async def list_notes(context: RESTfulContext):
    return await m.list_notes_async(context)


@app.restful_handler(app.post(f"{P}/:rkey/api/notes"))
async def create_note(context: RESTfulContext):
    return await m.create_note_async(context)


@app.restful_handler(app.delete(f"{P}/:rkey/api/notes/:noteID"))
async def delete_note(context: RESTfulContext):
    return await m.delete_note_async(context)


# ---------------------------------------------------------------- local development only

if CONFIG.dev_shell:
    @app.web_handler(app.get("dev/shell"))
    def dev_shell(context: HttpContext):
        return m.get_dev_shell(context)


if __name__ == "__main__":
    print(f"{CONFIG.prefix} listening on http://{CONFIG.host}:{CONFIG.port}/")
    if CONFIG.dev_shell:
        print(f"shell simulator:  http://{CONFIG.host}:{CONFIG.port}/dev/shell")
    if os.getenv("BC_EDGE_NO_LISTEN", "").strip() != "1":
        app.listening()
