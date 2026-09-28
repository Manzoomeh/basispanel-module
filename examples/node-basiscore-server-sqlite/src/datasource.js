// The "notes" connection used by <basis core="dbsource" source="notes"> in IL widgets.
//
// The render engine calls loadDataAsync({ command, dmnid, params }) and sets dmnid itself from
// the routing data, so a widget cannot ask for another business's data. The number of record
// sets returned must equal the number of <member> elements the dbsource declares.
import { store } from "./store.js";

// Resolve the render engine's DataSourceCollection (not exported by the package entry point).
const { default: DataSourceCollection } = await import(
  new URL("./renderEngine/Source/DataSourceCollection.js", import.meta.resolve("basiscore.server"))
);

// The print command inserts values without escaping, so every value is escaped here.
const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const queries = {
  // One record set: [{ count, latest }]
  summary(dmnid) {
    return [[{ count: store.count(dmnid), latest: escapeHtml(store.latestTitle(dmnid) ?? "—") }]];
  },
};

export const notesDataSource = {
  async loadDataAsync(parameters) {
    const dmnid = Number(parameters.dmnid);
    const query = queries[String(parameters.params?.query ?? "")];
    if (!Number.isInteger(dmnid) || !query) {
      throw new Error("notes source: unknown query");
    }
    return new DataSourceCollection(query(dmnid));
  },
  async testConnectionAsync() {
    return true;
  },
};
