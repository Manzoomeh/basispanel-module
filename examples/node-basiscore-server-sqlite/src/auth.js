// Session validation through TrustLogin (checkrkey).
// The module never logs anyone in: the panel passes the session key (rkey) in the URL and
// the module asks TrustLogin who the caller is and which company/business is selected now.
import { CONFIG } from "./config.js";

const RKEY_PATTERN = /^[A-Za-z0-9-]{1,128}$/;
const CACHE_MS = 60_000;
const cache = new Map();

export class InvalidRkeyError extends Error {
  constructor() {
    super("Invalid rKey");
  }
}

const toInt = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

/**
 * @param {string} rkey
 * @returns {Promise<{rkey:string,userid:number,currentOwnerid:number,currentDmnid:number,lid:number,roles:object[]}>}
 */
export async function checkRkeyAsync(rkey) {
  if (!rkey || !RKEY_PATTERN.test(rkey)) throw new InvalidRkeyError();

  if (CONFIG.mockAuth && rkey === "dev") {
    return { rkey, userid: 1, currentOwnerid: 1, currentDmnid: 1, lid: 1, roles: [] };
  }

  const cached = cache.get(rkey);
  if (cached && cached.expires > Date.now()) return cached.scope;

  let data;
  try {
    const response = await fetch(CONFIG.checkRkeyApi + encodeURIComponent(rkey), {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new InvalidRkeyError();
    data = await response.json();
  } catch {
    throw new InvalidRkeyError(); // network failure: fail closed
  }
  if (!data || !data.checked) throw new InvalidRkeyError();

  // Always scope by the CURRENT selection, never by the user's home company/business.
  const scope = {
    rkey,
    userid: toInt(data.userid),
    currentOwnerid: toInt(data.currentOwnerid),
    currentDmnid: toInt(data.currentDmnid),
    lid: toInt(data.lid),
    roles: Array.isArray(data.userroles) ? data.userroles : [],
  };
  cache.set(rkey, { expires: Date.now() + CACHE_MS, scope });
  return scope;
}
