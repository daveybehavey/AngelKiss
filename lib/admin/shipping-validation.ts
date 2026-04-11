export type ShippingOriginInput = {
  country_code: string;
  province_code: string;
  city: string;
  postal_code: string;
};

export type ShippingOriginField = keyof ShippingOriginInput;

export type ShippingOriginFieldErrors = Partial<Record<ShippingOriginField, string>>;

export type ShippingOriginValidationResult =
  | {
      ok: true;
      normalized: ShippingOriginInput;
    }
  | {
      ok: false;
      normalized: ShippingOriginInput;
      errors: ShippingOriginFieldErrors;
    };

const CANADA_POSTAL_CODE_PATTERN =
  /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d$/i;
const US_ZIP_CODE_PATTERN = /^\d{5}(?:-\d{4})?$/;

function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function clampLength(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return value.slice(0, maxLength);
}

export function normalizeCountryCodeInput(value: string): string {
  const lettersOnly = value.toUpperCase().replace(/[^A-Z]/g, "");
  return clampLength(lettersOnly, 2);
}

export function normalizeProvinceCodeInput(value: string): string {
  const cleaned = value.toUpperCase().replace(/[^A-Z0-9 -]/g, "");
  return clampLength(collapseWhitespace(cleaned), 32);
}

export function normalizeCityInput(value: string): string {
  return clampLength(collapseWhitespace(value), 120);
}

export function normalizePostalCodeInput(countryCode: string, value: string): string {
  const normalizedCountry = normalizeCountryCodeInput(countryCode);

  if (normalizedCountry === "CA") {
    const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    if (compact.length <= 3) {
      return compact;
    }
    return `${compact.slice(0, 3)} ${compact.slice(3)}`;
  }

  if (normalizedCountry === "US") {
    const compact = value.replace(/\s+/g, "").replace(/[^0-9-]/g, "");
    return clampLength(compact, 10);
  }

  return clampLength(value.toUpperCase().trim(), 32);
}

export function normalizeShippingOriginInput(input: ShippingOriginInput): ShippingOriginInput {
  const countryCode = normalizeCountryCodeInput(input.country_code);
  return {
    country_code: countryCode,
    province_code: normalizeProvinceCodeInput(input.province_code),
    city: normalizeCityInput(input.city),
    postal_code: normalizePostalCodeInput(countryCode, input.postal_code)
  };
}

export function validateShippingOriginInput(
  input: ShippingOriginInput
): ShippingOriginValidationResult {
  const normalized = normalizeShippingOriginInput(input);
  const errors: ShippingOriginFieldErrors = {};

  if (normalized.country_code !== "CA" && normalized.country_code !== "US") {
    errors.country_code = "Use CA or US.";
  }

  if (!/^[A-Z0-9 -]{2,32}$/.test(normalized.province_code)) {
    errors.province_code = "Use a valid province/state code.";
  }

  if (normalized.city.length < 1 || normalized.city.length > 120) {
    errors.city = "City is required.";
  }

  if (normalized.country_code === "CA") {
    if (!CANADA_POSTAL_CODE_PATTERN.test(normalized.postal_code)) {
      errors.postal_code = "Use Canadian format A1A 1A1.";
    }
  } else if (normalized.country_code === "US") {
    if (!US_ZIP_CODE_PATTERN.test(normalized.postal_code)) {
      errors.postal_code = "Use US ZIP format 12345 or 12345-6789.";
    }
  } else if (normalized.postal_code.length < 1 || normalized.postal_code.length > 32) {
    errors.postal_code = "Postal code is required.";
  }

  if (Object.keys(errors).length > 0) {
    return {
      ok: false,
      normalized,
      errors
    };
  }

  return {
    ok: true,
    normalized
  };
}
