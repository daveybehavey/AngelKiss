"use client";

import Image from "next/image";
import { useCallback, useEffect, useId, useRef } from "react";

export type ImageLightboxProps = {
  open: boolean;
  onClose: () => void;
  src: string;
  alt: string;
  unoptimized?: boolean;
};

export function ImageLightbox({ open, onClose, src, alt, unoptimized }: ImageLightboxProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
      queueMicrotask(() => closeRef.current?.focus());
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const handleCancel = useCallback(
    (event: Event) => {
      event.preventDefault();
      onClose();
    },
    [onClose]
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [handleCancel]);

  function handleBackdropClick(event: React.MouseEvent<HTMLDialogElement>) {
    if (event.target === dialogRef.current) {
      onClose();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="image-lightbox-dialog"
      aria-labelledby={titleId}
      onClick={handleBackdropClick}
      onClose={onClose}
    >
      <div className="image-lightbox-panel" onClick={(event) => event.stopPropagation()}>
        <h2 id={titleId} className="sr-only">
          {alt}
        </h2>
        <button
          ref={closeRef}
          type="button"
          className="image-lightbox-close"
          onClick={onClose}
          aria-label="Close image preview"
        >
          <span aria-hidden="true">&times;</span>
        </button>
        {open && src ? (
          <div className="image-lightbox-stage">
            <Image
              src={src}
              alt={alt}
              fill
              sizes="(max-width: 900px) 92vw, min(720px, 88vw)"
              className="image-lightbox-img"
              style={{ objectFit: "contain" }}
              unoptimized={unoptimized}
              priority
            />
          </div>
        ) : null}
      </div>
    </dialog>
  );
}
