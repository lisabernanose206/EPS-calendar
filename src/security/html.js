import DOMPurify from "dompurify";

// Every HTML insertion passes through this boundary, including cached/cloud data.
// SVG is required by the application's icons; active content is never allowed.
export function safeHtml(markup) {
  return DOMPurify.sanitize(String(markup ?? ""), {
    USE_PROFILES: { html: true, svg: true },
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "link", "meta", "base", "foreignObject"],
    FORBID_ATTR: ["srcdoc", "action", "formaction", "srcset", "ping"],
    ALLOW_UNKNOWN_PROTOCOLS: false
  });
}
