"""Configuration, read from environment variables (and an optional .env file beside this one).

Registration values (module id, prefix, allowed businesses) are platform data. They are never
guessed: until the module is registered, MODULE_ID stays 0 and the module is only usable through
the local shell simulator.
"""
import os
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def _load_dotenv(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def _flag(name: str, default: str = "0") -> bool:
    return os.getenv(name, default).strip().lower() in ("1", "true", "yes", "on")


def _int_set(name: str) -> frozenset[int]:
    raw = os.getenv(name, "").replace(";", ",")
    return frozenset(int(x) for x in raw.split(",") if x.strip())


def _str_list(name: str) -> tuple[str, ...]:
    return tuple(x.strip().rstrip("/") for x in os.getenv(name, "").split(",") if x.strip())


_load_dotenv(ROOT / ".env")


@dataclass(frozen=True)
class Config:
    prefix: str = os.getenv("NOTES_PREFIX", "notes")
    host: str = os.getenv("NOTES_HOST", "127.0.0.1")
    port: int = int(os.getenv("NOTES_PORT", "8790"))
    # Absolute base URL the browser uses to reach this service (widget rule R2).
    public_base_url: str = os.getenv("NOTES_PUBLIC_BASE_URL", "").rstrip("/")
    # Registered module id (mid). 0 = not registered yet.
    module_id: int = int(os.getenv("NOTES_MODULE_ID", "0"))
    # Businesses (currentDmnid) the module answers. Empty = no gate (development only).
    allowed_dmn_ids: frozenset[int] = field(default_factory=lambda: _int_set("NOTES_ALLOWED_DMN_IDS"))
    # Browser origins allowed to call this service (the panel's origin).
    allowed_origins: tuple[str, ...] = field(default_factory=lambda: _str_list("NOTES_ALLOWED_ORIGINS"))
    # TrustLogin session validation endpoint; the session key is appended.
    check_rkey_api: str = os.getenv("CHECK_RKEY_API", "https://api.trust-login.com/checkrkey/")
    # Accept the session key "dev" without calling TrustLogin. Never enable in production.
    mock_auth: bool = _flag("NOTES_MOCK_AUTH")
    # Serve the local shell simulator at /dev/shell. Never enable in production.
    dev_shell: bool = _flag("NOTES_DEV_SHELL")
    # Shared platform stylesheet. Empty = use this module's own demo stylesheet.
    stylesheet_url: str = os.getenv("NOTES_STYLESHEET_URL", "")
    db_path: Path = Path(os.getenv("NOTES_DB_PATH", str(ROOT / "data" / "notes.sqlite3")))
    log_request: bool = _flag("NOTES_LOG_REQUEST", "1")

    @property
    def base_url(self) -> str:
        return self.public_base_url or f"http://{self.host}:{self.port}"


CONFIG = Config()
