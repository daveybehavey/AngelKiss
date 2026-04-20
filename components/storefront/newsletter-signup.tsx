"use client";

import { useCallback, useState } from "react";

type NewsletterSignupProps = {
  /** Screen-reader label for the form */
  headingId?: string;
  className?: string;
};

export function NewsletterSignup({ headingId, className }: NewsletterSignupProps) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setBusy(true);
      setError(null);
      setMessage(null);
      try {
        const response = await fetch("/api/newsletter/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, company: "" })
        });
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        if (!response.ok) {
          setError(typeof data.error === "string" ? data.error : "Something went wrong.");
          return;
        }
        setMessage(
          typeof data.message === "string" ? data.message : "Thanks — you are on the list!"
        );
        setEmail("");
      } catch {
        setError("Network error. Please try again in a moment.");
      } finally {
        setBusy(false);
      }
    },
    [email]
  );

  return (
    <section
      className={className ?? "newsletter-card"}
      aria-labelledby={headingId}
    >
      <h2 className="newsletter-card-title" id={headingId}>
        Restocks &amp; news
      </h2>
      <p className="newsletter-card-lead">
        Get an occasional email when we add new pieces or bring favorites back.
      </p>
      <form className="newsletter-form" onSubmit={onSubmit}>
        <label className="newsletter-sr-only" htmlFor="newsletter-email">
          Email address
        </label>
        <input
          id="newsletter-email"
          className="field-control newsletter-input"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          maxLength={320}
          disabled={busy}
        />
        <button type="submit" className="btn btn-primary newsletter-submit" disabled={busy}>
          {busy ? "Joining…" : "Join the list"}
        </button>
      </form>
      {message ? <p className="newsletter-success">{message}</p> : null}
      {error ? <p className="newsletter-error">{error}</p> : null}
      <p className="newsletter-fineprint">
        You can unsubscribe anytime by emailing{" "}
        <a href="mailto:anglkisscreations@gmail.com">anglkisscreations@gmail.com</a>. We do not
        sell addresses.
      </p>
    </section>
  );
}
