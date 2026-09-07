// =============================================================================
// GALERIE — LES COMPOSANTS MÉTIER DE §33.5. Page `/design`.
//
// Ce sont ceux que la phrase « + composants métier à construire » désigne. Huit
// des douze existent ; les quatre autres (`TimelinePilote`, `Radar`, `Heatmap`,
// `CourbePrévuRéel`) sont DÉCLARÉS ABSENTS avec leur motif dans
// `packages/ui/src/inventaire.ts`, et la page les affiche à ce titre.
//
// Les aperçus sont VIVANTS quand le composant est un contrôle : une échelle de
// cotation figée ne montre pas ce qu'elle a de particulier — l'ancre §32.4 qui
// s'affiche sous le curseur, et qui est la raison d'être du composant.
//
// Traçabilité : E27 (design moderne, charte, WCAG AA), E44 (UX/UI 2026-2027 —
// tokens, police locale).
// =============================================================================
import { useState, type ReactNode } from 'react';
import {
  AnneauProgression,
  BandeauPartage,
  Bouton,
  CarteSyntheseEntretien,
  EchelleAncree,
  IndicateurEnregistrement,
  PastilleSync,
  SaisieFourchette,
  SegmenteONA,
  type AncreCotation,
  type ReponseONA,
} from '@axion/ui';
import type { FicheComposant } from './types.js';

function Rang({ children }: { children: ReactNode }): ReactNode {
  return <div className="axn-design__rang">{children}</div>;
}

function Motif({ children }: { children: ReactNode }): ReactNode {
  return <p className="axn-design__motif">{children}</p>;
}

/**
 * Des ancres §32.4 RÉELLES de forme (« 1 = … · 3 = … · 5 = … »), sur une question
 * générique. Invariant 2 : aucune référence client, aucune donnée de mission ici.
 */
const ANCRES: readonly AncreCotation[] = [
  { note: 1, texte: 'Aucun processus documenté ; chacun fait à sa manière.' },
  { note: 3, texte: 'Processus documenté, mais non appliqué de façon homogène.' },
  { note: 5, texte: 'Documenté, appliqué et mesuré ; les écarts sont traités.' },
];

const QUESTION = 'Le suivi des expéditions est-il formalisé et appliqué ?';

function EchelleVivante(): ReactNode {
  const [valeur, setValeur] = useState<number | null>(3);
  return (
    <EchelleAncree
      libelle={QUESTION}
      valeur={valeur}
      onChangement={setValeur}
      ancres={ANCRES}
      afficherRaccourcis
      nom="design-echelle-vivante"
    />
  );
}

function SegmenteVivant(): ReactNode {
  const [valeur, setValeur] = useState<ReponseONA | null>('oui');
  return (
    <SegmenteONA
      libelle="Un inventaire tournant est-il réalisé ?"
      valeur={valeur}
      onChangement={setValeur}
      afficherRaccourcis
      nom="design-ona-vivant"
    />
  );
}

function FourchetteVivante(): ReactNode {
  const [bornes, setBornes] = useState({ bas: '120', haut: '180' });
  return (
    <SaisieFourchette
      libelle="Temps passé par semaine sur la ressaisie"
      bas={bornes.bas}
      haut={bornes.haut}
      onChangement={setBornes}
      unite="min"
      aide="Une fourchette vaut mieux qu’un chiffre faux : bas et haut, tels qu’ils sont dits."
    />
  );
}

function PartageVivant(): ReactNode {
  const [actif, setActif] = useState(false);
  return (
    <>
      <BandeauPartage actif={actif} onBasculer={setActif} afficherRaccourci />
      <Motif>
        Le bandeau annonce l’état et offre le geste ; il ne masque rien lui-même — le masquage se
        fait à la source, sans quoi le contenu interne resterait dans le DOM et dans une capture
        d’écran.
      </Motif>
    </>
  );
}

