"""Check every widget against the seven widget rules and the content-file contract.

    python tests/check_widgets.py

Exit code 0 = all checks passed. Runs without the service and without the platform.
If Node.js is installed, R4 is also checked the mechanical way: the widget script is
concatenated with itself and syntax-checked, as the shell would effectively run it twice.
"""
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = re.compile(r"<script[^>]*>(.*?)</script>", re.S | re.I)
GUID = re.compile(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b", re.I)
failures: list[str] = []


def fail(where: str, rule: str, detail: str) -> None:
    failures.append(f"{where}: {rule} - {detail}")


def top_level_declarations(script: str) -> list[str]:
    """Return const/let declared at brace depth 0 (strings and comments ignored)."""
    cleaned = re.sub(r"//[^\n]*|/\*.*?\*/|'(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\"|`(?:\\.|[^`\\])*`",
                     "''", script, flags=re.S)
    depth, found = 0, []
    for token in re.finditer(r"[{}]|\b(?:const|let)\s+[A-Za-z_$][\w$]*", cleaned):
        text = token.group(0)
        if text == "{":
            depth += 1
        elif text == "}":
            depth -= 1
        elif depth == 0:
            found.append(text)
    return found


def check_widget(path: Path, node: str | None) -> None:
    where = path.relative_to(ROOT).as_posix()
    html = path.read_text(encoding="utf-8")
    markup = SCRIPT.sub("", html)
    scripts = "\n".join(SCRIPT.findall(html))

    if re.search(r"<style\b", markup, re.I):
        fail(where, "R1", "<style> block present")
    for url in re.findall(r"(?:src|href)\s*=\s*\"([^\"]+)\"", markup):
        if not (url.startswith(("http://", "https://", "[##", "#", "mailto:"))):
            fail(where, "R2", f"relative URL {url!r}")
    if re.search(r"fonts\.googleapis|fonts\.gstatic|cdnjs|jsdelivr|unpkg", html, re.I):
        fail(where, "R3", "external asset host")
    for declaration in top_level_declarations(scripts):
        fail(where, "R4", f"top-level {declaration!r}")
    ids = re.findall(r"<div[^>]*\bid=\"([^\"]+)\"", markup)
    if not ids:
        fail(where, "R5", "no root element with an id")
    elif f"'#{ids[0]}'" not in scripts and scripts.strip():
        fail(where, "R5", f"script does not query from root #{ids[0]}")
    if scripts.strip() and not re.search(r"window\.[A-Z0-9_]+_BUILD\s*=", scripts):
        fail(where, "R6", "no build marker window.<NAME>_BUILD")
    if re.search(r"<basis\b(?![^>]*run=\"AtClient\")[^>]*triggers=", html, re.I):
        fail(where, "R7", "client-side <basis> command without run=\"AtClient\"")
    if GUID.search(html):
        fail(where, "security", "literal GUID (possible session key) in the file")

    if node and scripts.strip():
        with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as tmp:
            tmp.write(scripts + "\n" + scripts)
        result = subprocess.run([node, "--check", tmp.name], capture_output=True, text=True)
        Path(tmp.name).unlink(missing_ok=True)
        if result.returncode != 0:
            fail(where, "R4", "script fails when executed twice: " + result.stderr.strip()[:200])


def check_content() -> None:
    menu_path = ROOT / "menu" / "desktop" / "menu.json"
    menu = json.loads(menu_path.read_text(encoding="utf-8"))
    pids: set[str] = set()

    def walk(nodes):
        for node in nodes:
            if node.get("mid") != "[##mid##]":
                fail("menu/desktop/menu.json", "mid", f"node {node.get('title')!r} must use \"[##mid##]\"")
            if "pid" in node:
                pids.add(str(node["pid"]))
            walk(node.get("nodes", []))

    walk(menu.get("nodes", []))
    for pid in sorted(pids):
        page_path = ROOT / "pages" / "desktop" / f"{pid}.json"
        if not page_path.is_file():
            fail("menu/desktop/menu.json", "pid", f"page {pid} has no pages/desktop/{pid}.json")
            continue
        page = json.loads(page_path.read_text(encoding="utf-8"))
        for group in page.get("groups", []):
            for widget in group.get("widgets", []):
                if widget.get("moduleid") != "[##mid##]":
                    fail(page_path.name, "moduleid", "must equal the menu mid token")
                if not (ROOT / "widgets" / "desktop" / f"{widget.get('id')}.html").is_file():
                    fail(page_path.name, "widget", f"widget {widget.get('id')} has no file")


def main() -> int:
    node = shutil.which("node")
    widgets = sorted((ROOT / "widgets").rglob("*.html"))
    for path in widgets:
        check_widget(path, node)
    check_content()
    print(f"checked {len(widgets)} widgets (node: {'yes' if node else 'not found, R4 double-run skipped'})")
    for line in failures:
        print("FAIL", line)
    print("OK" if not failures else f"{len(failures)} problem(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
