import {
  normalizeCustomizationForCheckout,
  type CheckoutProductRow,
  type CustomSublimationCheckoutDetails
} from "@/lib/checkout/customization";
import { badRequest, serverError } from "@/lib/http/json";
import { getRequestMeta } from "@/lib/http/request-meta";
import { logError, logWarn } from "@/lib/observability/log";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const checkoutBodySchema = z.object({
  customer_email: z.string().email(),
  shipping_address: z.object({
    full_name: z.string().trim().min(1).max(120),
    address_line1: z.string().trim().min(1).max(200),
    address_line2: z.string().trim().max(200).optional().default(""),
    country_code: z.string().min(2).max(3),
    province_code: z.string().min(1),
    city: z.string().min(1),
    postal_code: z.string().min(1),
    phone: z.string().trim().max(40).optional().default("")
  }),
  items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        quantity: z.number().int().positive(),
        customization: z.record(z.unknown()).optional()
      })
    )
    .min(1)
});

type CheckoutItemInput = z.infer<typeof checkoutBodySchema>["items"][number];

export async function POST(request: Request) {
  const requestMeta = getRequestMeta(request);

  try {
    const payload = await request.json();
    const parsed = checkoutBodySchema.safeParse(payload);
    if (!parsed.success) {
      logWarn("checkout.session.invalid_body", {
        ...requestMeta,
        issues: parsed.error.issues.length
      });
      return badRequest("Invalid request body", parsed.error.flatten());
    }

    const supabase = getSupabaseAdminClient();
    const { customer_email, shipping_address, items } = parsed.data;

    const productIds = Array.from(new Set(items.map((item) => item.product_id)));
    const { data: productsData, error: productsError } = await supabase
      .from("products")
      .select("id,category,status,is_available,deleted_at")
      .in("id", productIds);
    if (productsError) {
      logError("checkout.session.product_lookup_failed", productsError, {
        ...requestMeta,
        productCount: productIds.length
      });
      return serverError("Failed to load product data for checkout", productsError.message);
    }

    const products = (productsData ?? []) as CheckoutProductRow[];
    const productById = new Map(products.map((product) => [product.id, product]));

    const customSublimationProductIds = products
      .filter((product) => product.category === "custom_sublimation")
      .map((product) => product.id);

    const customDetailsByProductId = new Map<string, CustomSublimationCheckoutDetails>();
    if (customSublimationProductIds.length > 0) {
      const { data: detailsData, error: detailsError } = await supabase
        .from("custom_sublimation_products")
        .select("product_id,allow_image_upload,max_upload_mb")
        .in("product_id", customSublimationProductIds);

      if (detailsError) {
        logError("checkout.session.custom_details_lookup_failed", detailsError, {
          ...requestMeta,
          productCount: customSublimationProductIds.length
        });
        return serverError(
          "Failed to load custom product settings for checkout",
          detailsError.message
        );
      }

      for (const details of (detailsData ?? []) as CustomSublimationCheckoutDetails[]) {
        customDetailsByProductId.set(details.product_id, details);
      }
    }

    const rpcItems: Array<{
      product_id: string;
      quantity: number;
      customization: Record<string, unknown>;
    }> = [];

    for (const item of items as CheckoutItemInput[]) {
      const product = productById.get(item.product_id);
      if (!product || product.deleted_at !== null) {
        logWarn("checkout.session.product_missing", {
          ...requestMeta,
          productId: item.product_id
        });
        return badRequest(`Product not found: ${item.product_id}`);
      }

      if (product.status !== "published" || product.is_available !== true) {
        logWarn("checkout.session.product_unavailable", {
          ...requestMeta,
          productId: item.product_id,
          status: product.status,
          isAvailable: product.is_available
        });
        return badRequest(`Product is not available for checkout: ${item.product_id}`);
      }

      const normalizedCustomization = normalizeCustomizationForCheckout(
        item.customization,
        product,
        customDetailsByProductId
      );
      if (!normalizedCustomization.ok) {
        logWarn("checkout.session.invalid_customization", {
          ...requestMeta,
          productId: item.product_id,
          details: normalizedCustomization.details
        });
        return badRequest(normalizedCustomization.message, normalizedCustomization.details);
      }

      rpcItems.push({
        product_id: item.product_id,
        quantity: item.quantity,
        customization: normalizedCustomization.customization
      });
    }

    const { data, error } = await supabase.rpc("create_checkout_session", {
      p_customer_email: customer_email,
      p_shipping_address: shipping_address,
      p_items: rpcItems
    });

    if (error) {
      logWarn("checkout.session.rpc_rejected", {
        ...requestMeta,
        message: error.message
      });
      return badRequest(error.message);
    }

    const row = Array.isArray(data) ? data[0] : null;
    if (!row) {
      logError("checkout.session.rpc_empty_result", new Error("No checkout session row returned"), {
        ...requestMeta,
        itemCount: rpcItems.length
      });
      return serverError("Checkout session creation returned no result");
    }

    return NextResponse.json(
      {
        checkoutSessionId: row.checkout_session_id,
        status: row.status,
        expiresAt: row.expires_at,
        totals: {
          subtotal_cents: row.subtotal_cents,
          shipping_cents: row.shipping_cents,
          total_cents: row.total_cents,
          shipping_zone: row.shipping_zone,
          free_shipping_applied: row.free_shipping_applied
        }
      },
      { status: 201 }
    );
  } catch (error) {
    logError("checkout.session.unhandled", error, requestMeta);
    return serverError(
      "Unexpected error creating checkout session",
      error instanceof Error ? error.message : error
    );
  }
}
