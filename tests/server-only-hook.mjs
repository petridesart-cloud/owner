// Lets tests import server modules outside Next: "server-only" resolves to its empty build (as in Next's server bundle).
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
const empty = pathToFileURL(`${process.cwd()}/node_modules/server-only/empty.js`).href;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "server-only") return { url: empty, shortCircuit: true };
    return next(specifier, context);
  },
});
