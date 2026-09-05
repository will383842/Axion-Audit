// =============================================================================
// PERSISTANCE ET QUOTA DU STOCKAGE LOCAL — 05 §31-2, 03 §22.1, invariant 8
//
// ── LA RÈGLE, ET CE QU'ELLE INTERDIT ─────────────────────────────────────────
// 05 §31-2, mot pour mot : « appel `navigator.storage.persist()` au premier
// chargement d'une mission ; **si la persistance est refusée par le navigateur,
// la mission N'EST PAS EMBARQUÉE** et l'écran guide l'utilisateur (installation
// sur l'écran d'accueil / libération d'espace) ».
//
// Ce n'est donc PAS un avertissement qu'on clique pour passer outre. Sans
// persistance, iOS purge IndexedDB au bout de sept jours sans usage du site, et
// une semaine, c'est la durée d'une mission. Embarquer quand même reviendrait à
// promettre une sauvegarde qu'on ne tient pas — la faute exacte que le pack
// désigne partout : « un garde-fou qui annonce plus qu'il ne fait ».
//
// ── PORTÉE ASSUMÉE ──────────────────────────────────────────────────────────
// `persist()` n'existe pas partout, et `estimate()` non plus. Quand l'API manque,
// on ne suppose ni le succès ni l'échec : on rend `'indisponible'`, et l'écran le
// dit. 03 §22.1 nomme l'iPad comme la cible la plus dure : sur Safari, la
// persistance longue durée exige l'installation « Sur l'écran d'accueil » — ce
// qui ne se devine pas, d'où le texte de guidage.
//
// Traçabilité : E6 (hors ligne total, PC ET tablette), E38 (sauvegarde terrain :
// sync + export).
// =============================================================================

/**
 * Seuils d'alerte sur le quota.
 *
 * **Ce sont des valeurs choisies, pas des valeurs lues** : le pack demande une
 * « alerte si quota insuffisant » (03 §22.1) et une vérification du quota
 * (05 §31-2) sans jamais donner de nombre. Elles sont nommées ici pour être
 * discutables, et remontées dans le rapport d'auto-revue A24 plutôt que
 * dissimulées dans une condition.
 */
export const SEUIL_ESPACE_TENDU = 0.8;
export const SEUIL_ESPACE_CRITIQUE = 0.95;

export type NiveauEspace = 'inconnu' | 'ok' | 'tendu' | 'critique';

export interface EtatStockage {
  /** Le navigateur garantit-il de ne pas purger cette origine ? `null` = API absente. */
  readonly persistant: boolean | null;
  readonly quotaOctets: number | null;
  readonly utiliseOctets: number | null;
  /** Part du quota consommée, entre 0 et 1. `null` si `estimate()` est indisponible. */
  readonly ratio: number | null;
  readonly niveau: NiveauEspace;
}

function apiStockage(): StorageManager | null {
  // Les types DOM déclarent `navigator.storage` comme TOUJOURS présent ; à
  // l'exécution il manque sur les navigateurs anciens et en contexte non
  // sécurisé. La vue optionnelle ci-dessous dit la vérité d'exécution plutôt que
  // celle de la déclaration — une API absente est un cas NORMAL ici, pas un bug.
  if (typeof navigator === 'undefined') return null;
  const vue: { storage?: StorageManager } = navigator;
  return vue.storage ?? null;
}

/**
 * Demande la persistance du stockage. Rend `null` si l'API n'existe pas — ce qui
 * n'est ni un oui ni un non, et ne doit pas être arrondi en l'un des deux.
 */
export async function demanderPersistance(): Promise<boolean | null> {
  const stockage = apiStockage();
  if (stockage === null || typeof stockage.persist !== 'function') return null;
  if (typeof stockage.persisted === 'function' && (await stockage.persisted())) return true;
  return stockage.persist();
}

