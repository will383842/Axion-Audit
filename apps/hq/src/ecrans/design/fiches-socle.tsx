// =============================================================================
// GALERIE — LE SOCLE (contrôles repris de shadcn/ui, traduits). Page `/design`.
//
// Chaque fiche livre au moins deux états, et l'un d'eux est TOUJOURS celui qu'on
// oublie : le désactivé qui ne dit pas pourquoi, le champ en erreur, la liste
// sans option vide. Le type `ListeDeDeux` refuse une fiche qui n'en aurait qu'un.
//
// AUCUNE VALEUR VISUELLE ICI. Les aperçus ne posent ni couleur, ni taille : la
// mise en page vient de `design.css`, qui ne consomme que des jetons.
//
// Traçabilité : E27 (design moderne, charte, WCAG AA), E44 (UX/UI 2026-2027 —
// tokens, police locale).
// =============================================================================
import { useState, type ReactNode } from 'react';
import {
  Badge,
  Bascule,
  Bouton,
  CaseACocher,
  ChampTexte,
  Dialogue,
  IconeAlerte,
  IconeCoche,
  IconeCroix,
  Message,
  Panneau,
  Selection,
  ZoneNotes,
} from '@axion/ui';
import type { FicheComposant } from './types.js';

/** Un rang de vignette : plusieurs rendus côte à côte, sans style en dur. */
function Rang({ children }: { children: ReactNode }): ReactNode {
  return <div className="axn-design__rang">{children}</div>;
}

/** Le motif d'un état désactivé — §17.6 : on ne grise jamais sans dire pourquoi. */
function Motif({ children }: { children: ReactNode }): ReactNode {
  return <p className="axn-design__motif">{children}</p>;
}

const UNITES = [
  { valeur: 'logistique', libelle: 'Logistique' },
  { valeur: 'production', libelle: 'Production' },
  { valeur: 'administratif', libelle: 'Administratif' },
] as const;

function BasculeVivante(): ReactNode {
  const [actif, setActif] = useState(false);
  return (
    <Bascule libelle="Afficher les questions déjà répondues" actif={actif} onBasculer={setActif} />
  );
}

function DialogueVivant(): ReactNode {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <Bouton
        variante="secondaire"
        onClick={() => {
          setOuvert(true);
        }}
      >
        Ouvrir la fenêtre
      </Bouton>
      <Dialogue
        ouvert={ouvert}
        titre="Terminer l’entretien ?"
        description="L’entretien restera modifiable jusqu’à sa validation."
        onFermer={() => {
          setOuvert(false);
        }}
        fermetureExterieure
        actions={
          <>
            <Bouton
              variante="discret"
              onClick={() => {
                setOuvert(false);
              }}
            >
              Revenir aux questions
            </Bouton>
            <Bouton
              onClick={() => {
                setOuvert(false);
              }}
            >
              Terminer
            </Bouton>
          </>
        }
      >
        <p>Trois questions restent sans réponse et deux sont marquées à revoir.</p>
      </Dialogue>
    </>
  );
}

function DialogueDestructif(): ReactNode {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <Bouton
        variante="danger"
        onClick={() => {
          setOuvert(true);
        }}
      >
        Ouvrir la confirmation
      </Bouton>
      <Dialogue
        ouvert={ouvert}
        titre="Réinitialiser cet appareil ?"
        description="Les données locales non synchronisées seront définitivement perdues."
        onFermer={() => {
          setOuvert(false);
        }}
        actions={
          <>
            <Bouton
              variante="secondaire"
              onClick={() => {
                setOuvert(false);
              }}
            >
              Annuler
            </Bouton>
            <Bouton
              variante="danger"
              onClick={() => {
                setOuvert(false);
              }}
            >
              Réinitialiser
            </Bouton>
          </>
        }
      >
        <p>
          Un clic à côté ne ferme PAS cette fenêtre : la décision se prend, elle ne s’escamote pas.
        </p>
      </Dialogue>
    </>
  );
}

