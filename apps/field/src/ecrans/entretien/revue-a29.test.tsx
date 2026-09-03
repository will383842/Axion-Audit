// =============================================================================
// LES DEUX BLOQUANTS DE LA REVUE A29 — lot L5, incrément L5b.
// Écrit par A26 (09 §5.6 : A22 a écrit le code corrigé, il n'écrit pas ces tests).
//
// ── POURQUOI UN FICHIER À PART ──────────────────────────────────────────────
// Ces cas éprouvent des CONTRATS, pas des parcours : « la promesse dit-elle la
// vérité ? », « la consigne est-elle rendue ? », « le shim de test répond-il ce
// qu'il annonce ? ». Les monter dans `EcranEntretien.test.tsx` les diluerait
// dans un décor de 29 cas qui, précisément, n'a jamais attrapé ces trois défauts.
//
// Traçabilité : E13 (écran 3 zones, notes volantes, enregistrement continu),
// E23 (hyper intuitif, novice < 30 min), E44 (raccourcis complets — grille §33).
// =============================================================================
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { lireAncresDeCotation } from '@axion/shared';
import type { QuestionLocale } from '../../local/depots/questions.js';
import { REQUETE_POINTEUR_FIN, REQUETE_TROIS_COLONNES } from '../../session/media.js';
import { PanneauNotes } from './PanneauNotes.js';
import { ZoneQuestion } from './ZoneQuestion.js';

// ═════════════════════════════════════════════════════════════════════════════
// B1 — UNE NOTE VOLANTE N'EST EFFACÉE QUE SI ELLE A ÉTÉ ÉCRITE
// ═════════════════════════════════════════════════════════════════════════════
const TEXTE_NOTE = 'SENTINELLE_NOTE_B1_ZW3K8Q — le service refuse de chiffrer les délais';

function rendrePanneau(onCapturer: (texte: string) => Promise<boolean>): void {
  render(
    <PanneauNotes
      cleNoteDeQuestion="q1"
      noteDeQuestion=""
      onNoteDeQuestion={() => undefined}
      ecriturePossible
      cleBlocNotes="s1"
      notesGenerales=""
      onNotesGenerales={() => undefined}
      notesVolantes={[]}
      onCapturerNoteVolante={onCapturer}
      reponseCouranteId={null}
      onRattacher={() => undefined}
      onDetacher={() => undefined}
      onSupprimer={() => undefined}
      fuseau="Europe/Paris"
    />,
  );
}

/** La zone « Je ne sais pas encore où la mettre » et son bouton. */
function captureNoteVolante(): { zone: HTMLTextAreaElement; bouton: HTMLElement } {
  const zone = screen.getByLabelText(/où la mettre/i);
  if (!(zone instanceof HTMLTextAreaElement)) throw new Error('zone de capture introuvable');
  return { zone, bouton: screen.getByRole('button', { name: 'Garder cette note volante' }) };
}

