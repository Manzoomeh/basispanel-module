"""Handlers for the Notes module.

Content files live in four folders; the folder tree is the API:

    menu/<device>/menu.json         pages/<device>/<pageID>.json
    widgets/<device>/<widgetID>.html  sidebars/<device>/<pageID>.json

Token substitution is done here, in Python, so the module behaves the same whether it is served
directly or behind the BasisCore web server:

    JSON files   "[##mid##]"  "[##dmnid##]"  [##rkey##]  [##t.<key>##]
    widgets      [##cms.cms.rkey|cms.cookie.rkey##]  [##cms.cms.dmnid##]
                 [##module.baseurl##]  [##module.stylesheet##]  [##module.culture##]
                 [##module.dir##]  [##t.<key>##]
"""
import html
import json
import re
from pathlib import Path

from bclib.context import HttpContext, RESTfulContext
from bclib.exception import BadRequestErr, NotFoundErr
from bclib.utility import ResponseTypes

import notes_store as store
from notes_auth import Scope, check_rkey_async
from notes_config import CONFIG, ROOT

_SEGMENT = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
_ASSET_NAME = re.compile(r"^[A-Za-z0-9_.-]{1,128}$")
_ASSET_MIME = {".css": "text/css", ".js": "application/javascript",
               ".json": "application/json", ".svg": "image/svg+xml"}
_RTL_CULTURES = {"fa", "ar", "he", "ur"}
_TRANSLATION_TOKEN = re.compile(r"\[##t\.([A-Za-z0-9_.]+)##\]")
_translations: dict[str, dict[str, str]] = {}


# ---------------------------------------------------------------- helpers

def _segment(context, name: str) -> str:
    value = str(context.url_segments.get(name) or "")
    if not _SEGMENT.match(value):
        raise NotFoundErr(f"invalid {name}")
    return value


def _culture(context) -> str:
    culture = str(context.url_segments.get("culture") or "en").lower()
    return culture if (ROOT / "i18n" / f"{culture}.json").is_file() else "en"


def _t(culture: str) -> dict[str, str]:
    if culture not in _translations:
        path = ROOT / "i18n" / f"{culture}.json"
        _translations[culture] = json.loads(path.read_text(encoding="utf-8"))
    return _translations[culture]


def _content_path(folder: str, device: str, name: str) -> Path:
    # Device folders are lower-case; the panel may send "Desktop".
    return ROOT / folder / device.lower() / name


def _cors(context) -> None:
    """Echo the Origin only when it is an allowed panel origin."""
    origin = str(context.cms.get("request", {}).get("origin") or "").rstrip("/")
    allowed = CONFIG.allowed_origins
    if CONFIG.dev_shell:
        allowed = allowed + (CONFIG.base_url,)
    if origin and origin in allowed:
        context.add_header("Access-Control-Allow-Origin", origin)
        context.add_header("Vary", "Origin")
        context.add_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        context.add_header("Access-Control-Allow-Headers", "Content-Type")


def _is_allowed(scope: Scope) -> bool:
    """Soft tenant gate: a business that is not allowed receives empty answers, not errors."""
    return not CONFIG.allowed_dmn_ids or scope.current_dmnid in CONFIG.allowed_dmn_ids


async def _scope_async(context) -> Scope:
    _cors(context)
    return await check_rkey_async(str(context.url_segments.get("rkey") or ""))


def _render_json(text: str, scope: Scope, culture: str) -> dict:
    translations = _t(culture)
    text = _TRANSLATION_TOKEN.sub(
        lambda match: json.dumps(translations.get(match.group(1), match.group(1)))[1:-1], text)
    # The quotes are part of the token: the result is a JSON number.
    text = text.replace('"[##mid##]"', str(CONFIG.module_id))
    text = text.replace('"[##dmnid##]"', str(scope.current_dmnid))
    text = text.replace("[##rkey##]", scope.rkey)
    return json.loads(text)


def _stylesheet_url() -> str:
    return CONFIG.stylesheet_url or f"{CONFIG.base_url}/{CONFIG.prefix}/asset/notes.css"


# ---------------------------------------------------------------- panel contract

async def get_menu_async(context: RESTfulContext) -> dict:
    scope = await _scope_async(context)
    if not _is_allowed(scope):
        return {"nodes": []}
    path = _content_path("menu", _segment(context, "device"), "menu.json")
    if not path.is_file():
        raise NotFoundErr("menu not found")
    return _render_json(path.read_text(encoding="utf-8"), scope, _culture(context))


