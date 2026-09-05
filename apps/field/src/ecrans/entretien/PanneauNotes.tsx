// =============================================================================
// ZONE DROITE — « notes libres attachées à la question courante ET bloc-notes
// général de l'entretien (le plus précieux se dit à côté des questions) »
// (03 M3.1), plus les NOTES VOLANTES (03 §17.4).
//
// Trois sections, trois destinations d'écriture :
//   · note de question   → `answers.note`         (charge chiffrée)
//   · bloc-notes         → `interviews.general_notes` (charge chiffrée)
//   · notes volantes     → `attachments` kind `note` (charge chiffrée)
// Le texte s'enregistre en continu, débouncé (`differer`) ; une note volante se
// capture d'un geste (`enregistrer`) et se rattache plus tard à la question
// courante — quand celle-ci a une réponse à laquelle s'accrocher.
//
// ── LES BROUILLONS ONT CHACUN LEUR CLÉ ──────────────────────────────────────
// Le brouillon d'une note de question est remonté avec la QUESTION (`cle`), et
// celui du bloc-notes avec la SESSION — jamais l'un avec l'autre. Un seul
// brouillon partagé, remonté à chaque changement de question, repartirait du
// texte persisté AVANT que la lecture vivante l'ait rafraîchi : la frappe
// suivante écraserait une note par une version plus ancienne. C'est le genre
// de perte que l'invariant 7 interdit, et elle ne se voit qu'en entretien.
//
// Et chaque brouillon REFLÈTE la valeur lue tant que l'auditeur n'y a pas
// touché : à la reprise d'un entretien, la note existante arrive APRÈS le
// premier rendu (lecture IndexedDB), sans que la clé change. Un brouillon figé
// sur la première valeur vue (`''`) l'aurait masquée, et la première frappe
// l'aurait écrasée. Le brouillon ne devient la référence qu'à la première
// frappe — et c'est alors le texte complet du champ, note existante comprise.
//
// Tout ce panneau est INTERNE : jamais rendu en écran partagé.
// Traçabilité : E13 (écran 3 zones, notes volantes).
// =============================================================================
import { useState, type ReactNode } from 'react';
import { Badge, Bouton, ZoneNotes } from '@axion/ui';
import { formaterHeure } from '../../session/fuseau.js';
import type { NoteVolanteLocale } from '../../session/notes-volantes.js';

export interface ProprietesPanneauNotes {
  /** Change quand la question change (ou qu'une décision a réécrit la note) : remonte le brouillon. */
  readonly cleNoteDeQuestion: string;
  readonly noteDeQuestion: string;
  readonly onNoteDeQuestion: (texte: string) => void;
  /** `false` tant que l'écriture est refusée (entretien non démarré ou validé). */
  readonly ecriturePossible: boolean;
  /** Change avec la session : remonte le brouillon du bloc-notes. */
  readonly cleBlocNotes: string;
  readonly notesGenerales: string;
  readonly onNotesGenerales: (texte: string) => void;
  readonly notesVolantes: readonly NoteVolanteLocale[];
  /**
   * Capture une note volante. **Rend `true` SI ET SEULEMENT SI la note est
   * persistée**, jamais `Promise<void>` — bloquant B1 de la revue A29 : une
   * promesse qui résout sans avoir écrit est lue comme un succès par
   * l'appelant, qui vide alors le champ. Le texte de l'auditeur disparaît
   * sans avoir été enregistré (invariant 7, 03 §17.4).
   */
  readonly onCapturerNoteVolante: (texte: string) => Promise<boolean>;
  /** `null` = la question courante n'a pas encore de réponse : rien à rattacher. */
  readonly reponseCouranteId: string | null;
  readonly onRattacher: (note: NoteVolanteLocale) => void;
  readonly onDetacher: (note: NoteVolanteLocale) => void;
  readonly onSupprimer: (note: NoteVolanteLocale) => void;
  readonly fuseau: string | undefined;
  /** Identifiant DOM de la zone de note — le bouton « Note » de la barre y pose le focus. */
  readonly idNoteDeQuestion?: string;
}

