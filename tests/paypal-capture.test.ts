import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractCaptureDetails,
  extractCaptureId,
  type PayPalOrderCaptureResponse
} from "../lib/paypal/api";

function completedCapture(
  overrides: Partial<NonNullable<PayPalOrderCaptureResponse["purchase_units"]>[number]> = {}
): PayPalOrderCaptureResponse {
  return {
    id: "ORDER123",
    status: "COMPLETED",
    purchase_units: [
      {
        payments: {
          captures: [
            {
              id: "CAPTURE123",
              status: "COMPLETED",
              amount: { value: "50.00", currency_code: "CAD" }
            }
          ]
        },
        ...overrides
      }
    ]
  };
}

test("extractCaptureDetails returns id, status, and amount for a completed capture", () => {
  const details = extractCaptureDetails(completedCapture());
  assert.deepEqual(details, {
    captureId: "CAPTURE123",
    status: "COMPLETED",
    amountValue: "50.00",
    currencyCode: "CAD"
  });
});

test("extractCaptureDetails uppercases the currency code", () => {
  const payload = completedCapture();
  payload.purchase_units![0]!.payments!.captures![0]!.amount = {
    value: "12.34",
    currency_code: "cad"
  };
  assert.equal(extractCaptureDetails(payload)?.currencyCode, "CAD");
});

test("extractCaptureDetails returns null when the response has no captures", () => {
  const payload: PayPalOrderCaptureResponse = {
    id: "ORDER123",
    status: "CREATED",
    purchase_units: [{ payments: { captures: [] } }]
  };
  assert.equal(extractCaptureDetails(payload), null);
});

test("extractCaptureDetails returns null when purchase units are absent", () => {
  assert.equal(extractCaptureDetails({ id: "ORDER123", status: "COMPLETED" }), null);
});

test("extractCaptureDetails surfaces a non-completed capture status instead of hiding it", () => {
  const payload = completedCapture();
  payload.purchase_units![0]!.payments!.captures![0]!.status = "PENDING";
  const details = extractCaptureDetails(payload);
  assert.equal(details?.status, "PENDING");
  assert.equal(details?.captureId, "CAPTURE123");
});

test("extractCaptureDetails keeps amount null when PayPal omits it", () => {
  const payload = completedCapture();
  delete payload.purchase_units![0]!.payments!.captures![0]!.amount;
  const details = extractCaptureDetails(payload);
  assert.equal(details?.amountValue, null);
  assert.equal(details?.currencyCode, null);
});

test("extractCaptureId still returns the first capture id", () => {
  assert.equal(extractCaptureId(completedCapture()), "CAPTURE123");
  assert.equal(extractCaptureId({ id: "ORDER123", status: "CREATED" }), null);
});