async def get_page_async(context: RESTfulContext) -> dict:
    scope = await _scope_async(context)
    if not _is_allowed(scope):
        return {}
    path = _content_path("pages", _segment(context, "device"), f"{_segment(context, 'pageID')}.json")
    if not path.is_file():
        raise NotFoundErr("page not found")
    return _render_json(path.read_text(encoding="utf-8"), scope, _culture(context))


async def get_sidebar_async(context: RESTfulContext) -> dict:
    scope = await _scope_async(context)
    if not _is_allowed(scope):
        return {"nodes": []}
    path = _content_path("sidebars", _segment(context, "device"), f"{_segment(context, 'pageID')}.json")
    if not path.is_file():
        return {"nodes": []}  # a missing sidebar is normal
    return _render_json(path.read_text(encoding="utf-8"), scope, _culture(context))


async def get_widget_async(context: HttpContext) -> str:
    scope = await _scope_async(context)
    context.mime = "text/html; charset=utf-8"
    # Tokens are already substituted here, so the content is final.
    context.response_type = ResponseTypes.RENDERED
    if not _is_allowed(scope):
        return ""
    path = _content_path("widgets", _segment(context, "device"), f"{_segment(context, 'widgetID')}.html")
    if not path.is_file():
        raise NotFoundErr("widget not found")

    culture = _culture(context)
    translations = _t(culture)
    text = path.read_text(encoding="utf-8")
    text = _TRANSLATION_TOKEN.sub(
        lambda match: html.escape(translations.get(match.group(1), match.group(1))), text)
    replacements = {
        "[##cms.cms.rkey|cms.cookie.rkey##]": scope.rkey,
        "[##cms.cms.dmnid##]": str(scope.current_dmnid),
        "[##module.baseurl##]": f"{CONFIG.base_url}/{CONFIG.prefix}",
        "[##module.stylesheet##]": _stylesheet_url(),
        "[##module.culture##]": culture,
        "[##module.dir##]": "rtl" if culture in _RTL_CULTURES else "ltr",
    }
    for token, value in replacements.items():
        text = text.replace(token, value)
    return text


def get_asset(context: HttpContext) -> str:
    """Single path segment, text types only (css, js, json, svg), no authentication."""
    _cors(context)
    name = str(context.url_segments.get("fileName") or "")
    suffix = Path(name).suffix.lower()
    path = ROOT / "assets" / name
    if not _ASSET_NAME.match(name) or suffix not in _ASSET_MIME or not path.is_file():
        raise NotFoundErr("asset not found")
    context.mime = _ASSET_MIME[suffix]
    context.response_type = ResponseTypes.RENDERED  # never token-process an asset
    return path.read_text(encoding="utf-8")


# ---------------------------------------------------------------- module data API

def preflight(context: RESTfulContext) -> dict:
    _cors(context)
    return {}


async def list_notes_async(context: RESTfulContext) -> dict:
    scope = await _scope_async(context)
    if not _is_allowed(scope):
        return {"notes": [], "count": 0}
    notes = await store.list_async(scope.current_dmnid)
    return {"notes": notes, "count": await store.count_async(scope.current_dmnid)}


async def create_note_async(context: RESTfulContext) -> dict:
    scope = await _scope_async(context)
    if not _is_allowed(scope):
        raise NotFoundErr("module not available for this business")
    body = context.body if isinstance(context.body, dict) else {}
    title = str(body.get("title") or "").strip()
    text = str(body.get("body") or "").strip()
    if not 1 <= len(title) <= 200:
        raise BadRequestErr("title must be 1 to 200 characters")
    if len(text) > 4000:
        raise BadRequestErr("body must be at most 4000 characters")
    note = await store.create_async(scope.current_dmnid, scope.current_ownerid, scope.userid,
                                    title, text)
    return {"note": note}


async def delete_note_async(context: RESTfulContext) -> dict:
    scope = await _scope_async(context)
    if not _is_allowed(scope):
        raise NotFoundErr("module not available for this business")
    try:
        note_id = int(context.url_segments.get("noteID"))
    except (TypeError, ValueError):
        raise BadRequestErr("invalid note id")
    if not await store.delete_async(scope.current_dmnid, note_id):
        raise NotFoundErr("note not found")
    return {"deleted": note_id}


# ---------------------------------------------------------------- local development only

def get_dev_shell(context: HttpContext) -> str:
    context.mime = "text/html; charset=utf-8"
    context.response_type = ResponseTypes.RENDERED
    text = (ROOT / "dev" / "shell.html").read_text(encoding="utf-8")
    return text.replace("[##module.baseurl##]", f"{CONFIG.base_url}/{CONFIG.prefix}")
