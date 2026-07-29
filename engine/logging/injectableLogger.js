/**
 * Optional structured logging for governance / CSSV hot paths.
 * Default: no-op (no console). Hosts may inject a sink at boot.
 *
 * @typedef {{ debug?: Function, info?: Function, warn?: Function, error?: Function }} LogSink
 */

/** @type {LogSink | null} */
let sink = null;

/**
 * @param {LogSink | null} next
 */
export function setInjectableLogger(next) {
  sink = next;
}

/** @returns {LogSink | null} */
export function getInjectableLogger() {
  return sink;
}

/**
 * @param {"debug"|"info"|"warn"|"error"} level
 * @param {string} tag
 * @param {string} message
 * @param {Record<string, unknown>} [meta]
 */
export function logStructured(level, tag, message, meta) {
  const fn = sink?.[level];
  if (typeof fn === "function") {
    fn({ tag, message, ...(meta ?? {}) });
    return;
  }
}
