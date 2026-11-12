// Event log kept in memory. The diagnostics panel is removed; logDiag stays so the rest of the code can keep calling it.
const DIAG_LIMIT = 80;
const DIAG_LOG = [];

function logDiag(type, data) {
  let text = typeof data === "string" ? data : JSON.stringify(data);
  if (text === undefined) text = String(data);
  DIAG_LOG.push(`${new Date().toTimeString().slice(0, 8)} ${type} ${String(text).slice(0, 300)}`);
  if (DIAG_LOG.length > DIAG_LIMIT) DIAG_LOG.shift();
}
