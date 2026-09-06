// =============================================================================
// TESTS DE CONCEPTION A22 — doute de spec **D-1** (recette novice A54 §8-2,
// réserve de la porte P-C reprise par A02) : « rien n'est prévu si
// l'interlocuteur REFUSE — alors que le refus est un fait d'audit à tracer ».
//
// ── CE QUI A ÉTÉ TRANCHÉ, ET PAR QUI ────────────────────────────────────────
// `DECISIONS.md`, 2026-09-06 : le refus s'écrit comme une NOTE HORODATÉE sur la
// session, qui reste `non_demarre` et sans accord. La modélisation (un état de
// session dédié, ou `schedule_status='annule'`) touche le sens d'un champ remonté
// au siège : elle part en fiche `AMELIORATIONS.md` d'étage 2 et n'est PAS faite
// ici (CLAUDE.md §3-2, §6).
//
// ── STATUT DE CE FICHIER ────────────────────────────────────────────────────
// Tests de CONCEPTION, écrits par A22 AVANT le correctif. L'ACCEPTATION revient
// à A27 (09 §5.6). Aucun cas n'est `@critique`.
//
// ── CE QU'ILS TIENNENT ──────────────────────────────────────────────────────
//   1. L'écran de démarrage offre une SORTIE nommée pour le refus — le cul-de-sac
//      muet du rapport A54 n'existe plus.
//   2. Le refus n'est jamais confondu avec un accord : `onDemarrer` n'est pas
//      appelé, la session ne démarre pas.
//   3. La note construite porte le fait, l'heure et le motif rapporté, et elle
//      s'AJOUTE aux notes existantes — invariant 7, rien n'est écrasé.
//
// Traçabilité : E33 (RGPD — accord de participation), E12 (entretiens par
// interlocuteur), E23 (hyper intuitif).
// =============================================================================
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  construireNoteDeRefus,
  DemarrageEntretien,
  PREFIXE_REFUS_PARTICIPATION,
} from './DemarrageEntretien.js';

const MOTIF = 'SENTINELLE_REFUS_D1_KQ7X2M — renvoie vers sa direction';

function rendre(options: {
  readonly onDemarrer?: (accord: boolean) => Promise<void>;
  readonly onRefus?: (motif: string) => Promise<void>;
}) {
  render(
    <DemarrageEntretien
      personName="Interlocuteur fictif"
      onDemarrer={options.onDemarrer ?? (() => Promise.resolve())}
      onRefus={options.onRefus ?? (() => Promise.resolve())}
    />,
  );
}

describe('D-1 — le refus de participation est une SORTIE, pas une impasse', () => {
  it('l’écran de démarrage offre un geste qui nomme le refus', () => {
    rendre({});
    expect(screen.getByRole('button', { name: /refuse/i })).toBeTruthy();
  });

  it('le refus n’est JAMAIS confondu avec un accord : la session ne démarre pas', async () => {
    const onDemarrer = vi.fn<(accord: boolean) => Promise<void>>().mockResolvedValue(undefined);
    const onRefus = vi.fn<(motif: string) => Promise<void>>().mockResolvedValue(undefined);
    rendre({ onDemarrer, onRefus });

    fireEvent.click(screen.getByRole('button', { name: /refuse/i }));
    const champ = await screen.findByLabelText(/refus/i);
    fireEvent.change(champ, { target: { value: MOTIF } });
    fireEvent.click(screen.getByRole('button', { name: /enregistrer le refus/i }));

    await waitFor(() => {
      expect(onRefus).toHaveBeenCalledWith(MOTIF);
    });
    expect(onDemarrer).not.toHaveBeenCalled();
  });

  it('le motif est FACULTATIF — un refus sans explication reste un refus tracé', async () => {
    const onRefus = vi.fn<(motif: string) => Promise<void>>().mockResolvedValue(undefined);
    rendre({ onRefus });

    fireEvent.click(screen.getByRole('button', { name: /refuse/i }));
    fireEvent.click(await screen.findByRole('button', { name: /enregistrer le refus/i }));

    await waitFor(() => {
      expect(onRefus).toHaveBeenCalledWith('');
    });
  });

  it('on peut renoncer au refus et revenir au démarrage — aucune écriture', async () => {
    const onRefus = vi.fn<(motif: string) => Promise<void>>().mockResolvedValue(undefined);
    rendre({ onRefus });

    fireEvent.click(screen.getByRole('button', { name: /refuse/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^revenir/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /démarrer l’entretien/i })).toBeTruthy();
    });
    expect(onRefus).not.toHaveBeenCalled();
  });
});

describe('D-1 — la note de refus dit le fait, l’heure et le motif', () => {
  const HORODATAGE_AFFICHE = '06/09/2026 10:12';

  it('porte le préfixe repérable, l’horodatage de mission et le motif rapporté', () => {
    const note = construireNoteDeRefus(MOTIF, HORODATAGE_AFFICHE);
    expect(note).toContain(PREFIXE_REFUS_PARTICIPATION);
    expect(note).toContain(HORODATAGE_AFFICHE);
    expect(note).toContain(MOTIF);
  });

  it('dit « non précisé » quand l’interlocuteur n’a pas donné de raison', () => {
    const note = construireNoteDeRefus('   ', HORODATAGE_AFFICHE);
    expect(note).toContain(PREFIXE_REFUS_PARTICIPATION);
    expect(note).toMatch(/non précisé/i);
  });

  it('est en français, sans jargon technique ni identifiant interne', () => {
    const note = construireNoteDeRefus(MOTIF, HORODATAGE_AFFICHE);
    expect(note).not.toMatch(/interview_id|consent_given|non_demarre|null|undefined/i);
  });
});
