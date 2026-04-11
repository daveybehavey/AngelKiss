"use client";

import { useEffect } from "react";

export type AdminToastKind = "success" | "error";

export type AdminToast = {
  id: number;
  kind: AdminToastKind;
  message: string;
};

type AdminToastStackProps = {
  toasts: AdminToast[];
  onDismiss: (id: number) => void;
};

export function AdminToastStack({ toasts, onDismiss }: AdminToastStackProps) {
  useEffect(() => {
    if (toasts.length === 0) {
      return;
    }

    const timers = toasts.map((toast) =>
      window.setTimeout(() => {
        onDismiss(toast.id);
      }, toast.kind === "error" ? 7000 : 4500)
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [onDismiss, toasts]);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="admin-toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`admin-toast ${
            toast.kind === "success" ? "is-success" : "is-error"
          }`}
        >
          <p>{toast.message}</p>
          <button type="button" onClick={() => onDismiss(toast.id)}>
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}
