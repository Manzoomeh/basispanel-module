// Notes — a BasisPanel module served by BasisCore.Server.Node, with SQLite storage.
//
// BasisCore.Server.Node is the web server. It asks the "RoutingData" connection what to answer
// for every request; here that connection is an in-process engine (src/router.js) that
// implements the BasisPanel module contract. A second in-process connection, "notes", feeds
// <basis core="dbsource"> commands in widgets rendered by the BasisCore render engine.
//
// Run:  npm start
import HostManager from "basiscore.server";
import { CONFIG } from "./src/config.js";
import { notesDataSource } from "./src/datasource.js";
import { router } from "./src/router.js";

const server = HostManager.fromJson({
  Lazy: true,
  EndPoints: {
    module: {
      Type: "http",
      Addresses: [{ EndPoint: `${CONFIG.host}:${CONFIG.port}` }],
      Active: true,
      Routing: "notes",
    },
  },
  Services: {
    notes: {
      Type: "http",
      ReadBodyTimeout: 30000,
      ProcessTimeout: 30000,
      MaxBodySize: 100000,
      Settings: {
        "Connections.inline.RoutingData": router,
        "Connections.inline.notes": notesDataSource,
      },
    },
  },
});

await server.listenAsync();
console.log(`${CONFIG.prefix} module on ${CONFIG.publicBaseUrl}/${CONFIG.prefix}/`);
if (CONFIG.devShell) console.log(`shell simulator:  ${CONFIG.publicBaseUrl}/dev/shell`);
