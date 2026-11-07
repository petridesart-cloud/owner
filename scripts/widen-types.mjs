// credit_kind grows when the studio adds a class type with its own packages (add_credit_kind), so the
// generated union is widened: "reformer" | "mat" stay suggested, any other key is allowed.
import fs from "node:fs";
const f = "src/lib/supabase/types.ts";
const s = fs.readFileSync(f, "utf8");
// Works on the raw generator output ("credit_kind": "reformer"|"mat",) and on the formatted file (credit_kind: …;).
const out = s.replace(/("?credit_kind"?):\s*"reformer"(?:\s*\|\s*"[a-z0-9_]+")*(?:\s*\|\s*\(string & \{\}\))?(?=\s*[,;\n])/, '$1: "reformer" | "mat" | (string & {})');
if (out === s) { console.error("widen-types: credit_kind enum not found"); process.exit(1); }
// A-107: arguments the SQL functions accept as null are typed as nullable (the generator types every argument as required).
const NULLABLE_ARGS = { admin_adjust_lot: ["p_date", "p_actor"] };
let typed = out;
for (const [fn, args] of Object.entries(NULLABLE_ARGS)) {
  typed = typed.replace(new RegExp(`("?${fn}"?:\\s*\\{\\s*Args:\\s*\\{)([^}]*)(\\})`), (_m, a, body, c) =>
    a + args.reduce((b, k) => b.replace(new RegExp(`("?${k}"?\\??:\\s*)string(?!\\s*\\|)`), "$1string | null"), body) + c);
}
fs.writeFileSync(f, typed);
