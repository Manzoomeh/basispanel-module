"""Smoke test against a running module started with NOTES_MOCK_AUTH=1.

    python tests/smoke_test.py [base_url]      default: http://127.0.0.1:8790/notes

Exercises the six-route contract, the data API, validation, and authentication.
Uses the standard library only.
"""
import json
import sys
import urllib.error
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8790/notes").rstrip("/")
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))  # talk to the service directly
results: list[tuple[bool, str]] = []


def call(method: str, path: str, body: dict | None = None) -> tuple[int, str]:
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(BASE + path, data=data, method=method,
                                     headers={"Content-Type": "application/json"} if data else {})
    try:
        with OPENER.open(request, timeout=10) as response:
            return response.status, response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode("utf-8")


def expect(name: str, condition: bool) -> None:
    results.append((condition, name))


status, text = call("GET", "/dev/en/Desktop/menu")
menu = json.loads(text) if status == 200 else {}
expect("menu answers 200 with nodes", status == 200 and bool(menu.get("nodes")))
expect("menu mid is a number", isinstance(menu.get("nodes", [{}])[0].get("mid"), int))

status, text = call("GET", "/dev/fa/Desktop/page/1")
expect("page 1 answers 200 with widgets", status == 200 and json.loads(text)["groups"][0]["widgets"])
expect("unknown page answers 404", call("GET", "/dev/en/Desktop/page/999")[0] == 404)
expect("sidebarMenu answers 200", call("GET", "/dev/en/Desktop/sidebarMenu/1")[0] == 200)
status, text = call("GET", "/dev/en/Desktop/sidebarmenu/2")
expect("missing sidebar answers empty nodes", status == 200 and json.loads(text) == {"nodes": []})

status, text = call("GET", "/dev/en/Desktop/widget/101")
expect("widget answers HTML", status == 200 and 'id="notesListWidget"' in text)
expect("widget tokens are substituted", "[##" not in text)
expect("stylesheet asset answers 200", call("GET", "/asset/notes.css")[0] == 200)
expect("unsupported asset answers 404", call("GET", "/asset/notes.png")[0] == 404)

status, text = call("POST", "/dev/api/notes", {"title": "smoke test", "body": "created by smoke_test.py"})
note_id = json.loads(text)["note"]["id"] if status == 200 else None
expect("create note answers 200", note_id is not None)
status, text = call("GET", "/dev/api/notes")
expect("list contains the new note", status == 200 and any(n["id"] == note_id for n in json.loads(text)["notes"]))
expect("empty title answers 400", call("POST", "/dev/api/notes", {"title": ""})[0] == 400)
expect("delete note answers 200", call("DELETE", f"/dev/api/notes/{note_id}")[0] == 200)
expect("delete again answers 404", call("DELETE", f"/dev/api/notes/{note_id}")[0] == 404)

status, text = call("GET", "/not-a-session/en/Desktop/menu")
expect("invalid session answers 401 Invalid rKey", status == 401 and "Invalid rKey" in text)

for ok, name in results:
    print("PASS" if ok else "FAIL", name)
failed = sum(1 for ok, _ in results if not ok)
print(f"{len(results) - failed}/{len(results)} passed")
sys.exit(1 if failed else 0)
