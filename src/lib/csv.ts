// One quoted CSV cell. Text that starts with = + - @ (or a tab / CR) is prefixed with ' so Excel and
// Sheets show it instead of running it as a formula (a client can choose their own name). Plain
// numbers such as "-12.50" stay numbers.
export function csvCell(v: unknown) {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
