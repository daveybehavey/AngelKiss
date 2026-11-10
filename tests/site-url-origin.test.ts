import assert from "node:assert/strict";
import test from "node:test";
import { CANONICAL_SITE_URL } from "../lib/site-domains";
import { getSiteOrigin } from "../lib/site-url";

test("getSiteOrigin falls back to canonical .ca host when env unset", () => {
  const previous = process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.NEXT_PUBLIC_SITE_URL;
  try {
    assert.equal(getSiteOrigin(), CANONICAL_SITE_URL);
  } finally {
    if (previous === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = previous;
    }
  }
});

test("getSiteOrigin uses NEXT_PUBLIC_SITE_URL when valid", () => {
  const previous = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = "https://anglkisscreations.ca/";
  try {
    assert.equal(getSiteOrigin(), "https://anglkisscreations.ca");
  } finally {
    if (previous === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = previous;
    }
  }
});
