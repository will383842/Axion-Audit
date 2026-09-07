// =============================================================================
// GALERIE — LES QUATRE ÉTATS DE §33.2. Page `/design`.
//
// « Chaque écran et chaque liste livre ses QUATRE états : vide, chargement,
// erreur, hors ligne. » C'est la section de la page qu'un relecteur de la porte
// P-C regarde en premier, parce que c'est celle qui se coche écran par écran.
//
// `ZoneEtat` y montre ses CINQ natures d'affilée : c'est le seul endroit du
// dépôt où les quatre états et le nominal se comparent côte à côte, sur le même
// contenu. Comparer est le point — un état vide qui ne dit pas quoi faire ne se
// voit qu'à côté d'un état vide qui le dit.
//
// Traçabilité : E27 (design moderne, charte, WCAG AA), E44 (UX/UI 2026-2027 —
// tokens, police locale).
// =============================================================================
import type { ReactNode } from 'react';
import {
  Bouton,
  EtatErreur,
  EtatHorsLigne,
  EtatVide,
  IconeCorbeilleVide,
  RappelHorsLigne,
  Squelette,
  ZoneEtat,
} from '@axion/ui';
import type { FicheComposant } from './types.js';

/** Les capacités locales d'un écran d'exemple — même forme qu'en terrain. */
const CAPACITES = [
  'Répondre à chaque question, la marquer à revoir ou sans objet',
  'Prendre des notes et des notes volantes',
  'Exporter une sauvegarde de secours chiffrée',
] as const;

/** Le contenu « réel » qu'une `ZoneEtat` rend quand tout va bien. */
function ContenuNominal(): ReactNode {
  return (
    <ul className="axn-design__liste">
      <li>Responsable logistique — 18 réponses</li>
      <li>Préparateur de commandes — 12 réponses</li>
      <li>Chef d’équipe nuit — 9 réponses</li>
    </ul>
  );
}

