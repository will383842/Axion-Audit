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

/** Dépose `contenu` sous le nom `nom` dans les téléchargements de l'appareil. */
export function deposerFichier(nom: string, contenu: string): void {
  const url = URL.createObjectURL(new Blob([contenu], { type: 'application/json' }));
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nom;
  lien.click();
  URL.revokeObjectURL(url);
}
