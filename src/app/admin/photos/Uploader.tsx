"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Trash2 } from "lucide-react";
import { deletePhoto, uploadPhoto } from "./actions";

/** Shrink to ≤1600px and re-encode as JPEG in the browser (also strips location metadata). */
async function compress(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const keepPng = file.type === "image/png" && file.size < 1_500_000; // logos with transparency
  return new Promise((res) => canvas.toBlob((b) => res(b!), keepPng ? "image/png" : "image/jpeg", 0.82));
}

export function Uploader({ slot, label, single = false }: { slot: string; label: string; single?: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple={!single} className="sr-only" id={`up-${slot}`}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])].slice(0, 10);
          e.target.value = "";
          start(async () => {
            for (const f of files) {
              setMsg(`Uploading ${f.name}…`);
              const blob = await compress(f).catch(() => f);
              const fd = new FormData();
              fd.set("file", new File([blob], f.name.replace(/\.\w+$/, blob.type === "image/png" ? ".png" : ".jpg"), { type: blob.type }));
              const r = await uploadPhoto(slot, fd);
              if (!r.ok) { setMsg(r.error); return; }
            }
            setMsg(null);
            router.refresh();
          });
        }} />
      <label htmlFor={`up-${slot}`} className={`flex size-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-ink/25 bg-white text-xs text-ink-soft hover:bg-lilac-50 ${pending ? "opacity-60" : ""}`}>
        <ImagePlus aria-hidden size={20} />
        {pending ? "Uploading…" : single ? "Replace" : "Add"}
        <span className="sr-only">{label}</span>
      </label>
      {msg && <p role="status" className="mt-1 text-xs text-ink-soft">{msg}</p>}
    </div>
  );
}

export function DeletePhoto({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} aria-label="Remove photo"
      onClick={() => confirm("Remove this photo?") && start(async () => { await deletePhoto(id); router.refresh(); })}
      className="absolute right-1 top-1 grid size-8 place-items-center rounded-full bg-white/90 text-burgundy shadow">
      <Trash2 aria-hidden size={15} />
    </button>
  );
}
