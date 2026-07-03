// ============================================================================
// BekiBuffet SaaS — Structured Logging
// ============================================================================
// Production-grade structured logging with log levels, correlation IDs,
// and JSON output for log aggregation (Datadog, Logtail, Vercel logs).
// In development: pretty-prints to console. In production: JSON to stdout.
// ============================================================================

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  [key: string]: any;
}

interface LogEntry {
  timestamp?: string;
  level?: LogLevel;
  message?: string;
  userId?: string;
  requestId?: string;
  [key: string]: any;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const currentLevel: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) ||
  (process.env.NODE_ENV === "production" ? "info" : "debug");

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatLog(level: LogLevel, message: string, context: LogContext = {}): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  };
}

function output(entry: LogEntry): void {
  if (process.env.NODE_ENV === "production") {
    // Production: JSON to stdout (Vercel/Datadog ingests this)
    process.stdout.write(JSON.stringify(entry) + "\n");
  } else {
    // Development: colored console output
    const colors: Record<LogLevel, string> = {
      debug: "\x1b[36m",
      info: "\x1b[32m",
      warn: "\x1b[33m",
      error: "\x1b[31m",
    };
    const reset = "\x1b[0m";
    const ctx = { ...entry };
    delete ctx.timestamp;
    delete ctx.level;
    delete ctx.message;
    const ctxStr = Object.keys(ctx).length > 0 ? " " + JSON.stringify(ctx) : "";
    const level = entry.level ?? "info";
    console.log(
      `${colors[level]}[${entry.timestamp}] ${level.toUpperCase()}${reset} ${entry.message}${ctxStr}`
    );
  }
}

export const logger = {
  debug(message: string, context: LogContext = {}) {
    if (shouldLog("debug")) output(formatLog("debug", message, context));
  },

  info(message: string, context: LogContext = {}) {
    if (shouldLog("info")) output(formatLog("info", message, context));
  },

  warn(message: string, context: LogContext = {}) {
    if (shouldLog("warn")) output(formatLog("warn", message, context));
  },

  error(message: string, context: LogContext = {}) {
    if (shouldLog("error")) output(formatLog("error", message, context));
  },

  /**
   * Create a child logger with persistent context (e.g., userId, requestId).
   */
  child(context: LogContext) {
    return {
      debug: (msg: string, ctx: LogContext = {}) => this.debug(msg, { ...context, ...ctx }),
      info: (msg: string, ctx: LogContext = {}) => this.info(msg, { ...context, ...ctx }),
      warn: (msg: string, ctx: LogContext = {}) => this.warn(msg, { ...context, ...ctx }),
      error: (msg: string, ctx: LogContext = {}) => this.error(msg, { ...context, ...ctx }),
    };
  },
};

/**
 * Sanitize an error for client response — strips internal details.
 */
export function sanitizeError(e: any): { message: string; code?: string } {
  if (e?.code) {
    return { message: e.message || "An error occurred", code: e.code };
  }
  // Prisma errors
  if (e?.name?.startsWith("Prisma")) {
    return { message: "Database operation failed", code: "DB_ERROR" };
  }
  // Generic errors — don't leak stack traces or internal messages
  return { message: "An unexpected error occurred", code: "INTERNAL_ERROR" };
}
