// =============================================================================
// LA ZONE DE SAISIE — « adaptée au type » (03 M3.1) : les ONZE types, plus la
// fourchette (03 §27.4)
//
// Un `switch` EXHAUSTIF sur `question.answerType` (ESLint
// `switch-exhaustiveness-check`) : un douzième type ajouté à la banque ferait
// rougir ce fichier avant de faire disparaître une saisie en entretien.
//
// Chaque type emploie le composant de `packages/ui` prévu pour lui (03 §33.5) :
//   scale_1_5 → `EchelleAncree` (ancres §32.4 lues dans la guidance, SOUS le curseur)
//   yes_no    → `SegmenteONA` (« Sans objet » y est le drapeau N/A, pas une valeur)
//   fourchette→ `SaisieFourchette` (bas / haut, deux champs — jamais un)
//   texte     → `ZoneNotes` ; nombres → `ChampTexte nature="nombre"` (clavier
//               décimal sur tablette, §33.3) ; choix → radios / `CaseACocher` ;
//               date → champ natif `date` composé avec les classes du design
//               system (`ChampTexte` n'a pas encore cette nature — signalé) ;
//   table     → LISTE de lignes, un petit formulaire par ligne (§33.3 V2.10).
//
// Deux cadences d'enregistrement, décidées ICI et exécutées par l'écran :
//   `'immediat'` — un tap (cote, choix, ajout de ligne) part tout de suite ;
//   `'differe'`  — une frappe (texte, nombre) est débouncée (03 M3.2).
//
// Les nombres restent en CHAÎNE tant qu'on tape ; `nombreDepuisSaisie` tranche
// (`session/valeurs.ts`). Une saisie illisible ne s'écrit pas et le champ le dit.
//
// Traçabilité : E13 (écran 3 zones, enregistrement continu), E37 (scoring
// intégralement spécifié — fourchettes §27.4), E44 (UX/UI 2026-2027 — tokens, grille §33).
// =============================================================================
import { useId, useState, type ReactNode } from 'react';
import {
  Bouton,
  CaseACocher,
  ChampTexte,
  EchelleAncree,
  IconeCoche,
  SaisieFourchette,
  SegmenteONA,
  ZoneNotes,
  type AncreCotation,
  type ReponseONA,
} from '@axion/ui';
import { lireAncresDeCotation, type TypeDeReponse } from '@axion/shared';
import type { QuestionLocale } from '../../local/depots/questions.js';
import {
  colonnesDeTableau,
  DEVISE_PAR_DEFAUT,
  nombreDepuisSaisie,
  NOTE_MAX,
  NOTE_MIN,
  optionsDeQuestion,
  saisieDepuisNombre,
  type LigneTableau,
  type ValeurTypee,
} from '../../session/valeurs.js';

export type Cadence = 'immediat' | 'differe';

export interface ProprietesSaisieReponse {
  readonly question: QuestionLocale;
  readonly valeur: ValeurTypee | null;
  /** `null` = la saisie a été vidée. */
  readonly onChangement: (valeur: ValeurTypee | null, cadence: Cadence) => void;
  /** Le drapeau N/A, pour `yes_no` où « Sans objet » est un segment (03 §33.5). */
  readonly sansObjet: boolean;
  readonly onSansObjet: () => void;
  /** Mode fourchette actif (§27.4) — piloté par l'écran, admis ou non par la question. */
  readonly fourchette: boolean;
  readonly afficherRaccourcis: boolean;
  readonly desactive: boolean;
}

const UNITES: Partial<Record<TypeDeReponse, string>> = {
  percent: '%',
};

const MESSAGE_NOMBRE_ILLISIBLE = 'Saisissez un nombre (« 1200 », « 1,5 »).';

