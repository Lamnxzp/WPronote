import { styleText } from "node:util";

const COLORS = [
  "blue",
  "green",
  "yellow",
  "red",
  "gray",
  "cyan",
  "dim",
  "white",
];
const colorize = (color, text) =>
  styleText(COLORS.includes(color) ? color : "white", text);

// Standard log levels
const LOG_LEVELS = {
  INFO: { color: "blue", prefix: "ℹ️", label: "INFO" },
  SUCCESS: { color: "green", prefix: "✅", label: "SUCCESS" },
  WARNING: { color: "yellow", prefix: "⚠️", label: "WARN" },
  ERROR: { color: "red", prefix: "❌", label: "ERROR" },
  DEBUG: { color: "gray", prefix: "🔍", label: "DEBUG" },
};

// Utility to get a formatted timestamp
const getTimestamp = () => {
  return new Date().toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

/**
 * The private, core logging function.
 * @param {object} options - The logging options.
 * @param {string} options.label - The label for the log entry (e.g., "INFO").
 * @param {string} options.message - The main log message.
 * @param {string} [options.color='white'] - The name of the color to use.
 * @param {string} [options.prefix=''] - An emoji or icon prefix.
 * @param {string|string[]} [options.details] - Additional details to log.
 */
const _log = ({
  label,
  message,
  color = "white",
  prefix = "",
  details = null,
}) => {
  const timestamp = styleText("dim", `[${getTimestamp()}]`);
  const levelLabel = colorize(color, `[${label}]`);

  console.log(`${timestamp} ${levelLabel} ${prefix} ${message}`);

  if (details) {
    const detailsArray = Array.isArray(details) ? details : details.split("\n");
    detailsArray.forEach((detailLine) => {
      console.log(styleText("dim", `      ${detailLine.trim()}`));
    });
  }
};

export const logger = {
  /** Logs an informational message. */
  info: (message, details) => _log({ ...LOG_LEVELS.INFO, message, details }),
  /** Logs a success message. */
  success: (message, details) =>
    _log({ ...LOG_LEVELS.SUCCESS, message, details }),
  /** Logs a warning message. */
  warning: (message, details) =>
    _log({ ...LOG_LEVELS.WARNING, message, details }),
  /** Logs an error message. */
  error: (message, details) => _log({ ...LOG_LEVELS.ERROR, message, details }),
  /** Logs a debug message. */
  debug: (message, details) => _log({ ...LOG_LEVELS.DEBUG, message, details }),

  /**
   * Logs a message with custom formatting.
   * @param {object} options - The custom logging options.
   * @param {string} options.label - The label for the log entry.
   * @param {string} options.message - The main log message.
   * @param {string} [options.color='white'] - The name of the color.
   * @param {string} [options.prefix=''] - An icon prefix.
   * @param {string|string[]} [options.details] - Additional details.
   */
  custom: ({ label, message, color, prefix, details }) => {
    // The message itself is also colored
    const coloredMessage = colorize(color, message);
    _log({ label, message: coloredMessage, color, prefix, details });
  },

  /**
   * Logs a raw, unformatted string, with an optional color.
   * @param {string} message - The message to log.
   * @param {string} [color] - The name of the color to use.
   */
  raw: (message, color = null) => {
    console.log(color ? colorize(color, message) : message);
  },
};
