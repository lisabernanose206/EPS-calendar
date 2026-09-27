// Shared by the application and the static 404 builder; no app dependencies.
const copy = {
  notFound: ["404", "Loustic a perdu la piste…", "Cette page est introuvable. Le lien a peut-être changé, mais votre planning vous attend à l’accueil."],
  unexpected: ["OUPS", "Loustic a trébuché…", "Un imprévu empêche l’affichage de cette page. Réessayez ou revenez au planning."],
  loading: ["UN INSTANT", "Loustic retrouve votre planning", "Lecture de Supabase en cours. Le planning sera disponible après confirmation du serveur."],
  load: ["CONNEXION", "Le planning se fait attendre…", "Impossible de charger le planning. Vérifiez votre connexion Internet, puis réessayez. Si le problème persiste, reconnectez-vous."],
  startup: ["OUPS", "Loustic n’a pas pu démarrer", "L’application n’a pas pu s’ouvrir correctement. Vous pouvez tenter de la recharger."]
};
const escape = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export function renderErrorState(kind = "unexpected", { icon = "./assets/icon_app_small.png", home = "./", headingId = "loustic-error-title" } = {}) {
  const [code, title, message] = copy[kind] || copy.unexpected;
  const actions = kind === "notFound" ? '<a class="lousticErrorPrimary" href="' + escape(home) + '">Revenir à l’accueil <span aria-hidden="true">↗</span></a>'
    : kind === "loading" ? ''
    : kind === "startup" ? '<button class="lousticErrorPrimary" data-error-reload>Recharger l’application</button>'
    : '<button class="lousticErrorPrimary" ' + (kind === "load" ? 'id="retryCloudLoad"' : 'data-error-retry') + '>Réessayer</button>' + (kind === "load" ? '' : '<button class="lousticErrorSecondary" data-error-home>Revenir au planning</button>');
  return '<section class="lousticError" aria-labelledby="' + escape(headingId) + '"><div class="lousticErrorBrand">EPS <strong>LOUSTIC</strong><span>Le planning garde le cap.</span></div><div class="lousticErrorScene" aria-hidden="true"><span class="lousticErrorOrbit"></span><span class="lousticErrorSpark">✦</span><img src="' + escape(icon) + '" alt="" width="180" height="180"><span class="lousticErrorDot"></span></div><p class="lousticErrorCode">' + code + '</p><h1 id="' + escape(headingId) + '" tabindex="-1">' + title + '</h1><p class="lousticErrorMessage">' + message + '</p><div class="lousticErrorActions">' + actions + '</div>' + (["unexpected", "startup"].includes(kind) ? '<p class="lousticErrorNote">Une modification n’est enregistrée qu’après confirmation de Supabase. Évitez de fermer cet onglet si une sauvegarde est en attente.</p>' : '') + '</section>';
}
