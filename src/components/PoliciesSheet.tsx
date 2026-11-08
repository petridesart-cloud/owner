"use client";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * Her note (8 Nov): reading the rules from Create account must not lose what they typed. The documents open in a
 * sheet on the same page instead of navigating away. The phone's Back button closes the sheet (a history entry is
 * added while it's open), so it never leaves the form.
 */
const noop = () => () => {};

export function PoliciesSheet({ label, children }: { label: string; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pushed = useRef(false);
  const [isOpen, setIsOpen] = useState(false); // the texts are only in the page while the sheet is open
  // The sheet lives under <body>, not inside the tick box's <label>, so it isn't read as part of the label.
  const mounted = useSyncExternalStore(noop, () => true, () => false);

  useEffect(() => {
    const onPop = () => {
      if (pushed.current) { pushed.current = false; dialog.current?.close(); setIsOpen(false); }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const open = () => {
    setIsOpen(true);
    dialog.current?.showModal();
    history.pushState({ rfSheet: true }, "");
    pushed.current = true;
  };
  // Closed by the X, Esc or Back: take the extra history entry off again (unless Back already did).
  const close = () => {
    if (pushed.current) { pushed.current = false; history.back(); }
    dialog.current?.close();
    setIsOpen(false);
  };

  return (
    <>
      <button type="button" onClick={open} className="font-medium underline underline-offset-4">{label}</button>
      {mounted && createPortal(<dialog ref={dialog} onCancel={(e) => { e.preventDefault(); close(); }} aria-label="Terms and policies"
        className="m-0 h-dvh max-h-none w-full max-w-none bg-paper p-0 backdrop:bg-ink/30 sm:m-auto sm:h-[85dvh] sm:max-w-xl sm:rounded-[var(--radius-card)]">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-paper/90 px-5 py-3 backdrop-blur">
          <h2 className="display text-[1rem] text-ink">Terms &amp; policies</h2>
          <button type="button" onClick={close} className="inline-flex size-11 items-center justify-center rounded-full text-ink hover:bg-lilac-100" aria-label="Close">
            <X aria-hidden size={20} />
          </button>
        </div>
        <div className="pb-10 pt-4">{isOpen && children}</div>
        <div className="px-5 pb-8"><button type="button" onClick={close} className="min-h-12 w-full rounded-full bg-ink px-6 text-[0.8rem] font-medium uppercase tracking-[0.18em] text-paper">Back to the form</button></div>
      </dialog>, document.body)}
    </>
  );
}
