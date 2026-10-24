// =============================================================================
// CAPTURE DU JOURNAL PINO — lit les lignes JSON RÉELLEMENT écrites par l'instance
// racine (redaction comprise), sans double. Le niveau doit être posé AVANT l'import
// de l'application (`niveauJournal: 'info'` dans `monterSocle`).
// =============================================================================
export interface CaptureJournal {
  /** Les lignes JSON analysées depuis le début de la capture. */
  lignes(): Record<string, unknown>[];
  /** Le texte brut capturé (pour prouver l'absence de données personnelles). */
  brut(): string;
  arreter(): void;
}

export async function capturerJournal(): Promise<CaptureJournal> {
  const { logger } = await import('../../src/logger.js');
  const symbole = Object.getOwnPropertySymbols(logger).find((x) => x.description === 'pino.stream');
  const flux = (logger as unknown as Record<symbol, { write: (s: string) => unknown } | undefined>)[
    symbole ?? Symbol('absent')
  ];
  if (flux === undefined) throw new Error('flux pino introuvable (symbole pino.stream)');
  const origine = flux.write.bind(flux);
  const morceaux: string[] = [];
  flux.write = (s: string): unknown => {
    morceaux.push(s);
    return origine(s);
  };
  return {
    lignes(): Record<string, unknown>[] {
      const sortie: Record<string, unknown>[] = [];
      for (const ligne of morceaux.join('').split('\n')) {
        if (ligne.trim() === '') continue;
        try {
          sortie.push(JSON.parse(ligne) as Record<string, unknown>);
        } catch {
          // ligne non JSON : ignorée
        }
      }
      return sortie;
    },
    brut(): string {
      return morceaux.join('');
    },
    arreter(): void {
      flux.write = origine;
    },
  };
}
