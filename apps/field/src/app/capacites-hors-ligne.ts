// =============================================================================
// CE QUE CET APPAREIL SAIT FAIRE SANS RÉSEAU — une liste par vue, au même endroit
//
// ── POURQUOI CE FICHIER EXISTE ──────────────────────────────────────────────
// 03 §33.2 : l'état hors ligne est « pastille discrète + RAPPEL DES CAPACITÉS
// LOCALES ». Le contrôle A02 de la porte P-C a mesuré que la seconde moitié
// n'était rendue que par 3 vues sur 11 — et de TROIS façons différentes, avec
// TROIS listes écrites séparément (`EcranAccueil`, `EcranEntretien`,
// `EcranAujourdhui`). Une règle recopiée trois fois avait déjà commencé à
// diverger : « Photographier » avait été retiré de l'une le 2026-09-05 et
// laissée dans l'autre — le mensonge réparé à un endroit sur deux (bloquant B3).
//
// Les rassembler ici ne les uniformise pas : elles restent DISTINCTES parce que
// les écrans ne promettent pas la même chose. Ce qu'on gagne, c'est de voir la
// divergence d'un coup d'œil, dans un seul fichier, au lieu de la découvrir en
// recette.
//
// ── LE GARDE EST DANS LE TYPE, PAS DANS UNE CONSIGNE ────────────────────────
// `satisfies Record<CodeVue, ListeNonVide<string>>` fait DEUX choses qu'aucun
// commentaire ne ferait :
//   · une vue ajoutée au registre `vues.ts` sans ses capacités ne COMPILE pas —
//     c'est la seule manière connue pour que le douzième écran ne redevienne pas
//     un écran sans état hors ligne ;
//   · une liste vide ne compile pas non plus (`ListeNonVide`, A28) : un écran qui
//     dit « hors ligne » sans énumérer ce qui marche laisse l'auditeur croire
//     qu'il doit attendre le réseau, et un auditeur qui attend le réseau dans un
//     sous-sol d'usine ne collecte rien.
// L'`as const` n'est donc pas décoratif : c'est lui qui produit les tuples que
// `ListeNonVide` exige.
//
// ── LA RÈGLE DE RÉDACTION : NE JAMAIS PROMETTRE CE QUI N'EXISTE PAS ─────────
// Chaque ligne est une capacité que l'application tient AUJOURD'HUI, hors ligne.
// Le contre-exemple est documenté : « Photographier » a été écrit ici avant que
// la capture existe, l'auditeur a cherché le geste, trouvé un bouton grisé, et
// photographié avec son téléphone personnel — la pièce d'audit sortait alors du
// coffre chiffré et de l'invariant 8. Une capacité fausse coûte plus cher qu'une
// capacité absente. `photo.acceptation-b3.test.ts` balaie ce fichier comme les
// autres.
//
// Traçabilité : E6 (hors ligne total, PC ET tablette), E44 (UX/UI 2026-2027 —
// grille §33, les quatre états), E38 (sauvegarde terrain).
// =============================================================================
import type { ListeNonVide } from '@axion/ui';
import type { CodeVue } from './vues.js';

/**
 * La pastille est-elle rendue par `RappelHorsLigne` sur les écrans de la coquille ?
 *
 * **Non — et ce n'est pas un oubli.** La coquille pose UNE pastille de
 * synchronisation dans son en-tête, sur les onze vues (décision A01 du
 * 2026-09-05, `App.tsx`), alimentée par le PORT DE SYNC. Celle de
 * `RappelHorsLigne` serait une SECONDE pastille sur le même écran, alimentée par
 * `navigator.onLine` : deux sources, deux mots possibles — le bloquant B6 de la
 * recette novice du 2026-09-06.
 *
 * §33.2 exige ses deux moitiés sur l'ÉCRAN, pas dans le même composant. L'en-tête
 * porte la pastille ; ce module porte les capacités.
 *
 * ── CE QUE CETTE CONSTANTE NE SUFFIT PAS À GARANTIR (revue A29, ①) ──────────
 * Elle empêche le RAPPEL d'en rendre une ; elle n'empêche pas un écran d'en
 * rendre une ailleurs. C'était le cas de l'écran d'entretien jusqu'au
 * 2026-09-06 — B6 y est resté ouvert quatre jours après avoir été « fermé »,
 * parce que le geste n'avait porté que sur l'accueil. Le compte réel est mesuré
 * sur le DOM, écran par écran, dans `app/hors-ligne.test.tsx` (bloc D), et
 * coquille comprise pour l'entretien (bloc E). **Une affirmation de fermeture
 * qu'aucune mesure ne tient est ce qui a permis au défaut de durer.**
 */
export const PASTILLE_PORTEE_PAR_LA_COQUILLE = false;

/**
 * Les capacités locales, une liste par vue du registre.
 *
 * Écrites à la deuxième personne implicite, à l'infinitif, sans jargon : elles
 * sont lues debout, dans un couloir, par quelqu'un qui vient de perdre le réseau.
 */
