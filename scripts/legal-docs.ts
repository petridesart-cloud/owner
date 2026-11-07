// Writes docs/PRIVACY.md, TERMS.md, WAIVER.md and COOKIES.md from the texts the app shows. Run: npm run legal:docs
import fs from "node:fs";
import { legalMarkdown } from "../src/lib/legal-docs";

for (const [file, body] of Object.entries(legalMarkdown())) fs.writeFileSync(file, body);
console.log("wrote", Object.keys(legalMarkdown()).join(", "));
