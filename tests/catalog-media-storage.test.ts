import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";

describe("catalog media upload policy", () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env = { ...envBackup };
  });

  afterEach(() => {
    process.env = envBackup;
  });

  it("blocks uploads when CDN is set without R2 credentials", async () => {
    process.env.NEXT_PUBLIC_IMAGE_CDN_BASE_URL = "https://pub-example.r2.dev";
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    delete process.env.R2_BUCKET_NAME;

    const { getCatalogMediaUploadBlockReason, catalogMediaUsesR2Uploads } = await import(
      "../lib/server/catalog-media-storage"
    );
    assert.equal(catalogMediaUsesR2Uploads(), false);
    assert.match(getCatalogMediaUploadBlockReason() ?? "", /R2 upload credentials are missing/);
  });

  it("allows R2 uploads when CDN and R2 vars are set", async () => {
    process.env.NEXT_PUBLIC_IMAGE_CDN_BASE_URL = "https://pub-example.r2.dev";
    process.env.R2_ACCOUNT_ID = "acc";
    process.env.R2_ACCESS_KEY_ID = "key";
    process.env.R2_SECRET_ACCESS_KEY = "secret";
    process.env.R2_BUCKET_NAME = "bucket";

    const { getCatalogMediaUploadBlockReason, catalogMediaUsesR2Uploads } = await import(
      "../lib/server/catalog-media-storage"
    );
    assert.equal(getCatalogMediaUploadBlockReason(), null);
    assert.equal(catalogMediaUsesR2Uploads(), true);
  });
});