export const CAPACITES_HORS_LIGNE = {
  // ── Avant l'ouverture du coffre ──────────────────────────────────────────
  // 05 §31-3, presque mot pour mot : « le déverrouillage local continue de
  // fonctionner, la collecte se poursuit sans interruption ; seule la
  // SYNCHRONISATION attend une reconnexion. »
  deverrouillage: [
    'Déverrouiller cet appareil : le mot de passe est vérifié ici, jamais envoyé',
    'Reprendre la collecte là où elle s’est arrêtée, sans aucune connexion',
    'Restaurer une sauvegarde de secours une fois l’appareil ouvert',
  ],
  stockage: [
    'Vérifier l’espace utilisé et redemander la conservation durable',
    'Mener les entretiens des missions déjà embarquées',
    'Exporter une sauvegarde de secours chiffrée',
  ],

  // ── Le socle (L5a) ───────────────────────────────────────────────────────
  // Liste d'origine d'`EcranAccueil`, déplacée telle quelle : elle avait été
  // corrigée le 2026-09-06 (retrait de la promesse de photo) et fait foi.
  accueil: [
    'Mener un entretien et enregistrer chaque réponse',
    'Prendre des notes et des notes volantes',
    'Retrouver n’importe quelle question du questionnaire figé',
  ],

  // ── L'entretien (L5b) ────────────────────────────────────────────────────
  // RÉÉCRITE le 2026-09-06 (revue A29, réserve ②). La ligne disait « Démarrer
  // aussitôt, ou le laisser planifié pour plus tard » : l'écran n'offre AUCUN
  // choix — un seul bouton, et `creerEntretien` écrit toujours
  // `status: 'non_demarre'`. Laisser pour plus tard se fait sur `EcranAgenda`,
  // qui est un autre écran. Exactement la classe B3, rouverte dans le fichier
  // écrit pour l'empêcher.
  nouvelEntretien: [
    'Créer un entretien : nom, fonction et unité s’enregistrent sur cet appareil',
    'Rattacher l’entretien à une mission et une unité déjà embarquées',
    'Enchaîner sur les questions du questionnaire figé, déjà présentes ici',
  ],
  // Liste d'origine d'`EcranEntretien`, déplacée telle quelle.
  entretien: [
    'Répondre à chaque question, la marquer à revoir, sans objet ou non communiquée',
    'Prendre des notes et des notes volantes',
    'Ajouter une question ad hoc ou en retrouver une hors parcours',
  ],

  // ── La journée (L5c) ─────────────────────────────────────────────────────
  // Liste d'origine d'`EcranAujourdhui`, déplacée telle quelle.
  aujourdhui: [
    'Ouvrir, mener et terminer une session de collecte',
    'Annoter, signaler un point à revoir, terminer une session',
    'Exporter une sauvegarde de secours chiffrée',
  ],
  // RÉÉCRITE le 2026-09-06 (revue A29, réserve ②). « avant de valider un
  // créneau » était faux, et le code le dit deux fois : l'anti-collision est
  // « calculée AVANT, affichée APRÈS, et ne conditionne RIEN » (§25.2 « non
  // bloquant », §34.6, §19.1). Promettre un garde-fou qui n'existe pas est pire
  // que de n'en promettre aucun : l'auditeur cesse de vérifier lui-même.
  agenda: [
    'Planifier une session : date, heure, personne, fonction et unité',
    'Être averti d’un créneau déjà occupé — l’avertissement n’empêche jamais',
    'Ouvrir, mener et terminer une session de collecte',
  ],
  // RÉÉCRITE le 2026-09-06 (revue A29, réserve ②). « sauter à l'écran qui le
  // résout » promettait ce saut pour CHAQUE étape ; `EcranPilote` n'en offre
  // qu'un, celui de la collecte — « les autres se résolvent au siège, et l'écran
  // le dit plutôt que d'offrir un bouton qui ne mène nulle part ».
  pilote: [
    'Consulter l’avancement de la mission, calculé sur cet appareil',
    'Voir ce qui manque à chaque étape, et rejoindre l’agenda quand c’est la collecte',
    'Ouvrir, mener et terminer une session de collecte',
  ],
  finDeJournee: [
    'Exporter une sauvegarde de secours chiffrée — le geste qui protège la journée',
    'Valider en une fois les entretiens terminés du jour',
    'Relire la synthèse du jour : points à revoir ouverts, entretiens non validés',
  ],
  restauration: [
    'Restaurer une sauvegarde de secours, intégralement sans réseau',
    'Ré-exporter aussitôt la sauvegarde restaurée sur cet appareil',
    'Reprendre la collecte dès la restauration terminée',
  ],
  finDeSession: [
    'Terminer une session, la rouvrir, la valider ou la déverrouiller',
    'Relire le récapitulatif : questions sans réponse, points à revoir, accord',
    'Prendre des notes et des notes volantes',
  ],

  // ── Le rattachement au siège (L5b, PR #80) ───────────────────────────────
  // LE SEUL ÉCRAN DONT LA FONCTION EXIGE LE RÉSEAU, et c'est pour cela que le
  // rappel y compte le plus : le taire enverrait l'auditeur réessayer en boucle.
  //
  // Ces trois lignes ont été écrites par l'auteur de #80 DIRECTEMENT dans son
  // écran, en dur — une quatrième liste, à peine ce fichier créé pour qu'il n'y
  // en ait qu'une. Ce n'est pas un reproche : c'est la démonstration que le
  // regroupement ne tient pas par discipline. Elles sont déplacées telles
  // quelles, au style des autres (majuscule, infinitif), et le garde de type les
  // exigeait de toute façon — la douzième vue a fait rougir `pnpm typecheck` à
  // la fusion, ce qui est exactement son travail.
  connexionSiege: [
    'Ouvrir ce qui est déjà enregistré sur cet appareil',
    'Restaurer une sauvegarde de secours chiffrée',
    'Collecter, dès que cet appareil sera rattaché',
  ],
} as const satisfies Record<CodeVue, ListeNonVide<string>>;
