// Reject oversized or structurally dangerous JSON before merging it into state.
// Business permissions and validation still belong on the server.
export function validatePlanningData(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Format du planning invalide.");
  if (JSON.stringify(data).length > 10_000_000) throw new Error("Planning trop volumineux.");
  let count = 0;
  function visit(value, depth) {
    if (++count > 200_000 || depth > 30) throw new Error("Planning trop complexe.");
    if (typeof value === "string" && value.length > 100_000) throw new Error("Champ du planning trop long.");
    if (!value || typeof value !== "object") return;
    for (const key of Object.keys(value)) {
      if (["__proto__", "constructor", "prototype"].includes(key)) throw new Error("Clé de planning interdite.");
      visit(value[key], depth + 1);
    }
  }
  visit(data, 0);
  for (const key of ["teachers", "activities", "facilities", "cycles", "constructionRules", "constructionVersions", "sportEvents", "asSessions", "facilityUnavailability"]) {
    if (data[key] !== undefined && (!Array.isArray(data[key]) || data[key].some(item => !item || typeof item !== "object" || Array.isArray(item)))) throw new Error("Liste du planning invalide : " + key);
  }
  if (data.teachers?.some(item => typeof item.id !== "string" || typeof item.name !== "string" || !item.weekTargets || !Number.isFinite(item.weekTargets.A) || !Number.isFinite(item.weekTargets.B))) throw new Error("Données des professeurs incomplètes.");
}
