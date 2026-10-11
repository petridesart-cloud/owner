"use client";
import { useState, useTransition } from "react";
import Papa from "papaparse";
import { Button, Field, Notice, inputClass } from "@/components/ui";
import { importClients, importTimetable } from "../actions";

type Row = Record<string, unknown>;

async function parseFile(file: File): Promise<Row[]> {
  const norm = (rows: Row[]) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.trim().toLowerCase().replace(/\s+/g, "_"), typeof v === "string" ? v.trim() : v])));
  if (/\.xlsx$/i.test(file.name)) {
    const { default: readXlsx } = await import("read-excel-file/browser");
    const [first] = await readXlsx(file);
    const [head, ...body] = (first?.data ?? []) as unknown[][];
    return norm(body.map((r) => Object.fromEntries((head as string[]).map((h, i) => [String(h), r[i] == null ? "" : r[i] instanceof Date ? (r[i] as Date).toISOString().slice(0, 10) : String(r[i])]))));
  }
  const text = await file.text();
  return norm(Papa.parse<Row>(text, { header: true, skipEmptyLines: true }).data);
}

export function Importer({ kind, defaults }: { kind: "clients" | "timetable"; defaults?: { name: string; from: string; to: string } }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [meta, setMeta] = useState(defaults ?? { name: "", from: "", to: "" });
  const [pending, start] = useTransition();
  const id = `file-${kind}`;

  return (
    <div className="space-y-4">
      <Field id={id} label={kind === "clients" ? "Client list (.csv or .xlsx)" : "Timetable (.csv or .xlsx)"}
        hint={kind === "clients" ? "Columns: full_name, email, phone, notes, reformer_credits, mat_credits, credits_expire" : "Columns: day (Mon–Sun), time (08:00), class_type (reformer / mat), capacity (optional)"}>
        <input id={id} type="file" accept=".csv,.xlsx" className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-full file:border-0 file:bg-lilac-100 file:px-4 file:text-ink"
          onChange={async (e) => { const f = e.target.files?.[0]; setMsg(null); if (f) setRows(await parseFile(f)); }} />
      </Field>
      {kind === "timetable" && (
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Field id="tt-name" label="Name"><input id="tt-name" value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} className={inputClass} /></Field></div>
          <Field id="tt-from" label="From"><input id="tt-from" type="date" value={meta.from} onChange={(e) => setMeta({ ...meta, from: e.target.value })} className={inputClass} /></Field>
          <Field id="tt-to" label="To"><input id="tt-to" type="date" value={meta.to} onChange={(e) => setMeta({ ...meta, to: e.target.value })} className={inputClass} /></Field>
        </div>
      )}
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full text-left text-xs">
            <caption className="px-3 py-2 text-left text-sm text-ink">Preview: {rows.length} rows</caption>
            <thead><tr>{Object.keys(rows[0]).map((k) => <th key={k} scope="col" className="border-b border-line px-3 py-2 font-medium">{k}</th>)}</tr></thead>
            <tbody>{rows.slice(0, 6).map((r, i) => <tr key={i}>{Object.values(r).map((v, j) => <td key={j} className="border-b border-line px-3 py-1.5">{String(v)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
      {msg && <Notice tone={msg.ok ? "success" : "error"}>{msg.text}</Notice>}
      <Button className="w-full" variant="soft" disabled={!rows.length || pending} onClick={() => start(async () => {
        if (kind === "clients") {
          const r = await importClients(rows);
          setMsg(r.ok ? { ok: true, text: `Imported: ${r.data!.created} new, ${r.data!.updated} updated, ${r.data!.skipped} skipped (missing name or bad email).` } : { ok: false, text: r.error });
        } else {
          const r = await importTimetable(rows, meta.name, meta.from, meta.to);
          setMsg(r.ok ? { ok: true, text: r.message ?? "Imported." } : { ok: false, text: r.error });
        }
      })}>{pending ? "Importing…" : `Import ${rows.length || ""} rows`}</Button>
    </div>
  );
}