export const FICHES_METIER = {
  EchelleAncree: {
    famille: 'metier',
    role: 'Cotation 1-5 avec les ancres §32.4 AFFICHÉES : l’homogénéité ne dépend plus de la mémoire.',
    origine: { source: '33.5' },
    demonstrations: [
      {
        etat: 'nominal',
        intitule: 'Vivante — changez de note',
        propos:
          'L’ancre change sous le curseur. C’est la fonction du composant, et c’est ' +
          'ce que §33.3 appelle « ancres de cotation VISIBLES ».',
        Apercu: EchelleVivante,
      },
      {
        etat: 'vide',
        intitule: 'Pas encore cotée',
        propos:
          'Une valeur ABSENTE n’est pas « zéro » : l’absence de réponse est une ' +
          'information, et la doctrine 1 de §32.4 interdit de la confondre avec un 1.',
        Apercu: () => (
          <EchelleAncree
            libelle={QUESTION}
            valeur={null}
            onChangement={() => undefined}
            ancres={ANCRES}
            nom="design-echelle-vide"
          />
        ),
      },
      {
        etat: 'desactive',
        intitule: 'Désactivée, avec son motif',
        propos:
          'La cotation d’un entretien validé reste LISIBLE : on ne cache pas ce qu’on a coté.',
        Apercu: () => (
          <>
            <EchelleAncree
              libelle={QUESTION}
              valeur={4}
              onChangement={() => undefined}
              ancres={ANCRES}
              desactive
              nom="design-echelle-desactivee"
            />
            <Motif>
              L’entretien est validé : la note se corrige par révision tracée (invariant 7).
            </Motif>
          </>
        ),
      },
    ],
  },
  SegmenteONA: {
    famille: 'metier',
    role: 'Oui / Non / N-A en gros boutons tactiles (§33.3), frappés des centaines de fois par entretien.',
    origine: { source: '33.5' },
    demonstrations: [
      {
        etat: 'nominal',
        intitule: 'Vivant — répondez',
        propos:
          'Les rappels de raccourcis (O, N, A) ne s’affichent que sur poste PC ; ils ne ' +
          'sont actifs que hors d’un champ de saisie (règle V2.8).',
        Apercu: SegmenteVivant,
      },
      {
        etat: 'vide',
        intitule: 'Pas encore répondu',
        propos:
          '« Pas encore répondu » se distingue de « Non ». Les confondre fabriquerait ' +
          'des réponses négatives que personne n’a données.',
        Apercu: () => (
          <SegmenteONA
            libelle="Un inventaire tournant est-il réalisé ?"
            valeur={null}
            onChangement={() => undefined}
            nom="design-ona-vide"
          />
        ),
      },
      {
        etat: 'desactive',
        intitule: 'Désactivé, avec son motif',
        propos: 'Réponse figée après validation, comme l’échelle.',
        Apercu: () => (
          <>
            <SegmenteONA
              libelle="Un inventaire tournant est-il réalisé ?"
              valeur="na"
              onChangement={() => undefined}
              desactive
              nom="design-ona-desactive"
            />
            <Motif>
              Sans objet déclaré : la question ne compte dans aucun score (§32.4, doctrine 4).
            </Motif>
          </>
        ),
      },
    ],
  },
  SaisieFourchette: {
    famille: 'metier',
    role: 'Bas et haut (§27.4). Une fourchette assumée vaut mieux qu’un chiffre unique inventé.',
    origine: { source: '33.5' },
    demonstrations: [
      {
        etat: 'nominal',
        intitule: 'Vivante — saisissez',
        propos: 'L’unité est affichée à droite des deux champs, jamais devinée du libellé.',
        Apercu: FourchetteVivante,
      },
      {
        etat: 'erreur',
        intitule: 'Fourchette incohérente',
        propos:
          'Le bas dépasse le haut : le contrôle est LOCAL, immédiat, et n’attend pas la ' +
          'synchronisation pour le dire.',
        Apercu: () => (
          <SaisieFourchette
            libelle="Gain annuel estimé"
            bas="300"
            haut="200"
            onChangement={() => undefined}
            unite="k€"
          />
        ),
      },
      {
        etat: 'desactive',
        intitule: 'Désactivée, avec son motif',
        propos: 'Une estimation figée reste lisible ; ses hypothèses vivent ailleurs (§32.4).',
        Apercu: () => (
          <>
            <SaisieFourchette
              libelle="Temps passé par semaine sur la ressaisie"
              bas="120"
              haut="180"
              onChangement={() => undefined}
              unite="min"
              desactive
            />
            <Motif>La session est terminée : rouvrez-la pour ajuster l’estimation.</Motif>
          </>
        ),
      },
    ],
  },
  PastilleSync: {
    famille: 'metier',
    role: 'L’état réseau, discret et permanent — jamais une bannière anxiogène (§19.2).',
    origine: { source: '33.5' },
    demonstrations: [
      {
        etat: 'variantes',
        intitule: 'Les cinq états',
        propos:
          'Chacun porte un MOT et une icône. Une pastille verte ou rouge sans texte ' +
          'serait de l’information portée par la couleur seule (§33.6).',
        Apercu: () => (
          <Rang>
            <PastilleSync etat="synchronise" derniereSync="aujourd’hui à 08h12" />
            <PastilleSync etat="en-cours" />
            <PastilleSync etat="en-attente" enAttente={23} />
            <PastilleSync etat="echec" enAttente={23} />
          </Rang>
        ),
      },
      {
        etat: 'hors-ligne',
        intitule: 'Hors ligne, avec ce qui attend',
        propos:
          'Le compte d’éléments en attente est la moitié rassurante du message : rien ' +
          'n’est perdu, tout est local et chiffré.',
        Apercu: () => <PastilleSync etat="hors-ligne" enAttente={41} />,
      },
    ],
  },
  IndicateurEnregistrement: {
    famille: 'metier',
    role: 'Le micro-retour « Enregistré » de §33.3 : l’enregistrement continu devient VISIBLE.',
    origine: {
      source: 'hors-33.5',
      justification:
        '§33.3 le demande nommément (« micro-indicateur Enregistré … la confiance se ' +
        'voit ») ; §33.5, écrit avant, ne le réénumère pas. Sans lui, chaque écran ' +
        'invente sa façon de dire qu’il a écrit — ou ne le dit pas.',
      renvoi: '03 §33.3 · §17.4 (enregistrement continu)',
    },
    demonstrations: [
      {
        etat: 'variantes',
        intitule: 'Les trois temps',
        propos:
          'Furtif par construction : il informe sans jamais attirer l’œil hors de la question.',
        Apercu: () => (
          <Rang>
            <IndicateurEnregistrement etat="inactif" />
            <IndicateurEnregistrement etat="enregistrement" />
            <IndicateurEnregistrement etat="enregistre" />
          </Rang>
        ),
      },
      {
        etat: 'nominal',
        intitule: 'Avec l’heure de la dernière écriture',
        propos:
          'L’horodatage arrive DÉJÀ formaté au fuseau de la mission (§22.2) : le ' +
          'composant ne formate aucune date, il n’en connaît aucune.',
        Apercu: () => <IndicateurEnregistrement etat="enregistre" horodatage="09h47" />,
      },
    ],
  },
  BandeauPartage: {
    famille: 'metier',
    role: 'Mode écran partagé (§33.3) : l’écran se montre à l’interviewé sans rien laisser fuir.',
    origine: { source: '33.5' },
    demonstrations: [
      {
        etat: 'nominal',
        intitule: 'Vivant — basculez',
        propos:
          'L’état est visible EN PERMANENCE quand il est actif : un mode qui se ' +
          'devine est un mode qu’on oublie d’éteindre.',
        Apercu: PartageVivant,
      },
      {
        etat: 'variantes',
        intitule: 'Actif, bandeau déployé',
        propos:
          'Le rappel « touche E » n’apparaît que sur poste PC ; la tablette n’a pas de touche E.',
        Apercu: () => <BandeauPartage actif onBasculer={() => undefined} afficherRaccourci />,
      },
    ],
  },
  AnneauProgression: {
    famille: 'metier',
    role: 'Progression d’une mission, d’une unité, d’un entretien — le même objet visuel partout.',
    origine: { source: '33.5' },
    demonstrations: [
      {
        etat: 'nominal',
        intitule: 'En vedette, avec un libellé lu',
        propos:
          '« 12 questions sur 40 » en dit plus que « 30 % » à un lecteur d’écran : le ' +
          'pourcentage seul ne suffit pas toujours.',
        Apercu: () => (
          <AnneauProgression
            valeur={30}
            libelle="Entretien en cours"
            taille="grand"
            libelleAccessible="Entretien en cours : 12 questions répondues sur 40"
          />
        ),
      },
      {
        etat: 'variantes',
        intitule: 'Les bornes, en ligne',
        propos:
          'La valeur est BORNÉE : 104 % dessine un anneau plein plutôt qu’une figure ' +
          'impossible. Zéro reste un anneau, pas un vide.',
        Apercu: () => (
          <Rang>
            <AnneauProgression valeur={0} libelle="Production" />
            <AnneauProgression valeur={68} libelle="Logistique" />
            <AnneauProgression valeur={100} libelle="Administratif" />
          </Rang>
        ),
      },
    ],
  },
  CarteSyntheseEntretien: {
    famille: 'metier',
    role: 'La fin d’entretien en une carte (§33.3) : répondu, à revoir, N/A, notes, pièces.',
    origine: { source: '33.5' },
    demonstrations: [
      {
        etat: 'nominal',
        intitule: 'Un entretien mené',
        propos:
          'Le non-communiqué (§27.4) est compté à part : c’est un refus de répondre, ' +
          'jamais une pénalité de score.',
        Apercu: () => (
          <CarteSyntheseEntretien
            titre="Responsable logistique"
            sousTitre="Unité Logistique · entretien sur site"
            repondu={34}
            total={40}
            aRevoir={2}
            na={3}
            notes={5}
            pieces={1}
            nonCommunique={1}
            duree="47 min"
            actions={
              <>
                <Bouton variante="secondaire">Reprendre les questions</Bouton>
                <Bouton>Terminer l’entretien</Bouton>
              </>
            }
          />
        ),
      },
      {
        etat: 'vide',
        intitule: 'Un entretien qui n’a pas commencé',
        propos:
          'Zéro sur quarante, et la carte le dit sans se vider : l’auditeur voit ce qui ' +
          'l’attend, pas une surface blanche.',
        Apercu: () => (
          <CarteSyntheseEntretien
            titre="Chef d’équipe nuit"
            sousTitre="Unité Production · entretien planifié"
            repondu={0}
            total={40}
            aRevoir={0}
            na={0}
            notes={0}
            pieces={0}
            actions={<Bouton>Démarrer l’entretien</Bouton>}
          />
        ),
      },
    ],
  },
} as const satisfies Record<string, FicheComposant>;
