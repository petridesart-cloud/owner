import { startTransition, type FormEvent } from "react";

/**
 * Submit a form to a useActionState action without React's automatic form reset,
 * so a validation error doesn't wipe everything the person typed.
 */
export function keepValues(run: (form: FormData) => void, confirmText?: string) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (confirmText && !window.confirm(confirmText)) return;
    const form = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => run(form));
  };
}
