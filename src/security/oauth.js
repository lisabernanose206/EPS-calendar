import { secureBackendUrl } from "./transport.js";

const key = "planningEpsOAuthPKCE";
const base64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function createOAuthChallenge(backend, redirect) {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  sessionStorage.setItem(key, JSON.stringify({ verifier, backend: secureBackendUrl(backend), redirect, created: Date.now() }));
  return challenge;
}

export function consumeOAuthVerifier(backend, redirect) {
  const saved = sessionStorage.getItem(key);
  sessionStorage.removeItem(key);
  const pending = saved ? JSON.parse(saved) : null;
  if (!pending || !/^[A-Za-z0-9_-]{43}$/.test(pending.verifier) || pending.backend !== secureBackendUrl(backend) || pending.redirect !== redirect || !Number.isFinite(pending.created) || Date.now() - pending.created > 10 * 60 * 1000 || pending.created > Date.now()) {
    throw new Error("Connexion expirée ou non initiée dans cet onglet. Relancez la connexion Google.");
  }
  return pending.verifier;
}

export function clearOAuthVerifier() { sessionStorage.removeItem(key); }
