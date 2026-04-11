type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

const LOG_LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

function configuredLogLevel(): LogLevel {
  const envValue = process.env.LOG_LEVEL?.trim().toLowerCase();
  if (envValue === "debug" || envValue === "info" || envValue === "warn" || envValue === "error") {
    return envValue;
  }
  return "info";
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_RANK[level] >= LOG_LEVEL_RANK[configuredLogLevel()];
}

function isSensitiveKey(key: string): boolean {
  return /(authorization|password|secret|token|cookie|key)/i.test(key);
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 4) {
    return "[depth_limit]";
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, depth + 1));
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(record)) {
      result[key] = isSensitiveKey(key) ? "[redacted]" : sanitizeValue(entry, depth + 1);
    }
    return result;
  }

  if (typeof value === "string" && value.length > 1000) {
    return `${value.slice(0, 1000)}…`;
  }

  return value;
}

function baseLog(level: LogLevel, event: string, context?: LogContext): void {
  if (!shouldLog(level)) {
    return;
  }

  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...(context ? { context: sanitizeValue(context) } : {})
  };

  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  if (level === "debug") {
    console.debug(line);
    return;
  }
  console.info(line);
}

function toErrorContext(error: unknown): LogContext {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      stack: error.stack
    };
  }
  return {
    error: String(error)
  };
}

export function logInfo(event: string, context?: LogContext): void {
  baseLog("info", event, context);
}

export function logWarn(event: string, context?: LogContext): void {
  baseLog("warn", event, context);
}

export function logError(event: string, error: unknown, context?: LogContext): void {
  baseLog("error", event, {
    ...context,
    ...toErrorContext(error)
  });
}
