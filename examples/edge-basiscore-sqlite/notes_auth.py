"""Session validation through TrustLogin (checkrkey).

The module never logs anyone in. The panel passes the session key (rkey) in the URL; this module
asks TrustLogin who the caller is and which company/business is selected right now.
"""
import asyncio
import re
import time
from dataclasses import dataclass

import aiohttp
from bclib.exception import UnauthorizedErr

from notes_config import CONFIG

_RKEY_PATTERN = re.compile(r"^[A-Za-z0-9-]{1,128}$")
_CACHE_SECONDS = 60
_cache: dict[str, tuple[float, "Scope"]] = {}
_lock = asyncio.Lock()


@dataclass(frozen=True)
class Scope:
    rkey: str
    userid: int
    current_ownerid: int  # the company selected right now
    current_dmnid: int    # the business selected right now
    lid: int              # language id of the session
    roles: tuple


def _invalid() -> UnauthorizedErr:
    return UnauthorizedErr(data={"errorid": 1, "message": "Invalid rKey"})


def _as_int(value) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


async def check_rkey_async(rkey: str) -> Scope:
    """Return the caller's scope, or raise UnauthorizedErr ('Invalid rKey')."""
    if not rkey or not _RKEY_PATTERN.match(rkey):
        raise _invalid()

    if CONFIG.mock_auth and rkey == "dev":
        return Scope(rkey="dev", userid=1, current_ownerid=1, current_dmnid=1, lid=1, roles=())

    now = time.monotonic()
    cached = _cache.get(rkey)
    if cached and cached[0] > now:
        return cached[1]

    async with _lock:
        try:
            timeout = aiohttp.ClientTimeout(total=10)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(CONFIG.check_rkey_api + rkey) as response:
                    if response.status != 200:
                        raise _invalid()
                    data = await response.json(content_type=None)
        except UnauthorizedErr:
            raise
        except Exception as ex:  # network failure: fail closed
            raise _invalid() from ex

    if not isinstance(data, dict) or not data.get("checked"):
        raise _invalid()

    # Always scope by the CURRENT selection, never by the user's home company/business.
    scope = Scope(
        rkey=rkey,
        userid=_as_int(data.get("userid")),
        current_ownerid=_as_int(data.get("currentOwnerid")),
        current_dmnid=_as_int(data.get("currentDmnid")),
        lid=_as_int(data.get("lid")),
        roles=tuple(data.get("userroles") or ()),
    )
    _cache[rkey] = (now + _CACHE_SECONDS, scope)
    return scope
