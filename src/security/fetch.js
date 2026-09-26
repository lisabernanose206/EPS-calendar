// Never forward credentials or a refresh-token body through an HTTP redirect.
export function fetchBackend(url, options = {}) {
  const target = new URL(url);
  if (target.protocol !== "https:" || target.username || target.password) throw new Error("Destination réseau refusée.");
  return fetch(url, { ...options, redirect: "error", signal: options.signal || AbortSignal.timeout(15000) });
}
