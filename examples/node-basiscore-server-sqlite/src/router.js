// The module's routing engine, plugged into BasisCore.Server.Node as the "RoutingData"
// connection. For every request the server asks this engine what to answer; the engine returns
// a routing-data object whose webserver.index chooses how the server responds:
//
//   index 5   the content is returned as is (JSON, assets, plain widgets)
//   index 1   cms.page_il is rendered by the BasisCore render engine (IL widgets)
import { checkRkeyAsync, InvalidRkeyError } from "./auth.js";
import { CONFIG } from "./config.js";
import { cultureOf, isSegment, readAsset, readDevShell, readJson, readWidget } from "./content.js";
import { store } from "./store.js";

const STATUS = { 200: "OK", 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed", 500: "Internal Server Error" };

function respond(request, status, mime, content, extra = {}) {
  return {
    ...request,
    webserver: { index: "5", headercode: `${status} ${STATUS[status]}`, mime },
    cms: { ...request.cms, content },
    http: { "Cache-Control": "no-store", ...extra },
  };
}

const json = (request, status, value) => respond(request, status, "application/json; charset=utf-8", JSON.stringify(value));
const html = (request, content) => respond(request, 200, "text/html; charset=utf-8", content);
const error = (request, status, message) => json(request, status, { errorCode: `http-${status}`, errorMessage: message });

/** Render a BasisCore IL tree with the session values the render engine exposes as [##cms.cms.*##]. */
function renderIl(request, il, scope) {
  return {
    ...request,
    webserver: { index: "1", headercode: "200 OK", mime: "text/html; charset=utf-8" },
    // cms.dmnid is also the domain id the render engine passes to every dbsource.
    cms: { ...request.cms, dmnid: scope.currentDmnid, rkey: scope.rkey, page_il: JSON.stringify(il) },
    http: { "Cache-Control": "no-store" },
  };
}

// BasisCore.Server.Node echoes any Origin in its CORS headers, so the module enforces its own
// allow list: a browser request from an origin that is not allowed is refused.
function originAllowed(request) {
  const origin = String(request.request?.origin || "").replace(/\/+$/, "");
  if (!origin) return true; // not a cross-origin browser request
  return CONFIG.allowedOrigins.has(origin) || (CONFIG.devShell && origin === CONFIG.publicBaseUrl);
}

// Soft tenant gate: a business that is not allowed receives empty answers, not errors.
const allowed = (scope) => CONFIG.allowedDmnIds.size === 0 || CONFIG.allowedDmnIds.has(scope.currentDmnid);

function readBody(request) {
  if (request.form && Object.keys(request.form).length) return request.form;
  try {
    return JSON.parse(request.request?.body || "{}");
  } catch {
    return {};
  }
}

async function handleContract(request, segments, scope) {
  const [, , culture, device, kind, id] = segments;
  const lang = cultureOf(culture);
  if (!isSegment(device)) return error(request, 404, "invalid device");

  if (kind === "menu" && segments.length === 5) {
    if (!allowed(scope)) return json(request, 200, { nodes: [] });
    const menu = readJson("menu", device, "menu.json", scope, lang);
    return menu ? json(request, 200, menu) : error(request, 404, "menu not found");
  }
  if (!isSegment(id) || segments.length !== 6) return error(request, 404, "route not found");

  if (kind === "page") {
    if (!allowed(scope)) return json(request, 200, {});
    const page = readJson("pages", device, `${id}.json`, scope, lang);
    return page ? json(request, 200, page) : error(request, 404, "page not found");
  }
  // The panel calls sidebarMenu with a capital M; accept the lower-case form too.
  if (kind === "sidebarMenu" || kind === "sidebarmenu") {
    if (!allowed(scope)) return json(request, 200, { nodes: [] });
    return json(request, 200, readJson("sidebars", device, `${id}.json`, scope, lang) ?? { nodes: [] });
  }
  if (kind === "widget") {
    if (!allowed(scope)) return html(request, "");
    const widget = readWidget(device, id, scope, lang);
    if (!widget) return error(request, 404, "widget not found");
    return widget.kind === "il" ? renderIl(request, widget.il, scope) : html(request, widget.content);
  }
  return error(request, 404, "route not found");
}

async function handleApi(request, segments, scope) {
  // notes/:rkey/api/notes[/:noteID]
  const method = String(request.request?.methode || "get").toLowerCase();
  const noteId = segments[4];
  if (!allowed(scope)) {
    return method === "get" && !noteId
      ? json(request, 200, { notes: [], count: 0 })
      : error(request, 404, "module not available for this business");
  }
  if (!noteId && method === "get") {
    return json(request, 200, { notes: store.list(scope.currentDmnid), count: store.count(scope.currentDmnid) });
  }
  if (!noteId && method === "post") {
    const body = readBody(request);
    const title = String(body.title ?? "").trim();
    const text = String(body.body ?? "").trim();
    if (title.length < 1 || title.length > 200) return error(request, 400, "title must be 1 to 200 characters");
    if (text.length > 4000) return error(request, 400, "body must be at most 4000 characters");
    const note = store.create(scope.currentDmnid, scope.currentOwnerid, scope.userid, title, text);
    return json(request, 200, { note });
  }
  if (noteId && method === "delete") {
    const id = Number(noteId);
    if (!Number.isInteger(id) || id < 1) return error(request, 400, "invalid note id");
    return store.remove(scope.currentDmnid, id)
      ? json(request, 200, { deleted: id })
      : error(request, 404, "note not found");
  }
  return error(request, 405, "method not allowed");
}

export const router = {
  async getRoutingDataAsync(request) {
    const path = String(request.request?.url || "").split("?")[0].replace(/^\/+|\/+$/g, "");
    const segments = path.split("/");

    if (CONFIG.devShell && path === "dev/shell") return html(request, readDevShell());
    if (segments[0] !== CONFIG.prefix) return error(request, 404, "route not found");

    // Assets: no authentication, never token-processed.
    const isWidgetAsset = segments.length === 7 && segments[4] === "widget" && segments[5] === "asset";
    if ((segments.length === 3 && segments[1] === "asset") || isWidgetAsset) {
      const asset = readAsset(segments[segments.length - 1]);
      return asset ? respond(request, 200, asset.mime, asset.content, { "Cache-Control": "max-age=300" })
                   : error(request, 404, "asset not found");
    }

    if (!originAllowed(request)) return error(request, 403, "origin not allowed");

    let scope;
    try {
      scope = await checkRkeyAsync(segments[1]);
    } catch (ex) {
      if (ex instanceof InvalidRkeyError) return json(request, 401, { errorid: 1, message: "Invalid rKey" });
      throw ex;
    }

    if (segments[2] === "api" && segments[3] === "notes" && segments.length <= 5) {
      return handleApi(request, segments, scope);
    }
    if (segments.length >= 5) return handleContract(request, segments, scope);
    return error(request, 404, "route not found");
  },
};
