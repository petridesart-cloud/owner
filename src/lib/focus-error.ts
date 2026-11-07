import { useEffect, type RefObject } from "react";

/**
 * After a failed submit, move focus to the first invalid field, or to the error notice (A-071).
 * `state` is the action state: it's a new object on every submit, so this runs once per attempt.
 */
export function useFocusOnError(form: RefObject<HTMLElement | null>, state: unknown, hasError: boolean) {
  useEffect(() => {
    if (!hasError || !form.current) return;
    const el = form.current.querySelector<HTMLElement>('[aria-invalid="true"]') ?? form.current.querySelector<HTMLElement>('[role="alert"]');
    el?.focus();
  }, [state, hasError, form]);
}