describe('B1 — « Garder cette note volante » n’efface rien qu’il n’a pas su ranger', () => {
  it('CONSERVE le texte quand la capture est REFUSÉE (identité inconnue)', async () => {
    // Le refus que l'écran oppose quand l'identité de l'auditeur n'est pas rangée
    // sur l'appareil : il rend `false`, il ne résout pas un succès silencieux.
    const refuser = vi.fn<(texte: string) => Promise<boolean>>().mockResolvedValue(false);
    rendrePanneau(refuser);
    const { zone, bouton } = captureNoteVolante();

    fireEvent.change(zone, { target: { value: TEXTE_NOTE } });
    fireEvent.click(bouton);

    await waitFor(() => {
      expect(refuser).toHaveBeenCalledWith(TEXTE_NOTE);
    });
    // LE CŒUR DU BLOQUANT : avant correction, cette valeur devenait ''.
    await waitFor(() => {
      expect(zone.value).toBe(TEXTE_NOTE);
    });
  });

  it('CONSERVE le texte quand l’écriture locale ÉCHOUE', async () => {
    // Seconde face du bloquant : l'enregistrement continu AVALE l'échec pour en
    // faire un état affichable, donc la promesse résout même quand la transaction
    // Dexie a échoué. Le booléen distingue « écrit » de « tenté ».
    const echouer = vi.fn<(texte: string) => Promise<boolean>>().mockResolvedValue(false);
    rendrePanneau(echouer);
    const { zone, bouton } = captureNoteVolante();

    fireEvent.change(zone, { target: { value: TEXTE_NOTE } });
    fireEvent.click(bouton);

    await waitFor(() => {
      expect(echouer).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(zone.value).toBe(TEXTE_NOTE);
    });
  });

  it('EFFACE le texte quand, et seulement quand, la note est écrite', async () => {
    const ecrire = vi.fn<(texte: string) => Promise<boolean>>().mockResolvedValue(true);
    rendrePanneau(ecrire);
    const { zone, bouton } = captureNoteVolante();

    fireEvent.change(zone, { target: { value: TEXTE_NOTE } });
    fireEvent.click(bouton);

    await waitFor(() => {
      expect(zone.value).toBe('');
    });
  });

  it('ne tente rien sur un brouillon vide — une note vide n’a rien à retenir', () => {
    const capturer = vi.fn<(texte: string) => Promise<boolean>>().mockResolvedValue(true);
    rendrePanneau(capturer);
    const { bouton } = captureNoteVolante();
    expect(bouton.hasAttribute('disabled')).toBe(true);
    fireEvent.click(bouton);
    expect(capturer).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// B2 — LA CONSIGNE CONSULTANT EST RENDUE, Y COMPRIS SUR UNE ÉCHELLE
// ═════════════════════════════════════════════════════════════════════════════
const CONSIGNE = 'Faire préciser QUI valide, et à quel montant le circuit change.';
const GUIDANCE_ECHELLE =
  CONSIGNE + ' 1 = aucun circuit · 3 = circuit écrit non suivi · 5 = circuit écrit et tracé';

function questionFictive(partiel: Partial<QuestionLocale> = {}): QuestionLocale {
  return {
    id: '0191e2a0-0000-7000-8000-0000000f0001',
    missionId: '0191e2a0-0000-7000-8000-0000000f0002',
    position: 1,
    texteSnapshot: 'Comment les demandes sont-elles validées ?',
    motsCles: ['demandes', 'validees'],
    answerType: 'scale_1_5',
    criticality: 'important',
    clientUpdatedAt: '2026-09-02T08:00:00.000Z',
    supprimeLe: null,
    questionId: '0191e2a0-0000-7000-8000-0000000f0003',
    questionVersion: 1,
    guidanceSnapshot: GUIDANCE_ECHELLE,
    optionsSnapshot: null,
    scoringSnapshot: null,
    weightSnapshot: 0,
    allowRangeSnapshot: false,
    addedAdHoc: false,
    blockCode: 'bloc_fictif',
    ...partiel,
  };
}

function rendreZoneQuestion(question: QuestionLocale): { container: HTMLElement } {
  const rendu = render(
    <ZoneQuestion
      question={question}
      rang={1}
      total={10}
      reponse={null}
      horsParcours={false}
      partage={false}
      ecritureRefusee={null}
      fourchette={false}
      onFourchette={() => undefined}
      onValeur={() => undefined}
      onDrapeau={() => undefined}
      onNote={() => undefined}
      onRecherche={() => undefined}
      onQuestionAdHoc={() => undefined}
      onPrecedent={() => undefined}
      onSuivant={() => undefined}
      peutPrecedent={false}
      peutSuivant
      afficherRaccourcis
    />,
  );
  return { container: rendu.container };
}

describe('B2 — la consigne consultant survit aux ancres (03 M3.1, §17.5)', () => {
  it('le parseur d’ancres rend la PROSE, en plus des ancres', () => {
    const lu = lireAncresDeCotation(GUIDANCE_ECHELLE);
    expect(lu.ancres.map((a) => a.niveau)).toEqual([1, 3, 5]);
    // Avant B2, cette prose était jetée sans que rien ne le dise.
    expect(lu.consigne).toBe(CONSIGNE);
  });

  it('ne rend PAS une chaîne vide quand la guidance n’est QUE des ancres', () => {
    // Un paragraphe fantôme est un défaut d'affichage, pas une consigne.
    expect(lireAncresDeCotation('1 = rien · 5 = tout').consigne).toBeNull();
    expect(lireAncresDeCotation(null).consigne).toBeNull();
  });

  it('ne recrache PAS les ancres malformées dans la consigne', () => {
    // « 0 = … » et « 4 = » sont des défauts de rédaction, signalés par les deux
    // listes dédiées ; les afficher ferait lire « 0 = » à l'auditeur en pleine
    // question, ce qui est pire que de les taire.
    const lu = lireAncresDeCotation('Consigne utile. 0 = hors échelle · 4 = · 5 = tout');
    expect(lu.consigne).toBe('Consigne utile.');
    expect(lu.niveauxHorsEchelle).toEqual([0]);
    expect(lu.niveauxSansLibelle).toEqual([4]);
  });

  it('AFFICHE la consigne sur une question `scale_1_5` — le bloquant B2 lui-même', () => {
    rendreZoneQuestion(questionFictive());
    expect(screen.getByText(CONSIGNE)).toBeTruthy();
  });

  it('n’affiche PAS les ancres deux fois : elles restent sous l’échelle', () => {
    const { container } = rendreZoneQuestion(questionFictive());
    const consigne = container.querySelector('.axn-question__consigne');
    expect(consigne?.textContent).toBe(CONSIGNE);
    expect(consigne?.textContent).not.toContain('1 =');
  });

  it('rend la guidance ENTIÈRE sur un type sans ancres', () => {
    const texte = 'Demander le registre et vérifier sa date de dernière mise à jour.';
    rendreZoneQuestion(questionFictive({ answerType: 'free_text', guidanceSnapshot: texte }));
    expect(screen.getByText(texte)).toBeTruthy();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// C5 — L'OUTILLAGE DE TEST DOIT RÉPONDRE CE QU'IL ANNONCE
// ═════════════════════════════════════════════════════════════════════════════
describe('C5 — le shim `matchMedia` de `vitest.setup.interface.ts` ne ment plus', () => {
  it('rend VRAI pour le seuil des trois colonnes — le livrable-titre de L5b', () => {
    // Avant correction, ce shim rendait `matches: false` À TOUTE REQUÊTE tout en
    // affirmant dans son propre commentaire rendre « un écran large ». Les 29 cas
    // de l'écran d'entretien rendaient donc la disposition en PANNEAUX et jamais
    // les trois colonnes : des tests verts qui mesuraient l'autre moitié.
    expect(window.matchMedia(REQUETE_TROIS_COLONNES).matches).toBe(true);
  });

  it('rend VRAI pour le pointeur fin — donc les rappels de raccourcis sont testés', () => {
    expect(window.matchMedia(REQUETE_POINTEUR_FIN).matches).toBe(true);
  });

  it('suit la largeur RÉELLE de jsdom au lieu d’inventer une réponse', () => {
    // C'est ce qui rend l'autre branche atteignable par un test qui la veut.
    const largeur = window.innerWidth;
    try {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 500 });
      expect(window.matchMedia(REQUETE_TROIS_COLONNES).matches).toBe(false);
      expect(window.matchMedia('(max-width: 40rem)').matches).toBe(true);
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: largeur });
    }
  });

  it('ne déclare AUCUNE préférence d’accessibilité — le cas nominal', () => {
    expect(window.matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(false);
  });
});