export const FICHES_ETATS = {
  Squelette: {
    famille: 'etats',
    role: 'L’attente : des blocs aux dimensions FINALES, jamais un rotor plein écran.',
    origine: { source: '33.5' },
    demonstrations: [
      {
        etat: 'chargement',
        intitule: 'Une carte qui charge',
        propos:
          'Les dimensions finales évitent le saut de mise en page à l’arrivée des ' +
          'données — le saut qui fait cliquer à côté.',
        Apercu: () => <Squelette forme="carte" libelle="Chargement de la mission" />,
      },
      {
        etat: 'variantes',
        intitule: 'Titre, lignes, pastille',
        propos: 'La forme se règle sur ce qui va vraiment arriver, pas sur un gabarit unique.',
        Apercu: () => (
          <>
            <Squelette forme="titre" libelle="Chargement du titre" />
            <Squelette forme="ligne" lignes={3} libelle="Chargement des réponses" />
            <Squelette forme="pastille" libelle="Chargement de l’état de synchronisation" />
          </>
        ),
      },
    ],
  },
  EtatVide: {
    famille: 'etats',
    role: 'Le vide qui dit QUOI FAIRE (§17.6) — pas « aucun résultat » et rien d’autre.',
    origine: { source: '33.5' },
    demonstrations: [
      {
        etat: 'vide',
        intitule: 'Avec l’action qu’il annonce',
        propos:
          'La description est à l’impératif et le bouton exécute exactement ce ' +
          'qu’elle promet. C’est la règle qui distingue un état vide d’un cul-de-sac.',
        Apercu: () => (
          <EtatVide
            titre="Aucun entretien aujourd’hui"
            description="Planifiez une session, ou démarrez un entretien directement depuis une unité."
            icone={<IconeCorbeilleVide />}
            actions={<Bouton>Planifier une session</Bouton>}
          />
        ),
      },
      {
        etat: 'variantes',
        intitule: 'Sans action possible',
        propos:
          'Quand rien ne se fait depuis cet écran, la description dit OÙ le faire. Un ' +
          'bouton qui ne mène nulle part serait pire que pas de bouton.',
        Apercu: () => (
          <EtatVide
            titre="Aucune question hors parcours"
            description="Les questions ajoutées en cours d’entretien apparaîtront ici, avec leur motif."
          />
        ),
      },
    ],
  },
  EtatErreur: {
    famille: 'etats',
    role: 'Cause + action en français ; le code technique existe mais reste REPLIÉ.',
    origine: {
      source: 'hors-33.5',
      justification:
        '§33.5 énumère les composants, §33.2 énumère les états. L’état d’erreur y est ' +
        'exigé de tout écran : sans primitive partagée, chaque écran réécrit sa ' +
        'formulation, et la moitié affiche la trace technique.',
      renvoi: '03 §33.2 (les quatre états) · §17.6 (cause et action)',
    },
    demonstrations: [
      {
        etat: 'erreur',
        intitule: 'Erreur complète, détails repliés',
        propos:
          'Le `<details>` fermé est le seul endroit où un code technique a sa place. ' +
          'Ouvrez-le : il est là pour le support, pas pour l’auditeur.',
        Apercu: () => (
          <EtatErreur
            cause="La mission n’a pas pu être chargée."
            action="Vérifiez la connexion, puis relancez la synchronisation."
            details="MISSION_NOT_FOUND — requête /v1/missions/018f…b001"
            actions={<Bouton variante="secondaire">Réessayer</Bouton>}
          />
        ),
      },
      {
        etat: 'variantes',
        intitule: 'Sans détail technique',
        propos:
          'Quand il n’y a rien d’utile à replier, on ne fabrique pas un code pour ' +
          'faire sérieux. Le type rend `details` facultatif ; la cause et l’action, non.',
        Apercu: () => (
          <EtatErreur
            titre="Export impossible"
            cause="L’espace disque de cet appareil est insuffisant."
            action="Libérez de la place, puis relancez l’export de secours."
          />
        ),
      },
    ],
  },
  EtatHorsLigne: {
    famille: 'etats',
    role: 'L’état PLEIN, rendu à la place du contenu quand l’écran n’a rien à montrer sans réseau.',
    origine: {
      source: 'hors-33.5',
      justification:
        '§33.5 ne nomme que `ÉtatVide` ; §33.2 exige les QUATRE états de tout écran. ' +
        'Sans primitive partagée, chaque écran réécrit sa formulation du hors-ligne, ' +
        'et trois listes de capacités avaient déjà divergé en terrain.',
      renvoi: '03 §33.2 (les quatre états) · invariant 1 (hors ligne est nominal)',
    },
    demonstrations: [
      {
        etat: 'hors-ligne',
        intitule: 'Avec le compte des éléments en attente',
        propos:
          'Le nombre rassure au lieu d’inquiéter : rien n’est perdu, tout attend. ' +
          'Hors ligne est le mode NOMINAL de cette application (invariant 1).',
        Apercu: () => <EtatHorsLigne capacites={CAPACITES} enAttente={14} />,
      },
      {
        etat: 'variantes',
        intitule: 'Rien en attente',
        propos:
          'Le compteur disparaît plutôt que d’afficher zéro — un zéro se lit comme une panne.',
        Apercu: () => (
          <EtatHorsLigne
            titre="Le rattachement au siège attend le réseau"
            capacites={CAPACITES}
            actions={<Bouton variante="secondaire">Réessayer le rattachement</Bouton>}
          />
        ),
      },
    ],
  },
  RappelHorsLigne: {
    famille: 'etats',
    role: 'La SECONDE moitié de §33.2 : le rappel des capacités locales, sur un écran qui reste utilisable.',
    origine: {
      source: 'hors-33.5',
      justification:
        '§33.2 demande « pastille discrète + rappel des capacités locales ». Trois ' +
        'écrans terrain écrivaient ce rappel de trois façons, et l’une d’elles avait ' +
        'déjà divergé. Une seule primitive, une seule promesse.',
      renvoi: '03 §33.2 · `apps/field/src/app/capacites-hors-ligne.ts`',
    },
    demonstrations: [
      {
        etat: 'hors-ligne',
        intitule: 'Réseau coupé — il parle',
        propos:
          'Le type exige une liste NON VIDE : un écran qui dit « hors ligne » sans ' +
          'énumérer ce qui marche laisse l’auditeur attendre un réseau qui ne vient pas.',
        Apercu: () => <RappelHorsLigne enLigne={false} capacites={CAPACITES} enAttente={3} />,
      },
      {
        etat: 'nominal',
        intitule: 'Réseau présent — il se tait',
        propos:
          'La condition est DANS le composant, pas dans un `{!enLigne && …}` que la ' +
          'moitié des écrans oublie d’écrire. Ci-dessous, il n’a rien rendu.',
        Apercu: () => (
          <>
            <RappelHorsLigne enLigne capacites={CAPACITES} />
            <p className="axn-design__motif">
              Aucun élément au-dessus de cette phrase : c’est exactement le rendu attendu.
            </p>
          </>
        ),
      },
      {
        etat: 'variantes',
        intitule: 'Sans sa pastille',
        propos:
          '`avecPastille={false}` déclare « ma pastille est ailleurs » — l’en-tête de la ' +
          'coquille en pose une, alimentée par le port de sync. Deux pastilles, deux ' +
          'sources, deux mots possibles : le défaut relevé en recette le 6 septembre.',
        Apercu: () => (
          <RappelHorsLigne enLigne={false} capacites={CAPACITES} avecPastille={false} />
        ),
      },
    ],
  },
  ZoneEtat: {
    famille: 'etats',
    role: 'Les CINQ natures en une union discriminée : un écran ne peut pas l’utiliser sans avoir décidé ses états.',
    origine: {
      source: 'hors-33.5',
      justification:
        '§33.2 est une règle de revue (« un écran sans ses 4 états ne passe pas ») ; ce ' +
        'composant en fait une règle de compilation. C’est la seule façon connue de ne ' +
        'pas la redécouvrir à la porte P-C.',
      renvoi: '03 §33.2 · CLAUDE.md §5 (DoD transverse)',
    },
    demonstrations: [
      {
        etat: 'nominal',
        intitule: 'Nature « nominal »',
        propos: 'Les enfants sont rendus tels quels : la zone disparaît complètement.',
        Apercu: () => (
          <ZoneEtat etat={{ nature: 'nominal' }}>
            <ContenuNominal />
          </ZoneEtat>
        ),
      },
      {
        etat: 'chargement',
        intitule: 'Nature « chargement »',
        propos: 'Trois lignes, parce que trois lignes sont attendues. La forme suit le contenu.',
        Apercu: () => (
          <ZoneEtat
            etat={{ nature: 'chargement', libelle: 'Chargement des entretiens', lignes: 3 }}
          >
            <ContenuNominal />
          </ZoneEtat>
        ),
      },
      {
        etat: 'vide',
        intitule: 'Nature « vide »',
        propos: 'Le type EXIGE un titre et une description : impossible d’afficher un vide muet.',
        Apercu: () => (
          <ZoneEtat
            etat={{
              nature: 'vide',
              titre: 'Aucun entretien sur cette unité',
              description: 'Planifiez une session, ou rattachez un entretien existant à l’unité.',
            }}
          >
            <ContenuNominal />
          </ZoneEtat>
        ),
      },
      {
        etat: 'erreur',
        intitule: 'Nature « erreur »',
        propos: 'Le type EXIGE la cause ET l’action. Un écran ne peut pas ne dire que la cause.',
        Apercu: () => (
          <ZoneEtat
            etat={{
              nature: 'erreur',
              cause: 'La liste des entretiens n’a pas pu être lue sur cet appareil.',
              action: 'Fermez puis rouvrez l’application ; les données locales sont intactes.',
              details: 'DEXIE_READ_FAILED — table `interviews`',
            }}
          >
            <ContenuNominal />
          </ZoneEtat>
        ),
      },
      {
        etat: 'hors-ligne',
        intitule: 'Nature « hors ligne »',
        propos:
          'Le type EXIGE la liste des capacités : la seconde moitié de §33.2 n’est pas optionnelle.',
        Apercu: () => (
          <ZoneEtat etat={{ nature: 'hors-ligne', capacites: CAPACITES, enAttente: 7 }}>
            <ContenuNominal />
          </ZoneEtat>
        ),
      },
    ],
  },
} as const satisfies Record<string, FicheComposant>;