export function PanneauNotes(proprietes: ProprietesPanneauNotes): ReactNode {
  const {
    cleNoteDeQuestion,
    noteDeQuestion,
    onNoteDeQuestion,
    ecriturePossible,
    cleBlocNotes,
    notesGenerales,
    onNotesGenerales,
    notesVolantes,
    onCapturerNoteVolante,
    reponseCouranteId,
    onRattacher,
    onDetacher,
    onSupprimer,
    fuseau,
    idNoteDeQuestion,
  } = proprietes;

  return (
    <div className="axn-notes">
      <section className="axn-notes__section" aria-labelledby="axn-notes-question">
        <h3 id="axn-notes-question">Note sur cette question</h3>
        <Brouillon
          key={cleNoteDeQuestion}
          libelle="Ce qui se dit à côté de la question"
          initial={noteDeQuestion}
          lignes={4}
          desactive={!ecriturePossible}
          {...(ecriturePossible ? {} : { aide: 'Démarrez l’entretien pour prendre des notes.' })}
          {...(idNoteDeQuestion === undefined ? {} : { id: idNoteDeQuestion })}
          onTexte={onNoteDeQuestion}
        />
      </section>

      <section className="axn-notes__section" aria-labelledby="axn-notes-general">
        <h3 id="axn-notes-general">Bloc-notes de l’entretien</h3>
        <Brouillon
          key={cleBlocNotes}
          libelle="Contexte, ambiance, ce qui n’entre dans aucune question"
          initial={notesGenerales}
          lignes={5}
          desactive={!ecriturePossible}
          onTexte={onNotesGenerales}
        />
      </section>

      <section className="axn-notes__section" aria-labelledby="axn-notes-volantes">
        <h3 id="axn-notes-volantes">Notes volantes</h3>
        <CaptureNoteVolante desactive={!ecriturePossible} onCapturer={onCapturerNoteVolante} />

        {notesVolantes.length === 0 ? (
          <p className="axn-champ__aide">Aucune note volante dans cet entretien.</p>
        ) : (
          <ul className="axn-notes__liste">
            {notesVolantes.map((note) => {
              const rattacheeIci = note.answerId !== null && note.answerId === reponseCouranteId;
              return (
                <li key={note.id} className="axn-notes__volante">
                  <p>{note.content ?? ''}</p>
                  <div className="axn-notes__volante-meta">
                    <span>{formaterHeure(note.clientCreatedAt, fuseau)}</span>
                    {note.answerId === null ? (
                      <Badge ton="neutre">à rattacher</Badge>
                    ) : rattacheeIci ? (
                      <Badge ton="succes">rattachée à cette question</Badge>
                    ) : (
                      <Badge ton="info">rattachée à une autre question</Badge>
                    )}
                  </div>
                  <div className="axn-notes__volante-actions">
                    {note.answerId === null && (
                      <Bouton
                        variante="secondaire"
                        disabled={!ecriturePossible || reponseCouranteId === null}
                        onClick={() => {
                          onRattacher(note);
                        }}
                      >
                        Rattacher à cette question
                      </Bouton>
                    )}
                    {note.answerId !== null && (
                      <Bouton
                        variante="discret"
                        disabled={!ecriturePossible}
                        onClick={() => {
                          onDetacher(note);
                        }}
                      >
                        Détacher
                      </Bouton>
                    )}
                    <Bouton
                      variante="discret"
                      disabled={!ecriturePossible}
                      onClick={() => {
                        onSupprimer(note);
                      }}
                    >
                      Supprimer
                    </Bouton>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {reponseCouranteId === null && notesVolantes.some((note) => note.answerId === null) && (
          <p className="axn-champ__aide">
            Répondez d’abord à la question courante pour pouvoir y rattacher une note volante.
          </p>
        )}
      </section>
    </div>
  );
}

/**
 * Une zone de texte qui reflète la valeur lue (`initial`) jusqu'à la première
 * frappe, puis tient son brouillon et remonte chaque frappe. La clé posée par
 * l'appelant remet le brouillon à zéro (changement de question ou de session).
 */
function Brouillon(proprietes: {
  readonly libelle: string;
  readonly initial: string;
  readonly lignes: number;
  readonly desactive: boolean;
  readonly aide?: string;
  readonly id?: string;
  readonly onTexte: (texte: string) => void;
}): ReactNode {
  const { libelle, initial, lignes, desactive, aide, id, onTexte } = proprietes;
  /** `null` = jamais touché : le champ montre la valeur lue. */
  const [brouillon, setBrouillon] = useState<string | null>(null);
  return (
    <ZoneNotes
      libelle={libelle}
      value={brouillon ?? initial}
      rows={lignes}
      disabled={desactive}
      {...(aide === undefined ? {} : { aide })}
      {...(id === undefined ? {} : { id })}
      onChange={(evenement) => {
        setBrouillon(evenement.target.value);
        onTexte(evenement.target.value);
      }}
    />
  );
}

function CaptureNoteVolante(proprietes: {
  readonly desactive: boolean;
  readonly onCapturer: (texte: string) => Promise<boolean>;
}): ReactNode {
  const { desactive, onCapturer } = proprietes;
  const [brouillon, setBrouillon] = useState('');
  const [enCours, setEnCours] = useState(false);

  const capturer = (): void => {
    if (brouillon.trim() === '' || enCours) return;
    // Ce qui est ENVOYÉ est figé ici. Tout ce que l'auditeur tapera pendant
    // l'écriture ne fait PAS partie de cette note, et ne doit donc pas partir
    // avec elle — ni disparaître avec elle.
    const capture = brouillon;
    setEnCours(true);
    void onCapturer(capture)
      .then((ecrite) => {
        if (!ecrite) return;
        // ── TROISIÈME FACE DE B1 (réserve R2 du rejeu A29, 2026-09-03) ────────
        // `setBrouillon('')` effaçait AUSSI les caractères tapés depuis le clic.
        // La fenêtre est courte mais réelle, et la file sérialisée de
        // `enregistrement.ts` l'élargit : une frappe débouncée en attente ajoute
        // son délai avant que celle-ci ne s'exécute. Même geste, même invariant 7
        // — du texte saisi disparaît sans avoir été écrit.
        //
        // ON RETIRE CE QU'ON A RANGÉ, PAS LE CHAMP. Et si le début du champ n'est
        // plus la capture (l'auditeur a corrigé le milieu de sa phrase pendant
        // l'écriture), ON NE RETIRE RIEN : garder un texte en trop se répare d'un
        // geste, en perdre un ne se répare pas. Le repli va vers la conservation.
        //
        // POURQUOI PAS `disabled={desactive || enCours}` : bloquer la frappe
        // pendant l'écriture contredit 03 §17.4 — « rien de ce qui se dit ne doit
        // attendre qu'on trouve la bonne case ». L'auditeur est en entretien ;
        // c'est l'interface qui s'adapte, pas lui.
        setBrouillon((actuel) =>
          actuel.startsWith(capture) ? actuel.slice(capture.length) : actuel,
        );
      })
      .finally(() => {
        setEnCours(false);
      });
  };

  return (
    <>
      <ZoneNotes
        libelle="« Je ne sais pas encore où la mettre »"
        aide="Capture immédiate ; le rattachement à une question se fait après."
        value={brouillon}
        rows={2}
        disabled={desactive}
        onChange={(evenement) => {
          setBrouillon(evenement.target.value);
        }}
      />
      <Bouton
        variante="secondaire"
        pleineLargeur
        chargement={enCours}
        disabled={desactive || brouillon.trim() === ''}
        onClick={capturer}
      >
        Garder cette note volante
      </Bouton>
    </>
  );
}
