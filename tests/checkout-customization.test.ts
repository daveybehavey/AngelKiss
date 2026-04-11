import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeCustomizationForCheckout,
  type CheckoutProductRow,
  type CustomSublimationCheckoutDetails
} from "../lib/checkout/customization";
import { getCustomerUploadsBucket } from "../lib/admin/images";

const handmadeProduct: CheckoutProductRow = {
  id: "11111111-1111-1111-1111-111111111111",
  category: "handmade_crochet_knit",
  status: "published",
  is_available: true,
  deleted_at: null
};

const uploadProduct: CheckoutProductRow = {
  id: "22222222-2222-2222-2222-222222222222",
  category: "custom_sublimation",
  status: "published",
  is_available: true,
  deleted_at: null
};

const readyMadeProduct: CheckoutProductRow = {
  id: "33333333-3333-3333-3333-333333333333",
  category: "custom_sublimation",
  status: "published",
  is_available: true,
  deleted_at: null
};

function detailsMap(): Map<string, CustomSublimationCheckoutDetails> {
  return new Map<string, CustomSublimationCheckoutDetails>([
    [
      uploadProduct.id,
      {
        product_id: uploadProduct.id,
        allow_image_upload: true,
        max_upload_mb: 20
      }
    ],
    [
      readyMadeProduct.id,
      {
        product_id: readyMadeProduct.id,
        allow_image_upload: false,
        max_upload_mb: 20
      }
    ]
  ]);
}

test("handmade products strip customization payload", () => {
  const result = normalizeCustomizationForCheckout(
    { unexpected: "value" },
    handmadeProduct,
    detailsMap()
  );

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.deepEqual(result.customization, {});
});

test("custom upload product accepts valid payload", () => {
  const result = normalizeCustomizationForCheckout(
    {
      upload: {
        bucket: getCustomerUploadsBucket(),
        storage_path: `customizations/${uploadProduct.id}/photo.png`,
        original_filename: "photo.png",
        content_type: "image/png",
        size_bytes: 1024,
        uploaded_at: new Date().toISOString()
      },
      rights_acknowledged: true,
      customer_notes: "center the photo"
    },
    uploadProduct,
    detailsMap()
  );

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.customization.rights_acknowledged, true);
  assert.equal(result.customization.customer_notes, "center the photo");
});

test("custom upload product rejects wrong storage bucket", () => {
  const result = normalizeCustomizationForCheckout(
    {
      upload: {
        bucket: "wrong-bucket",
        storage_path: `customizations/${uploadProduct.id}/photo.png`
      },
      rights_acknowledged: true
    },
    uploadProduct,
    detailsMap()
  );

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.message, "Uploaded image bucket is invalid for this product");
});

test("ready-made sublimation rejects upload payload", () => {
  const result = normalizeCustomizationForCheckout(
    {
      upload: {
        bucket: getCustomerUploadsBucket(),
        storage_path: `customizations/${readyMadeProduct.id}/photo.png`
      },
      rights_acknowledged: true
    },
    readyMadeProduct,
    detailsMap()
  );

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(
    result.message,
    "This sublimation item is pre-designed and does not accept customer image uploads"
  );
});
