// =============================================================================
// L'HORLOGE DU TERRAIN — 05 §9.2, scénario @critique « horloge locale +3 h »
//
// 05 §9.2 : « `client_updated_at` = horloge locale + offset serveur estimé à la
// dernière sync ». 05 §9.4 fonde l'arbitrage des conflits (dernier écrit gagne,
// par LIGNE) sur cet horodatage. Une tablette déréglée de trois heures ferait
// donc gagner systématiquement ses lignes — c'est exactement le scénario
// @critique du 05 §9.8, et il ne se voit qu'en mission, sur les données d'un
// client.
//
// ── LA RÈGLE, ET POURQUOI ELLE EST ABSOLUE ───────────────────────────────────
// **`new Date()` et `Date.now()` n'existent NULLE PART AILLEURS dans
// `apps/field`.** Ce module est le seul point d'entrée du temps. La règle est
// outillée par un test ESLint écrit par A26 (`LOT_L5.md` §4, « interdits
// outillés ») : une consigne que rien ne vérifie ne survit pas à quarante
// fichiers écrits par trois mains en huit jours.
//
// ── CE QUE CE MODULE NE FAIT PAS ─────────────────────────────────────────────
// Il ne persiste rien et ne lit pas IndexedDB : c'est une VALEUR de session,
// rechargée au démarrage par l'appelant (`restaurerDecalage`) depuis `meta`.
// Sans cette séparation, l'horloge dépendrait de la base et la base de
// l'horloge — un cycle qu'aucun test unitaire ne pourrait dénouer.
//
// Traçabilité : E32 (fuseaux, devises, interface française), E9 (multi-consultants,
// sync sans conflit).
// =============================================================================

/**
 * Décalage estimé entre l'horloge de l'appareil et celle du serveur, en
 * millisecondes. Positif = l'appareil RETARDE.
 */
let decalageMs = 0;

/** Horodatage de la dernière estimation — sert à dire à l'auditeur ce qu'on sait. */
let estimeLe: string | null = null;

/**
 * Règle le décalage à partir du `serverTime` d'une réponse de sync (11 §4 : le
 * pull comme le push en renvoient un).
 *
 * L'aller-retour réseau n'est PAS compensé ici : sans mesure de la latence, toute
 * correction serait une invention. L'erreur résiduelle est de l'ordre de la
 * seconde ; l'écart qu'on corrige est de l'ordre de l'heure.
 */
export function reglerDecalage(serverTime: string): void {
  const serveurMs = Date.parse(serverTime);
  if (Number.isNaN(serveurMs)) {
    throw new TypeError(`Horodatage serveur illisible : « ${serverTime} ».`);
  }
  decalageMs = serveurMs - Date.now();
  estimeLe = new Date(serveurMs).toISOString();
}

/**
 * Restaure un décalage déjà connu (relecture de `meta` au démarrage).
 *
 * Il n'est PAS équivalent de laisser l'horloge à zéro jusqu'à la première sync :
 * une mission entière peut se dérouler hors ligne (invariant 1), et les lignes
 * écrites entre-temps porteraient l'heure fausse de l'appareil.
 */
export function restaurerDecalage(ms: number, estimeLeIso: string | null = null): void {
  if (!Number.isFinite(ms)) {
    throw new TypeError('Décalage d’horloge non numérique.');
  }
  decalageMs = ms;
  estimeLe = estimeLeIso;
}

/** Le décalage courant, pour le persister dans `meta` et pour l'afficher. */
export function decalageActuelMs(): number {
  return decalageMs;
}

/** Quand le décalage a-t-il été estimé ? `null` = jamais synchronisé. */
export function decalageEstimeLe(): string | null {
  return estimeLe;
}

/**
 * **L'instant courant, en ISO 8601 UTC.** Le seul « maintenant » de l'app terrain.
 *
 * UTC en base et en API (11 §3, invariant 5) ; le fuseau de mission n'intervient
 * qu'à l'AFFICHAGE (03 §22.2), donc jamais ici.
 */
export function maintenant(): string {
  return new Date(Date.now() + decalageMs).toISOString();
}

/** Le même instant en millisecondes epoch — pour comparer deux horodatages. */
export function instantMs(): number {
  return Date.now() + decalageMs;
}

/**
 * L'instant LOCAL, non corrigé.
 *
 * Réservé aux durées mesurées sur l'appareil : le compte à rebours du verrou
 * (05 §9.7), un `setTimeout`. Y appliquer le décalage serveur serait un contresens
 * — on mesure une inactivité vécue par l'auditeur, pas une position dans le temps
 * du serveur. Il existe surtout pour que le reste du code n'ait JAMAIS de raison
 * d'écrire `Date.now()` lui-même.
 */
export function instantLocalMs(): number {
  return Date.now();
}

/**
 * Remet l'horloge à son état neuf (décalage nul, aucune estimation).
 *
 * Utilisé au verrouillage complet / déchargement de mission, et par les tests
 * pour garantir leur indépendance. Un module à état partagé sans remise à zéro
 * fabrique des tests qui dépendent de leur ordre d'exécution.
 */
export function reinitialiserHorloge(): void {
  decalageMs = 0;
  estimeLe = null;
}
