// Smoke test against a running module started with NOTES_MOCK_AUTH=1.
//
//   npm run smoke [-- base_url]      default: http://localhost:8792/notes
//
// Exercises the six-route contract, the server-rendered widget, the data API, validation,
// authentication and the origin allow list. Uses only Node's built-in fetch.
const BASE = (process.argv[2] || "http://localhost:8792/notes").replace(/\/+$/, "");
const results = [];
const expect = (name, condition) => results.push([Boolean(condition), name]);

async function call(method, path, body, headers = {}) {
  const response = await fetch(BASE + path, {
    method,
    headers: body ? { "Content-Type": "application/json", ...headers } : headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return [response.status, await response.text()];
}

let [status, text] = await call("GET", "/dev/en/Desktop/menu");
const menu = status === 200 ? JSON.parse(text) : {};
expect("menu answers 200 with nodes", status === 200 && menu.nodes?.length);
expect("menu mid is a number", typeof menu.nodes?.[0]?.mid === "number");

[status, text] = await call("GET", "/dev/fa/Desktop/page/1");
expect("page 1 answers 200 with widgets", status === 200 && JSON.parse(text).groups[0].widgets.length);
expect("unknown page answers 404", (await call("GET", "/dev/en/Desktop/page/999"))[0] === 404);
expect("sidebarMenu answers 200", (await call("GET", "/dev/en/Desktop/sidebarMenu/1"))[0] === 200);
[status, text] = await call("GET", "/dev/en/Desktop/sidebarmenu/2");
expect("missing sidebar answers empty nodes", status === 200 && text === '{"nodes":[]}');

[status, text] = await call("GET", "/dev/en/Desktop/widget/101");
expect("plain widget answers HTML", status === 200 && text.includes('id="notesListWidget"'));
expect("plain widget tokens are substituted", !text.includes("[##"));
expect("stylesheet asset answers 200", (await call("GET", "/asset/notes.css"))[0] === 200);
expect("unsupported asset answers 404", (await call("GET", "/asset/notes.png"))[0] === 404);

[status, text] = await call("POST", "/dev/api/notes", { title: "<i>smoke</i> & test", body: "created by smoke-test.js" });
const noteId = status === 200 ? JSON.parse(text).note.id : null;
expect("create note answers 200", noteId);
[status, text] = await call("GET", "/dev/api/notes");
expect("list contains the new note", status === 200 && JSON.parse(text).notes.some((n) => n.id === noteId));

[status, text] = await call("GET", "/dev/en/Desktop/widget/102");
expect("IL widget is rendered by the BasisCore engine", status === 200 && /data-role="count">\d+</.test(text));
expect("IL widget escapes data", text.includes("&lt;i&gt;smoke&lt;/i&gt; &amp; test"));
expect("IL widget resolves the rkey token", text.includes("/notes/dev/en/Desktop/widget/102"));

expect("empty title answers 400", (await call("POST", "/dev/api/notes", { title: "" }))[0] === 400);
expect("delete note answers 200", (await call("DELETE", `/dev/api/notes/${noteId}`))[0] === 200);
expect("delete again answers 404", (await call("DELETE", `/dev/api/notes/${noteId}`))[0] === 404);

[status, text] = await call("GET", "/not-a-session/en/Desktop/menu");
expect("invalid session answers 401 Invalid rKey", status === 401 && text.includes("Invalid rKey"));
expect("unknown origin answers 403", (await call("GET", "/dev/api/notes", null, { Origin: "https://unknown.example" }))[0] === 403);

for (const [ok, name] of results) console.log(ok ? "PASS" : "FAIL", name);
const failed = results.filter(([ok]) => !ok).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