function PanneauVivant({ position }: { position: 'bas' | 'cote' }): ReactNode {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <Bouton
        variante="secondaire"
        onClick={() => {
          setOuvert(true);
        }}
      >
        {position === 'bas' ? 'Ouvrir par le bas' : 'Ouvrir par le côté'}
      </Bouton>
      <Panneau
        ouvert={ouvert}
        titre={position === 'bas' ? 'Notes volantes' : 'Détail de l’unité'}
        position={position}
        onFermer={() => {
          setOuvert(false);
        }}
        fermetureExterieure
      >
        <p>Le panneau piège le focus et rend la touche Échap : les deux viennent du paquet.</p>
      </Panneau>
    </>
  );
}

export const FICHES_SOCLE = {
  Bouton: {
    famille: 'socle',
    role: 'L’action. Une seule « principale » par écran (§19.2), cible ≥ 44 px (A27).',
    origine: { source: '33.5' },
    demonstrations: [
      {
        etat: 'variantes',
        intitule: 'Les quatre variantes, et la taille terrain',
        propos:
          'Le terracotta est réservé à l’action ; le rouge d’alerte au danger. Deux ' +
          'rouges distincts, jamais interchangeables (invariant 4).',
        Apercu: () => (
          <>
            <Rang>
              <Bouton>Enregistrer</Bouton>
              <Bouton variante="secondaire">Reprendre</Bouton>
              <Bouton variante="discret">Ignorer</Bouton>
              <Bouton variante="danger">Supprimer la note</Bouton>
            </Rang>
            <Rang>
              <Bouton taille="large" icone={<IconeCoche />}>
                Terminer la session
              </Bouton>
              <Bouton
                iconeSeule
                libelleAccessible="Fermer le panneau"
                variante="discret"
                icone={<IconeCroix />}
              />
            </Rang>
          </>
        ),
      },
      {
        etat: 'chargement',
        intitule: 'Action en cours',
        propos:
          'Rotor EN LIGNE, `aria-busy`, bouton neutralisé — jamais un voile plein ' +
          'écran, que §33.2 interdit.',
        Apercu: () => (
          <Rang>
            <Bouton chargement>Synchroniser</Bouton>
            <Bouton variante="secondaire" chargement>
              Exporter la sauvegarde
            </Bouton>
          </Rang>
        ),
      },
      {
        etat: 'desactive',
        intitule: 'Désactivé, avec son motif',
        propos:
          'Un bouton grisé sans explication envoie l’auditeur chercher la cause. ' +
          'Le motif est du texte à côté, lisible par tous, pas une infobulle.',
        Apercu: () => (
          <>
            <Rang>
              <Bouton disabled>Valider l’entretien</Bouton>
            </Rang>
            <Motif>Deux questions sont encore marquées « à revoir ».</Motif>
          </>
        ),
      },
    ],
  },
  ChampTexte: {
    famille: 'socle',
    role: 'Saisie d’une ligne. Libellé toujours VISIBLE — jamais un texte d’exemple à sa place.',
    origine: { source: '33.5' },
    demonstrations: [
      {
        etat: 'nominal',
        intitule: 'Avec son aide permanente',
        propos:
          'L’aide reste sous le champ, elle ne disparaît pas au survol : c’est ce qui ' +
          'remplace l’infobulle, absente du paquet et inutilisable au doigt.',
        Apercu: () => (
          <ChampTexte
            libelle="Fonction de la personne rencontrée"
            aide="Telle qu’elle figure à l’organigramme, sans abréviation."
            defaultValue="Responsable logistique"
          />
        ),
      },
      {
        etat: 'variantes',
        intitule: 'Natures de saisie',
        propos:
          'La nature choisit le clavier virtuel de la tablette (§33.3) : un numérique ' +
          'sur un nombre évite trois fautes de frappe par entretien.',
        Apercu: () => (
          <Rang>
            <ChampTexte libelle="Effectif de l’unité" nature="nombre" defaultValue="48" />
            <ChampTexte libelle="Adresse électronique" nature="courriel" />
            <ChampTexte libelle="Rechercher une question" nature="recherche" />
          </Rang>
        ),
      },
      {
        etat: 'erreur',
        intitule: 'En erreur',
        propos:
          'Le message dit la CAUSE en français ; le champ est marqué invalide pour ' +
          'les lecteurs d’écran, pas seulement encadré de rouge (§33.6).',
        Apercu: () => (
          <ChampTexte
            libelle="Effectif de l’unité"
            nature="nombre"
            obligatoire
            defaultValue="-4"
            erreur="Un effectif ne peut pas être négatif."
          />
        ),
      },
      {
        etat: 'desactive',
        intitule: 'Désactivé, avec son motif',
        propos:
          'Le champ figé d’un entretien validé : la correction passe par une révision (invariant 7).',
        Apercu: () => (
          <>
            <ChampTexte libelle="Unité rattachée" defaultValue="Logistique" disabled />
            <Motif>L’entretien est validé : toute correction se fait par révision tracée.</Motif>
          </>
        ),
      },
    ],
  },
  ZoneNotes: {
    famille: 'socle',
    role: 'Saisie longue : notes d’entretien, notes volantes, motif d’une dérogation.',
    origine: {
      source: 'hors-33.5',
      justification:
        'La liste de §33.5 nomme `Input` et s’arrête là ; §17.4 et §25.4 exigent des ' +
        'notes libres et des notes volantes, qui ne tiennent pas sur une ligne.',
      renvoi: '03 §17.4 (enregistrement continu) · §25.4 (notes volantes)',
    },
    demonstrations: [
      {
        etat: 'nominal',
        intitule: 'Note d’entretien',
        propos:
          'Marquée `data-saisie-libre` : le gestionnaire de raccourcis de L5 s’y tait, ' +
          'pour que taper « Rien à signaler » ne coche rien (§33.3, règle V2.8).',
        Apercu: () => (
          <ZoneNotes
            libelle="Note d’entretien"
            aide="Visible du siège. Rien de nominatif au-delà du strict nécessaire."
            rows={3}
            defaultValue="Le suivi des expéditions se fait sur un tableur partagé, sans historique."
          />
        ),
      },
      {
        etat: 'erreur',
        intitule: 'En erreur',
        propos: 'La cause est écrite ; le champ garde sa saisie — on ne fait jamais retaper.',
        Apercu: () => (
          <ZoneNotes
            libelle="Motif de la dérogation"
            obligatoire
            rows={2}
            erreur="Le motif est obligatoire en profil expert : il est journalisé."
          />
        ),
      },
      {
        etat: 'desactive',
        intitule: 'Désactivé, avec son motif',
        propos: 'Même règle que le champ d’une ligne : gris + phrase, jamais gris seul.',
        Apercu: () => (
          <>
            <ZoneNotes libelle="Note d’entretien" rows={2} defaultValue="—" disabled />
            <Motif>La session est verrouillée : rouvrez-la pour la compléter.</Motif>
          </>
        ),
      },
    ],
  },
  Selection: {
    famille: 'socle',
    role: 'Choix dans une liste fermée. L’option vide évite les réponses que personne n’a données.',
    origine: { source: '33.5' },
    demonstrations: [
      {
        etat: 'nominal',
        intitule: 'Avec son option vide',
        propos:
          'Sans `optionVide`, le premier élément serait « déjà répondu » sans qu’aucun ' +
          'choix ait été fait — une réponse fabriquée par la mise en page.',
        Apercu: () => (
          <Selection
            libelle="Unité rattachée"
            optionVide="Choisir une unité…"
            options={UNITES.map((u) => ({ valeur: u.valeur, libelle: u.libelle }))}
          />
        ),
      },
      {
        etat: 'erreur',
        intitule: 'En erreur',
        propos:
          'Le message remplace l’aide : deux textes concurrents sous un champ ne se lisent pas.',
        Apercu: () => (
          <Selection
            libelle="Unité rattachée"
            obligatoire
            optionVide="Choisir une unité…"
            options={UNITES.map((u) => ({ valeur: u.valeur, libelle: u.libelle }))}
            erreur="Sans unité, la réponse ne compte dans aucune couverture."
          />
        ),
      },
      {
        etat: 'desactive',
        intitule: 'Désactivé, avec son motif',
        propos: 'Le questionnaire est figé (M2) : l’unité ne change plus après le snapshot.',
        Apercu: () => (
          <>
            <Selection
              libelle="Unité rattachée"
              defaultValue="logistique"
              options={UNITES.map((u) => ({ valeur: u.valeur, libelle: u.libelle }))}
              disabled
            />
            <Motif>Le questionnaire de la mission est figé : l’unité se change au siège.</Motif>
          </>
        ),
      },
    ],
  },
  CaseACocher: {
    famille: 'socle',
    role: 'Accord binaire : participation, contrôle bloquant coché, sélection multiple.',
    origine: { source: '33.5' },
    demonstrations: [
      {
        etat: 'nominal',
        intitule: 'Cochée, décochée',
        propos: 'Le libellé est cliquable : la cible utile dépasse largement le carré (A27).',
        Apercu: () => (
          <>
            <CaseACocher
              libelle="La personne accepte que l’entretien soit enregistré par écrit"
              defaultChecked
            />
            <CaseACocher libelle="Prévoir une observation de poste sur cette unité" />
          </>
        ),
      },
      {
        etat: 'variantes',
        intitule: 'Indéterminée',
        propos:
          'Une sélection partielle n’est ni « tout », ni « rien ». La rendre décochée ' +
          'ferait perdre les lignes déjà choisies au premier clic.',
        Apercu: () => <CaseACocher libelle="Tout sélectionner" indetermine />,
      },
      {
        etat: 'desactive',
        intitule: 'Désactivée, avec son motif',
        propos: 'Le contrôle bloquant d’une étape verrouillée : visible, expliqué, non modifiable.',
        Apercu: () => (
          <>
            <CaseACocher libelle="Accord de participation recueilli" defaultChecked disabled />
            <Motif>Recueilli au démarrage de la session : il ne se retire pas après coup.</Motif>
          </>
        ),
      },
    ],
  },
  Bascule: {
    famille: 'socle',
    role: 'Réglage immédiat, sans validation. Son état est un MOT, pas seulement une couleur.',
    origine: { source: '33.5' },
    demonstrations: [
      {
        etat: 'nominal',
        intitule: 'Vivante — cliquez',
        propos:
          '« activé » / « désactivé » sont lus ET affichés : §33.6 interdit qu’une ' +
          'information soit portée par la couleur seule.',
        Apercu: BasculeVivante,
      },
      {
        etat: 'variantes',
        intitule: 'Mots d’état sur mesure',
        propos: 'Certains réglages se disent mieux autrement que par « activé ».',
        Apercu: () => (
          <Bascule
            libelle="Profil de saisie"
            actif
            libelleActif="expert"
            libelleInactif="guidé strict"
            onBasculer={() => undefined}
          />
        ),
      },
      {
        etat: 'desactive',
        intitule: 'Désactivée, avec son motif',
        propos:
          'Un réglage réservé à l’administrateur reste VISIBLE : la carte de l’outil est entière.',
        Apercu: () => (
          <>
            <Bascule
              libelle="Autoriser les questions hors parcours"
              actif={false}
              onBasculer={() => undefined}
              disabled
            />
            <Motif>Réglage de mission : il se change depuis la console, espace 6.</Motif>
          </>
        ),
      },
    ],
  },
  Badge: {
    famille: 'socle',
    role: 'Étiquette de statut. Le même vocabulaire visuel du terrain à la console (§19.2).',
    origine: { source: '33.5' },
    demonstrations: [
      {
        etat: 'variantes',
        intitule: 'Les six tons',
        propos:
          'L’alerte (carmin) et l’action (terracotta) sont côte à côte exprès : c’est ' +
          'ici qu’on vérifie qu’on ne les confond pas.',
        Apercu: () => (
          <Rang>
            <Badge>Planifié</Badge>
            <Badge ton="action">En cours</Badge>
            <Badge ton="info">Complémentaire</Badge>
            <Badge ton="succes">Validé</Badge>
            <Badge ton="avertissement">À revoir</Badge>
            <Badge ton="alerte">En retard</Badge>
          </Rang>
        ),
      },
      {
        etat: 'nominal',
        intitule: 'Avec son icône',
        propos: 'L’icône DOUBLE le mot ; le type refuse un badge sans texte.',
        Apercu: () => (
          <Rang>
            <Badge ton="succes" icone={<IconeCoche />}>
              Entretien validé
            </Badge>
            <Badge ton="alerte" icone={<IconeAlerte />}>
              Sauvegarde de plus de 24 h
            </Badge>
          </Rang>
        ),
      },
    ],
  },
  Message: {
    famille: 'socle',
    role: 'Bandeau qui RESTE à l’écran : information, confirmation, avertissement, alerte.',
    origine: {
      source: 'hors-33.5',
      justification:
        '§33.5 nomme `Toast`, une notification FUGITIVE, écartée : ce qui disparaît ' +
        'tout seul n’est pas lu par un auditeur qui écoute son interlocuteur. Ce ' +
        'composant en prend la place et ne s’efface pas.',
      renvoi: '03 §33.5 (`Toast`, déclaré absent) · §17.6 (cause et action)',
    },
    demonstrations: [
      {
        etat: 'variantes',
        intitule: 'Les quatre tons',
        propos:
          'Il remplace le `Toast` de §33.5, écarté : une notification fugitive ne se lit ' +
          'pas quand on écoute quelqu’un.',
        Apercu: () => (
          <>
            <Message ton="info" titre="Mode écran partagé">
              Tout ce qui est interne reste masqué tant que le bandeau est affiché.
            </Message>
            <Message ton="succes">Sauvegarde de secours exportée.</Message>
            <Message ton="avertissement" titre="Créneau déjà occupé">
              Un autre entretien est planifié sur cette plage. L’avertissement n’empêche rien.
            </Message>
          </>
        ),
      },
      {
        etat: 'erreur',
        intitule: 'Alerte avec son action',
        propos: '§17.6 : une erreur dit la cause ET l’action. Le bouton est dans le message.',
        Apercu: () => (
          <Message
            ton="alerte"
            titre="Aucune synchronisation depuis 31 h"
            actions={<Bouton variante="danger">Synchroniser maintenant</Bouton>}
          >
            L’invariant de sauvegarde impose une remontée par jour ouvré.
          </Message>
        ),
      },
    ],
  },
  Dialogue: {
    famille: 'socle',
    role: 'Décision brève, au-dessus de l’écran qu’on ne quitte pas. Piège à focus et touche Échap.',
    origine: { source: '33.5' },
    demonstrations: [
      {
        etat: 'nominal',
        intitule: 'Confirmation ordinaire',
        propos: 'Un clic sur le voile ferme : c’est le geste attendu quand rien ne se perd.',
        Apercu: DialogueVivant,
      },
      {
        etat: 'variantes',
        intitule: 'Confirmation destructive',
        propos:
          '`fermetureExterieure` reste faux : en entretien, un clic à côté ne doit pas ' +
          'escamoter une décision qu’on est en train de prendre.',
        Apercu: DialogueDestructif,
      },
    ],
  },
  Panneau: {
    famille: 'socle',
    role: 'Surface latérale ou basse, pour consulter sans perdre l’écran d’origine.',
    origine: { source: '33.5' },
    demonstrations: [
      {
        etat: 'nominal',
        intitule: 'Par le bas — le geste tablette',
        propos: 'Sur tablette, le bas est à portée du pouce ; le côté ne l’est pas.',
        Apercu: () => <PanneauVivant position="bas" />,
      },
      {
        etat: 'variantes',
        intitule: 'Par le côté — le geste console',
        propos: 'Sur un écran ≥ 1280 px (§33.4), la colonne latérale garde le contexte visible.',
        Apercu: () => <PanneauVivant position="cote" />,
      },
    ],
  },
} as const satisfies Record<string, FicheComposant>;
