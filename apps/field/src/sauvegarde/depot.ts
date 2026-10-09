// =============================================================================
// DÉPÔT DU FICHIER DE SECOURS SUR L'APPAREIL — 05 §9.7
//
// Extrait d'`EcranFinDeJournee` le 2026-09-06, quand un SECOND écran a eu besoin
// du même geste : l'écran de restauration, qui met le ré-export en avant dès que
// la persistance n'est pas garantie (D-A27-1, DECISIONS.md). Deux copies de ce
// code auraient divergé sur le type MIME ou sur la libération de l'URL — et la
// seconde copie est toujours celle qu'on oublie de corriger.
//
// 05 §9.7 : « fichier unique chiffré […] **déposable sur le stockage de
// l'appareil ou une clé USB** ». Un `<a download>` synthétique est le seul
// mécanisme disponible HORS LIGNE dans un navigateur ; `showSaveFilePicker`
// n'existe pas sur Safari, qui est la cible dure (03 §22.1).
//
// Traçabilité : E38 (sauvegarde terrain : sync ≥ 1×/j + export de secours).
// =============================================================================

/**
 * Dépose `contenu` sous le nom `nom` dans les téléchargements de l'appareil.
 * Une LISTE de parties (export par segments, revue A29) devient un Blob construit
 * par parties : le fichier n'est jamais réuni en une seule chaîne.
 */
export function deposerFichier(nom: string, contenu: string | readonly string[]): void {
  const parties = typeof contenu === 'string' ? [contenu] : [...contenu];
  const url = URL.createObjectURL(new Blob(parties, { type: 'application/json' }));
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nom;
  lien.click();
  URL.revokeObjectURL(url);
}

/**
 * Le message à l'auditeur quand des photos n'ont pas pu entrer dans la
 * sauvegarde (enveloppe locale illisible) — jamais un silence (invariant 7).
 */
export function messagePiecesIllisibles(piecesIllisibles: readonly string[]): string | null {
  if (piecesIllisibles.length === 0) return null;
  return `Attention : ${String(piecesIllisibles.length)} photo(s) de cet appareil n’ont pas pu être relues et ne sont PAS dans cette sauvegarde. Les autres données y sont. Prévenez le siège.`;
}
