export function secureBackendUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("Adresse du serveur refusée : une origine HTTPS est requise.");
  }
  return url.origin;
}

export function isSecureBackend(value) {
  try { secureBackendUrl(value); return true; } catch { return false; }
}
