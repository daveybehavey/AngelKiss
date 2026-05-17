import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeCustomizationForCheckout,
  type CheckoutProductRow,
  type CustomSublimationCheckoutDetails
} from "../lib/checkout/customization";

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

const uploadGalleryProduct: CheckoutProductRow = {
  id: "44444444-4444-4444-4444-444444444444",
  category: "custom_sublimation",
  status: "published",
  is_available: true,
  deleted_at: null
};

const galleryOnlyProduct: CheckoutProductRow = {
  id: "55555555-5555-5555-5555-555555555555",
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
        allow_gallery_selection: false,
        max_upload_mb: 20
      }
    ],
    [
      readyMadeProduct.id,
      {
        product_id: readyMadeProduct.id,
        allow_image_upload: false,
        allow_gallery_selection: false,
        max_upload_mb: 20
      }
    ],
    [
      uploadGalleryProduct.id,
      {
        product_id: uploadGalleryProduct.id,
        allow_image_upload: true,
        allow_gallery_selection: true,
        max_upload_mb: 20
      }
    ],
    [
      galleryOnlyProduct.id,
      {
        product_id: galleryOnlyProduct.id,
        allow_image_upload: false,
        allow_gallery_selection: true,
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
        bucket: "customer-design-uploads",
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
        bucket: "customer-design-uploads",
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

test("custom photo upload accepts studio print even when allow_gallery_selection is false in DB", () => {
  const result = normalizeCustomizationForCheckout(
    {
      studio_print: {
        id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        storage_path: "studio-gallery/from-upload-only.png",
        title: "Client design"
      }
    },
    uploadProduct,
    detailsMap()
  );

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(
    (result.customization.studio_print as { id: string }).id,
    "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
  );
});

test("upload + gallery product accepts studio print payload", () => {
  const result = normalizeCustomizationForCheckout(
    {
      studio_print: {
        id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        storage_path: "studio-gallery/print-one.png",
        title: "Spring bouquet"
      }
    },
    uploadGalleryProduct,
    detailsMap()
  );

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(
    (result.customization.studio_print as { id: string }).id,
    "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
  );
});

test("upload + gallery product rejects upload and studio together", () => {
  const result = normalizeCustomizationForCheckout(
    {
      studio_print: {
        id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        storage_path: "studio-gallery/print-one.png"
      },
      upload: {
        bucket: "customer-design-uploads",
        storage_path: `customizations/${uploadGalleryProduct.id}/photo.png`
      },
      rights_acknowledged: true
    },
    uploadGalleryProduct,
    detailsMap()
  );

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }
  assert.equal(result.message, "Choose either your own photo upload or one studio print — not both");
});

test("gallery-only product requires studio print", () => {
  const ok = normalizeCustomizationForCheckout(
    {},
    galleryOnlyProduct,
    detailsMap()
  );
  assert.equal(ok.ok, false);
  if (ok.ok) {
    return;
  }
  assert.equal(ok.message, "Please choose one of our studio prints for this item");
});

test("gallery-only product rejects bad studio path prefix", () => {
  const result = normalizeCustomizationForCheckout(
    {
      studio_print: {
        id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        storage_path: "other-folder/print.png"
      }
    },
    galleryOnlyProduct,
    detailsMap()
  );
  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }
  assert.equal(result.message, "Studio print path is invalid");
});