export function SaisieReponse(proprietes: ProprietesSaisieReponse): ReactNode {
  const {
    question,
    valeur,
    onChangement,
    sansObjet,
    onSansObjet,
    fourchette,
    afficherRaccourcis,
    desactive,
  } = proprietes;
  const type = question.answerType;

  if (
    fourchette &&
    (type === 'number' || type === 'percent' || type === 'duration' || type === 'money')
  ) {
    return (
      <SaisieEnFourchette
        type={type}
        valeur={valeur?.type === 'range' ? valeur : null}
        onChangement={onChangement}
        desactive={desactive}
      />
    );
  }

  switch (type) {
    case 'yes_no':
      return (
        <SegmenteONA
          libelle="Votre réponse"
          valeur={sansObjet ? 'na' : valeur?.type === 'yes_no' ? valeur.v : null}
          onChangement={(choix: ReponseONA) => {
            if (choix === 'na') onSansObjet();
            else onChangement({ type: 'yes_no', v: choix }, 'immediat');
          }}
          afficherRaccourcis={afficherRaccourcis}
          desactive={desactive}
        />
      );

    case 'scale_1_5': {
      const ancres: AncreCotation[] = lireAncresDeCotation(question.guidanceSnapshot).ancres.map(
        (ancre) => ({ note: ancre.niveau, texte: ancre.libelle }),
      );
      return (
        <EchelleAncree
          libelle="Votre cotation"
          valeur={valeur?.type === 'scale_1_5' ? valeur.v : null}
          onChangement={(note) => {
            onChangement({ type: 'scale_1_5', v: note }, 'immediat');
          }}
          ancres={ancres}
          noteMin={NOTE_MIN}
          noteMax={NOTE_MAX}
          afficherRaccourcis={afficherRaccourcis}
          desactive={desactive}
        />
      );
    }

    case 'single_choice':
      return (
        <ChoixUnique
          options={optionsDeQuestion(question.optionsSnapshot)}
          valeur={valeur?.type === 'single_choice' ? valeur.v : null}
          onChangement={(code) => {
            onChangement({ type: 'single_choice', v: code }, 'immediat');
          }}
          desactive={desactive}
        />
      );

    case 'multi_choice': {
      const choisis = valeur?.type === 'multi_choice' ? valeur.v : [];
      const options = optionsDeQuestion(question.optionsSnapshot);
      return (
        <fieldset className="axn-choix">
          <legend className="axn-choix__intitule">
            Cochez toutes les réponses qui s’appliquent
          </legend>
          {options.length === 0 ? (
            <p className="axn-champ__aide">Cette question ne déclare aucune option.</p>
          ) : (
            <div className="axn-choix-multiple">
              {options.map((option) => (
                <CaseACocher
                  key={option.code}
                  libelle={option.label}
                  checked={choisis.includes(option.code)}
                  disabled={desactive}
                  onChange={(evenement) => {
                    const suivants = evenement.target.checked
                      ? [...choisis, option.code]
                      : choisis.filter((code) => code !== option.code);
                    onChangement(
                      suivants.length === 0 ? null : { type: 'multi_choice', v: suivants },
                      'immediat',
                    );
                  }}
                />
              ))}
            </div>
          )}
        </fieldset>
      );
    }

    case 'free_text':
      return (
        <SaisieTexte
          valeur={valeur?.type === 'free_text' ? valeur.v : ''}
          onChangement={(texte) => {
            onChangement(texte === '' ? null : { type: 'free_text', v: texte }, 'differe');
          }}
          desactive={desactive}
        />
      );

    case 'number':
    case 'percent':
    case 'duration':
      return (
        <SaisieNombre
          libelle={
            type === 'duration' ? 'Durée (dans l’unité indiquée par la question)' : 'Votre réponse'
          }
          unite={UNITES[type]}
          valeur={valeur?.type === type ? valeur.v : null}
          onChangement={(nombre) => {
            onChangement(nombre === null ? null : { type, v: nombre }, 'differe');
          }}
          desactive={desactive}
        />
      );

    case 'money': {
      const devise = valeur?.type === 'money' ? valeur.currency : DEVISE_PAR_DEFAUT;
      return (
        <div className="axn-devise">
          <SaisieNombre
            libelle="Montant"
            valeur={valeur?.type === 'money' ? valeur.v : null}
            onChangement={(nombre) => {
              onChangement(
                nombre === null ? null : { type: 'money', v: nombre, currency: devise },
                'differe',
              );
            }}
            desactive={desactive}
          />
          <SaisieDevise
            devise={devise}
            onChangement={(nouvelle) => {
              if (valeur?.type === 'money') {
                onChangement({ ...valeur, currency: nouvelle }, 'immediat');
              }
            }}
            desactive={desactive}
          />
        </div>
      );
    }

    case 'date':
      return (
        <SaisieDate
          valeur={valeur?.type === 'date' ? valeur.v : ''}
          onChangement={(date) => {
            onChangement(date === '' ? null : { type: 'date', v: date }, 'immediat');
          }}
          desactive={desactive}
        />
      );

    case 'table':
      return (
        <SaisieTableau
          question={question}
          lignes={valeur?.type === 'table' ? valeur.v : []}
          onChangement={(lignes, cadence) => {
            onChangement(lignes.length === 0 ? null : { type: 'table', v: lignes }, cadence);
          }}
          desactive={desactive}
        />
      );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sous-saisies — chacune tient son état de FRAPPE (chaîne) et ne remonte que
// des valeurs lisibles.
// ─────────────────────────────────────────────────────────────────────────────
function SaisieTexte(proprietes: {
  readonly valeur: string;
  readonly onChangement: (texte: string) => void;
  readonly desactive: boolean;
}): ReactNode {
  const [texte, setTexte] = useState(proprietes.valeur);
  return (
    <ZoneNotes
      libelle="Votre réponse"
      value={texte}
      rows={5}
      disabled={proprietes.desactive}
      onChange={(evenement) => {
        setTexte(evenement.target.value);
        proprietes.onChangement(evenement.target.value);
      }}
    />
  );
}

function SaisieNombre(proprietes: {
  readonly libelle: string;
  readonly unite?: string | undefined;
  readonly valeur: number | null;
  readonly onChangement: (nombre: number | null) => void;
  readonly desactive: boolean;
}): ReactNode {
  const [texte, setTexte] = useState(saisieDepuisNombre(proprietes.valeur));
  const illisible = texte.trim() !== '' && nombreDepuisSaisie(texte) === null;
  return (
    <ChampTexte
      libelle={proprietes.libelle}
      nature="nombre"
      value={texte}
      disabled={proprietes.desactive}
      {...(proprietes.unite === undefined ? {} : { aide: `En ${proprietes.unite}` })}
      {...(illisible ? { erreur: MESSAGE_NOMBRE_ILLISIBLE } : {})}
      onChange={(evenement) => {
        const saisie = evenement.target.value;
        setTexte(saisie);
        if (saisie.trim() === '') proprietes.onChangement(null);
        else {
          const nombre = nombreDepuisSaisie(saisie);
          if (nombre !== null) proprietes.onChangement(nombre);
        }
      }}
    />
  );
}

function SaisieDevise(proprietes: {
  readonly devise: string;
  readonly onChangement: (devise: string) => void;
  readonly desactive: boolean;
}): ReactNode {
  const [texte, setTexte] = useState(proprietes.devise);
  const valide = /^[A-Z]{3}$/.test(texte);
  return (
    <ChampTexte
      libelle="Devise"
      value={texte}
      maxLength={3}
      autoCapitalize="characters"
      disabled={proprietes.desactive}
      aide="Code à trois lettres (EUR, USD, CHF…)"
      {...(valide || texte === '' ? {} : { erreur: 'Trois lettres majuscules.' })}
      onChange={(evenement) => {
        const saisie = evenement.target.value.toUpperCase();
        setTexte(saisie);
        if (/^[A-Z]{3}$/.test(saisie)) proprietes.onChangement(saisie);
      }}
    />
  );
}

function SaisieDate(proprietes: {
  readonly valeur: string;
  readonly onChangement: (date: string) => void;
  readonly desactive: boolean;
}): ReactNode {
  const identifiant = useId();
  return (
    <div className="axn-champ">
      <label className="axn-champ__libelle" htmlFor={identifiant}>
        Date
      </label>
      <input
        id={identifiant}
        className="axn-champ__saisie"
        type="date"
        value={proprietes.valeur}
        disabled={proprietes.desactive}
        data-saisie-libre="vrai"
        aria-describedby={`${identifiant}-aide`}
        onChange={(evenement) => {
          proprietes.onChangement(evenement.target.value);
        }}
      />
      <p id={`${identifiant}-aide`} className="axn-champ__aide">
        Une date civile, sans heure.
      </p>
    </div>
  );
}

function ChoixUnique(proprietes: {
  readonly options: readonly { code: string; label: string }[];
  readonly valeur: string | null;
  readonly onChangement: (code: string) => void;
  readonly desactive: boolean;
}): ReactNode {
  const nomGroupe = useId();
  return (
    <fieldset className="axn-choix">
      <legend className="axn-choix__intitule">Choisissez une réponse</legend>
      {proprietes.options.length === 0 ? (
        <p className="axn-champ__aide">Cette question ne déclare aucune option.</p>
      ) : (
        <div className="axn-choix__pistes">
          {proprietes.options.map((option) => (
            <label key={option.code} className="axn-choix__option">
              <input
                className="axn-visuellement-masque"
                type="radio"
                name={nomGroupe}
                value={option.code}
                checked={proprietes.valeur === option.code}
                disabled={proprietes.desactive}
                onChange={() => {
                  proprietes.onChangement(option.code);
                }}
              />
              <span>{option.label}</span>
              {proprietes.valeur === option.code && <IconeCoche className="axn-choix__marque" />}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

function SaisieEnFourchette(proprietes: {
  readonly type: 'number' | 'percent' | 'duration' | 'money';
  readonly valeur: Extract<ValeurTypee, { type: 'range' }> | null;
  readonly onChangement: (valeur: ValeurTypee | null, cadence: Cadence) => void;
  readonly desactive: boolean;
}): ReactNode {
  const { type, valeur, onChangement, desactive } = proprietes;
  const [bas, setBas] = useState(saisieDepuisNombre(valeur?.low));
  const [haut, setHaut] = useState(saisieDepuisNombre(valeur?.high));
  const devise = valeur?.currency ?? (type === 'money' ? DEVISE_PAR_DEFAUT : undefined);

  // N'ÉMET que ce que la garde à l'écriture accepterait : une fourchette
  // illisible ou incohérente (basse > haute) reste à l'écran, signalée par
  // `SaisieFourchette`, et la dernière fourchette valide reste en base.
  const emettre = (
    texteBas: string,
    texteHaut: string,
    nouvelleDevise: string | undefined,
  ): void => {
    if (texteBas.trim() === '' && texteHaut.trim() === '') {
      onChangement(null, 'differe');
      return;
    }
    const low = nombreDepuisSaisie(texteBas);
    const high = nombreDepuisSaisie(texteHaut);
    if (texteBas.trim() !== '' && low === null) return;
    if (texteHaut.trim() !== '' && high === null) return;
    if (low !== null && high !== null && low > high) return;
    onChangement(
      {
        type: 'range',
        low,
        high,
        ...(nouvelleDevise === undefined ? {} : { currency: nouvelleDevise }),
      },
      'differe',
    );
  };

  const illisible =
    (bas.trim() !== '' && nombreDepuisSaisie(bas) === null) ||
    (haut.trim() !== '' && nombreDepuisSaisie(haut) === null);

  return (
    <div className="axn-question__saisie">
      <SaisieFourchette
        libelle="Fourchette (borne basse et borne haute)"
        bas={bas}
        haut={haut}
        {...(devise === undefined ? {} : { unite: devise })}
        {...(UNITES[type] === undefined ? {} : { unite: UNITES[type] })}
        aide="Quand le chiffre exact est refusé, une fourchette ou un ordre de grandeur est souvent accepté (§27.4)."
        {...(illisible ? { erreur: MESSAGE_NOMBRE_ILLISIBLE } : {})}
        desactive={desactive}
        onChangement={(bornes) => {
          setBas(bornes.bas);
          setHaut(bornes.haut);
          emettre(bornes.bas, bornes.haut, devise);
        }}
      />
      {type === 'money' && (
        <SaisieDevise
          devise={devise ?? DEVISE_PAR_DEFAUT}
          onChangement={(nouvelle) => {
            emettre(bas, haut, nouvelle);
          }}
          desactive={desactive}
        />
      )}
    </div>
  );
}

function SaisieTableau(proprietes: {
  readonly question: QuestionLocale;
  readonly lignes: readonly LigneTableau[];
  readonly onChangement: (lignes: LigneTableau[], cadence: Cadence) => void;
  readonly desactive: boolean;
}): ReactNode {
  const { question, lignes, onChangement, desactive } = proprietes;
  const colonnes = colonnesDeTableau(question.optionsSnapshot);
  const [brouillon, setBrouillon] = useState<LigneTableau[]>([...lignes]);

  const remplacer = (suivantes: LigneTableau[], cadence: Cadence): void => {
    setBrouillon(suivantes);
    onChangement(suivantes, cadence);
  };

  return (
    <div className="axn-tableau">
      {brouillon.length === 0 && (
        <p className="axn-champ__aide">Aucune ligne pour l’instant. Ajoutez la première.</p>
      )}
      {brouillon.map((ligne, rang) => (
        <div key={rang} className="axn-tableau__ligne">
          <div className="axn-tableau__ligne-tete">
            <span>Ligne {rang + 1}</span>
            <Bouton
              variante="discret"
              disabled={desactive}
              onClick={() => {
                remplacer(
                  brouillon.filter((_, autre) => autre !== rang),
                  'immediat',
                );
              }}
            >
              Retirer
            </Bouton>
          </div>
          {colonnes.map((colonne) => (
            <ChampTexte
              key={colonne.code}
              libelle={colonne.label}
              value={ligne[colonne.code] ?? ''}
              disabled={desactive}
              onChange={(evenement) => {
                const suivantes = brouillon.map((autre, index) =>
                  index === rang ? { ...autre, [colonne.code]: evenement.target.value } : autre,
                );
                remplacer(suivantes, 'differe');
              }}
            />
          ))}
        </div>
      ))}
      <Bouton
        variante="secondaire"
        taille="large"
        disabled={desactive}
        onClick={() => {
          remplacer([...brouillon, {}], 'immediat');
        }}
      >
        Ajouter une ligne
      </Bouton>
    </div>
  );
}
