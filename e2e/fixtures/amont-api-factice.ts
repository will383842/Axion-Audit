// =============================================================================
// FIXTURE — LES EN-TÊTES QUE L'AMONT FACTICE `axion-api` POSE, LUS DANS
// `amont-api-factice.caddy` — jamais recopiés une seconde fois.
//
// Écrit par A26 (testeur E2E). Traçabilité : E36, E43 · DOSSIER_ZAP §4-A.
//
// Le fichier `.caddy` est le jumeau déclaré du bloc helmet d'apps/api/src/app.ts.
// Il existait déjà DEUX copies de sa CSP (le `.caddy` et `CSP_AMONT_HELMET` dans
// en-tetes-servis.e2e.ts) et AUCUNE garde entre le `.caddy` et helmet : si l'un
// dérivait, le test §4-A (`not.toBe(CSP_AMONT_HELMET)`) se comparait à une
// chaîne périmée et passait À VIDE (revue A29, réserve R5). Ce module rend le
// `.caddy` SEULE source : l'E2E y lit la CSP de l'amont, et la garde unitaire
// `apps/api/src/en-tetes-amont-jumeau.test.ts` le compare à ce que helmet émet.
// =============================================================================
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CHEMIN_AMONT_FACTICE = join(
  dirname(fileURLToPath(import.meta.url)),
  'amont-api-factice.caddy',
);

/**
 * Le bloc `header { … }` du `.caddy`, en carte `nom-en-minuscules → valeur`.
 *
 * Lecture volontairement étroite : une ligne `Nom "valeur"` par en-tête, dans
 * le SEUL bloc `header`. Une forme que ce lecteur ne connaît pas (sous-bloc,
 * `+Nom`, `-Nom`, `?Nom`, valeur sans guillemets) est une ERREUR, pas un en-tête
 * ignoré : un jumeau qu'on ne sait plus lire ne garde plus rien.
 */
export function enTetesAmontFactice(
  contenu: string = readFileSync(CHEMIN_AMONT_FACTICE, 'utf8'),
): Map<string, string> {
  const bloc = /^\s*header\s*\{\n([\s\S]*?)^\s*\}/m.exec(contenu)?.[1];
  if (bloc === undefined) {
    throw new Error(`${CHEMIN_AMONT_FACTICE} : aucun bloc \`header { … }\` lisible.`);
  }
  const enTetes = new Map<string, string>();
  for (const ligne of bloc.split('\n')) {
    if (ligne.trim() === '' || ligne.trim().startsWith('#')) continue;
    const lu = /^\s*([A-Za-z][A-Za-z0-9-]*)\s+"([^"]*)"\s*$/.exec(ligne);
    if (lu?.[1] === undefined || lu[2] === undefined) {
      throw new Error(`${CHEMIN_AMONT_FACTICE} : ligne d'en-tête illisible : « ${ligne.trim()} »`);
    }
    enTetes.set(lu[1].toLowerCase(), lu[2]);
  }
  return enTetes;
}

/** La CSP que l'amont factice émet — celle de helmet, mesurée (voir le `.caddy`). */
export function cspAmontFactice(): string {
  const csp = enTetesAmontFactice().get('content-security-policy');
  if (csp === undefined) {
    throw new Error(`${CHEMIN_AMONT_FACTICE} ne pose aucune Content-Security-Policy.`);
  }
  return csp;
}