/** Mesure l'espace, sans rien demander. Appelé au chargement et avant un embarquement. */
export async function evaluerStockage(): Promise<EtatStockage> {
  const stockage = apiStockage();
  if (stockage === null) {
    return {
      persistant: null,
      quotaOctets: null,
      utiliseOctets: null,
      ratio: null,
      niveau: 'inconnu',
    };
  }

  const persistant = typeof stockage.persisted === 'function' ? await stockage.persisted() : null;

  if (typeof stockage.estimate !== 'function') {
    return { persistant, quotaOctets: null, utiliseOctets: null, ratio: null, niveau: 'inconnu' };
  }

  const estimation = await stockage.estimate();
  const quotaOctets = estimation.quota ?? null;
  const utiliseOctets = estimation.usage ?? null;
  if (quotaOctets === null || quotaOctets === 0 || utiliseOctets === null) {
    return { persistant, quotaOctets, utiliseOctets, ratio: null, niveau: 'inconnu' };
  }

  const ratio = utiliseOctets / quotaOctets;
  const niveau: NiveauEspace =
    ratio >= SEUIL_ESPACE_CRITIQUE ? 'critique' : ratio >= SEUIL_ESPACE_TENDU ? 'tendu' : 'ok';
  return { persistant, quotaOctets, utiliseOctets, ratio, niveau };
}

export type MotifRefusPersistance = 'refusee_par_le_navigateur' | 'api_indisponible';

export type ResultatPersistance =
  | { readonly accordee: true; readonly etat: EtatStockage }
  | {
      readonly accordee: false;
      readonly motif: MotifRefusPersistance;
      /** Ce que l'auditeur doit FAIRE (03 §17.6 : la cause ET l'action). */
      readonly guidage: string;
      readonly etat: EtatStockage;
    };

const GUIDAGE_REFUS =
  'Le navigateur refuse de garantir la conservation des données de cet appareil. ' +
  'Installez l’application sur l’écran d’accueil (Partager, puis « Sur l’écran d’accueil »), ' +
  'puis libérez de l’espace si nécessaire, et réessayez. Tant que ce n’est pas fait, la mission ne peut pas être embarquée.';

const GUIDAGE_INDISPONIBLE =
  'Ce navigateur ne sait pas garantir la conservation des données hors ligne. ' +
  'Utilisez Safari (iPad, version 16.4 ou plus) ou Chrome/Edge à jour, puis installez l’application sur l’écran d’accueil.';

/**
 * La porte d'entrée du 05 §31-2 : sans persistance ACCORDÉE, la mission n'est pas
 * embarquée. La fonction ne décide pas de l'écran — elle rend un verdict et le
 * texte qui l'accompagne ; c'est `embarquement.ts` qui refuse.
 */
export async function exigerPersistance(): Promise<ResultatPersistance> {
  const accordee = await demanderPersistance();
  const etat = await evaluerStockage();
  if (accordee === true) return { accordee: true, etat };
  return {
    accordee: false,
    motif: accordee === null ? 'api_indisponible' : 'refusee_par_le_navigateur',
    guidage: accordee === null ? GUIDAGE_INDISPONIBLE : GUIDAGE_REFUS,
    etat,
  };
}

/**
 * Le message d'alerte d'espace, ou `null` s'il n'y a rien à dire.
 *
 * Il est calculé ici et pas dans un écran : deux écrans qui formulent la même
 * alerte finissent par ne plus dire la même chose, et le cockpit (03 §34.2)
 * comme l'embarquement doivent parler d'une seule voix.
 */
export function alerteEspace(etat: EtatStockage): string | null {
  switch (etat.niveau) {
    case 'critique':
      return 'Espace de stockage presque saturé sur cet appareil. Synchronisez et exportez une sauvegarde MAINTENANT, puis libérez de l’espace avant de reprendre la collecte.';
    case 'tendu':
      return 'L’espace de stockage de cet appareil se remplit. Synchronisez dès que possible et évitez les photos non indispensables.';
    case 'ok':
    case 'inconnu':
      return null;
  }
}
