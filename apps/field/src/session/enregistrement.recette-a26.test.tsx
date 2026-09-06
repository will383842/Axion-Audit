// =============================================================================
// TESTS DE CONCEPTION A23 — « Enregistré à HH:mm » ne doit pas parler d'une
// AUTRE écriture que celle que l'auditeur vient de faire.
//
// ── STATUT DE CE FICHIER ────────────────────────────────────────────────────
// CONCEPTION, écrits par A23 avec le correctif ; les tests d'ACCEPTATION
// reviennent à un agent qui n'a écrit aucune de ces lignes (09 §5.6). Aucun
// n'est marqué `@critique` — un correctif ne se décerne pas son propre sceau.
//
// ── LE DÉFAUT, MESURÉ PAR A26 ───────────────────────────────────────────────
// `differer(cle, travail)` posait une minuterie et ne touchait PAS à l'état de
// l'indicateur. Pendant les ~300 ms de `DELAI_DEBOUNCE_MS`, l'écran affichait
// donc toujours « Enregistré à HH:mm » — l'horodatage de l'écriture PRÉCÉDENTE —
// alors que la frappe en cours n'était pas commitée.
//
// C'est la famille de défauts que ce dépôt traque : le garde-fou qui annonce
// plus qu'il ne fait. L'en-tête d'`enregistrement.ts` le disait déjà pour le
// chemin immédiat — « un indicateur qui verdit sur une promesse non tenue est
// exactement le mensonge que ce dépôt traque » — et le chemin débouncé ne le
// tenait pas. 03 §33.3 veut que « la confiance SE VOIE » ; une confiance qui se
// voit à tort est pire que pas d'indicateur, parce qu'elle se substitue au doute
// qui aurait fait relire l'écran.
//
// La perte réelle reste bornée à zéro par la purge sur `pagehide` — le défaut
// était LATENT. L'invariant 7 ne parle pas que de perte : rien ne doit se passer
// EN SILENCE, et un indicateur qui affirme le contraire de l'état réel est un
// silence habillé en confirmation.
//
// Traçabilité : E13 (écran 3 zones, enregistrement continu), E44 (UX/UI).
// =============================================================================
import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { IndicateurEnregistrement } from '@axion/ui';
import { DELAI_DEBOUNCE_MS, useEnregistrementContinu } from './enregistrement.js';

/** Le harnais : ce que l'auditeur VOIT, piloté par le vrai crochet. */
function Harnais({ fuseau }: { readonly fuseau: string }): ReactNode {
  const enregistrement = useEnregistrementContinu(fuseau);
  harnais = enregistrement;
  return (
    <IndicateurEnregistrement
      etat={enregistrement.etat}
      {...(enregistrement.horodatage === undefined
        ? {}
        : { horodatage: enregistrement.horodatage })}
    />
  );
}

let harnais: ReturnType<typeof useEnregistrementContinu> | null = null;

beforeEach(() => {
  harnais = null;
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function requis<T>(valeur: T | null, quoi: string): T {
  if (valeur === null) throw new Error(`${quoi} manquant`);
  return valeur;
}

describe('l’indicateur « Enregistré » est PAR ÉCRITURE, jamais par écriture précédente', () => {
  it('une frappe différée retire « Enregistré » AVANT la fin du débounce', async () => {
    const { result } = renderHook(() => useEnregistrementContinu('Europe/Paris'));

    // ① Une première écriture aboutit : l'indicateur a le droit de le dire.
    await act(async () => {
      await result.current.enregistrer(vi.fn().mockResolvedValue(undefined));
    });
    expect(result.current.etat).toBe('enregistre');
    const horodatagePrecedent = result.current.horodatage;
    expect(horodatagePrecedent).toMatch(/^\d{2}:\d{2}$/);

    // ② L'auditeur tape. Le travail est DIFFÉRÉ : rien n'est commité.
    const frappe = vi.fn().mockResolvedValue(undefined);
    act(() => {
      result.current.differer('note', frappe);
    });
    expect(frappe).not.toHaveBeenCalled();

    // ③ Le point du défaut : tant que rien n'est écrit, l'indicateur ne peut pas
    //    dire « Enregistré ». Il ne peut surtout pas afficher l'heure de ①.
    expect(result.current.etat).not.toBe('enregistre');

    // ④ Une fois le débounce écoulé, la confiance redevient méritée.
    await act(async () => {
      vi.advanceTimersByTime(DELAI_DEBOUNCE_MS + 1);
      await Promise.resolve();
    });
    expect(frappe).toHaveBeenCalledTimes(1);
    expect(result.current.etat).toBe('enregistre');
  });

  it('à l’écran : le mot « Enregistré » disparaît pendant la frappe, et revient après', async () => {
    render(<Harnais fuseau="Europe/Paris" />);

    await act(async () => {
      await requis(harnais, 'harnais').enregistrer(vi.fn().mockResolvedValue(undefined));
    });
    expect(screen.getByRole('status').textContent).toMatch(/Enregistré à \d{2}:\d{2}/);

    act(() => {
      requis(harnais, 'harnais').differer('note', vi.fn().mockResolvedValue(undefined));
    });
    // C'est CE texte que A26 a lu sur un écran dont la saisie n'était pas commitée.
    expect(screen.getByRole('status').textContent).not.toMatch(/Enregistré à/);
    expect(screen.getByRole('status').textContent).toMatch(/Enregistrement/);

    await act(async () => {
      vi.advanceTimersByTime(DELAI_DEBOUNCE_MS + 1);
      await Promise.resolve();
    });
    expect(screen.getByRole('status').textContent).toMatch(/Enregistré à \d{2}:\d{2}/);
  });

  it('la purge tient la même promesse : ce qui attendait est écrit, PUIS annoncé', async () => {
    const { result } = renderHook(() => useEnregistrementContinu('Europe/Paris'));
    const frappe = vi.fn().mockResolvedValue(undefined);

    act(() => {
      result.current.differer('note', frappe);
    });
    expect(result.current.etat).not.toBe('enregistre');

    await act(async () => {
      await result.current.purger();
    });
    expect(frappe).toHaveBeenCalledTimes(1);
    expect(result.current.etat).toBe('enregistre');
  });

  it('un échec de la frappe différée ne laisse JAMAIS « Enregistré » à l’écran', async () => {
    const { result } = renderHook(() => useEnregistrementContinu('Europe/Paris'));

    await act(async () => {
      await result.current.enregistrer(vi.fn().mockResolvedValue(undefined));
    });
    expect(result.current.etat).toBe('enregistre');

    act(() => {
      result.current.differer('note', () => Promise.reject(new Error('disque plein (fictif)')));
    });
    await act(async () => {
      vi.advanceTimersByTime(DELAI_DEBOUNCE_MS + 1);
      await Promise.resolve();
    });

    expect(result.current.etat).toBe('inactif');
    expect(result.current.erreur).toBe('disque plein (fictif)');
  });
});
