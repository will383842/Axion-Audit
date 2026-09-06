// =============================================================================
// DÉPÔT DE L'OUTBOX — le compteur qui alimente le garde-fou du 05 §9.7
//
// `LOT_L5.md` §3.3-② : « le compteur qui alimentera `sync_log.outbox_remaining`
// est VRAI PAR CONSTRUCTION, pas déclaratif ». C'est ce fichier qui le rend vrai :
// il compte la file réelle, jamais une valeur mémorisée ailleurs.
//
// Ce que ce compteur commande, et qui n'est pas un détail d'affichage :
//   - le serveur REFUSE une réinitialisation de mot de passe tant que le dernier
//     `outbox_remaining` connu est > 0 (05 §9.7, V2.9) ;
//   - l'alerte « aucune sync depuis 24 h » de l'invariant 8 s'appuie dessus ;
//   - `LOT_L5.md` §3.3-① interdit qu'une op sorte de la file sans réponse serveur,
//     donc le compte ne peut pas être « nettoyé » pour faire joli.
//
// Traçabilité : E38 (sauvegarde terrain : sync + export), E7 (remontée continue).
// =============================================================================
import { contexteLocal } from '../contexte.js';
import { TAILLE_LOT_PUSH_MAX } from '../contrat-sync.js';
import type { LigneOutbox, StatutOpLocale } from '../base.js';

export const depotOutbox = {
  /** Le nombre d'opérations ENCORE À MONTER — la seule définition de « outbox non vide ». */
  async operationsEnAttente(missionId?: string): Promise<number> {
    const { base } = contexteLocal();
    const collection = base.outbox.where('statut').equals('en_attente');
    if (missionId === undefined) return collection.count();
    return collection.filter((op) => op.missionId === missionId).count();
  },

  /** Le décompte par statut : ce que l'écran de sync doit montrer sans mentir. */
  async compterParStatut(missionId?: string): Promise<Record<StatutOpLocale, number>> {
    const { base } = contexteLocal();
    const comptes: Record<StatutOpLocale, number> = { en_attente: 0, rejetee: 0, a_examiner: 0 };
    await base.outbox.each((op) => {
      if (missionId === undefined || op.missionId === missionId) comptes[op.statut] += 1;
    });
    return comptes;
  },

  /**
   * Le prochain lot à pousser, dans l'ORDRE DE LA FILE (11 §4 : « lots de 100 max,
   * ordre de file préservé »).
   *
   * L'ordre vient du tri sur `opId` : un UUID v7 est ordonnable dans le temps
   * (invariant 1), donc l'ordre des identifiants EST l'ordre d'écriture. Aucun
   * compteur séparé à maintenir, donc aucun compteur qui puisse dériver.
   *
   * **Lecture seule.** Le push lui-même — et la sortie de file sur réponse
   * serveur — appartiennent à L6a ; les mettre ici reviendrait à écrire le lot
   * d'un autre incrément.
   */
  async prochainLot(
    missionId: string,
    taille: number = TAILLE_LOT_PUSH_MAX,
  ): Promise<LigneOutbox[]> {
    const { base } = contexteLocal();
    return base.outbox
      .where('[statut+opId]')
      .between(['en_attente', ''], ['en_attente', '￿'])
      .filter((op) => op.missionId === missionId)
      .limit(taille)
      .toArray();
  },

  /** Les opérations bloquées : `rejetee` (05 §9.9) et `a_examiner` (05 §9.3). */
  async aTraiterParUnHumain(missionId?: string): Promise<LigneOutbox[]> {
    const { base } = contexteLocal();
    return base.outbox
      .filter(
        (op) =>
          op.statut !== 'en_attente' && (missionId === undefined || op.missionId === missionId),
      )
      .toArray();
  },
};
