// =============================================================================
// ROUTE D'EXPORT DE MISSION — 03 §36.3. Lot L7, incrément L7c.
//
//   GET /v1/missions/:id/export?repondants=true  → application/zip
//
// ── D'OÙ VIENT CE CHEMIN, ET POURQUOI IL EST DÉCLARÉ ICI ───────────────────
// Il n'est listé NI au 05 §8 NI au §24.2 : le 11 §8-6 exige alors qu'il soit
// DOCUMENTÉ. Il l'est dans `DECISIONS.md` (2026-09-05) et ici. Le §36.3, lui,
// impose le livrable — « un ZIP `export_mission_<ref>_<AAAAMMJJ>.zip` » — sans
// nommer de route ; celle-ci porte la ressource « export d'une mission », sous la
// mission, comme les deux routes de pilotage de L7b.
//
// ── LA SEULE ROUTE DU DÉPÔT QUI NE REND PAS DU JSON ────────────────────────
// Le 11 §3 demande « un schéma Zod in/out » ; l'ENTRÉE (params, querystring) est
// validée comme partout. La SORTIE est un fichier : la valider en JSON exigerait
// de l'encoder en base64 dans une enveloppe (+33 % d'octets, un décodage
// navigateur) pour un contenu destiné à être ENREGISTRÉ. Ce qui, DANS le ZIP, est
// du JSON — `mission.json` — est validé par `metaExportSchema` avant d'y entrer.
// Écart tracé, pas subi.
//
// ── LA POLITIQUE : `mission`, DONC 404 POUR UN NON-MEMBRE ─────────────────
// Le crochet vérifie l'identité et le compte ; l'appartenance se prouve DANS LE
// DÉPÔT, qui rend `null`, que le service traduit en 404. Un 403 dirait « elle
// existe, mais pas pour vous » — l'oracle exact que le 404 ferme (convention L7b,
// `DECISIONS.md` 2026-09-02).
//
// ── AUCUNE MARQUE `financier`, ET C'EST VÉRIFIABLE ────────────────────────
// L'export ne lit ni `scoping_financials`, ni `scoping_estimates`, ni
// `estimation_params`, ni `mission_rebaselines` (§25.1, admin seul). Il rend ce
// que le CLIENT a dit et ce que le consultant a constaté ; jamais ce que la
// mission coûte (invariant 3, §18.3).
//
// ── ⚠ AVERTISSEMENT AU BALAYAGE SENTINELLE : LE CORPS EST COMPRESSÉ ───────
// `aide/sentinelle-financiere.ts` cherche des montants improbables dans le corps
// des réponses, LU COMME DU TEXTE. Le corps de cette route est un ZIP compressé :
// une sentinelle qui fuirait dans `reponses.csv` n'y serait visible sous aucune
// forme, et le balayage serait VERT sans avoir rien lu. Le lecteur
// `apps/api/tests/aide/archive-export.ts` existe pour cela — il décompresse
// l'archive et rend chaque fichier en texte, pour que l'étanchéité se vérifie sur
// ce que le consultant ouvrira réellement. Un balayage de cette route qui
// n'appellerait pas ce lecteur serait un vert aveugle.
//
// ── NON JOURNALISÉE DANS SON CONTENU ──────────────────────────────────────
// Comme l'agrégation : l'archive porte des réponses d'audit et des noms d'unités,
// que `activity_log` garantit de ne jamais contenir (11 §2).
//
// Traçabilité : E14 (consolidation) · E22 (console de pilotage) · E36
// (exécutable par lots avec critères) · E43 (conventions d'API).
// =============================================================================
import type { FastifyPluginAsync } from 'fastify';
import { AppError, exportMissionQuerySchema, missionParamsSchema } from '@axion/shared';
import type { UtilisateurAuthentifie } from '../auth/depot.js';
import type { FournisseurZod } from '../http/zod.js';
import { produireExportDeMission } from '../domaines/export/service.js';

/** Politique : membre de la mission OU administrateur — vérifiée dans le dépôt. */
const CONFIG_MISSION = { acces: { type: 'mission', parametreMission: 'id' } } as const;

/** Le rôle qui voit toute mission, membre ou non (03 §34.1). */
const ROLE_ADMIN = 'admin';

/**
 * Le type MIME du ZIP.
 *
 * `application/zip` et non `application/octet-stream` : le navigateur et le
 * système d'exploitation savent alors quoi en faire, et le consultant n'a pas à
 * renommer un fichier pour l'ouvrir.
 */
const TYPE_ZIP = 'application/zip';

export const routesExport: FastifyPluginAsync = async (app) => {
  const instance = app.withTypeProvider<FournisseurZod>();

  /** Le demandeur — jamais fabriqué : voir `routes/pilotage.ts`, même règle. */
  function demandeur(utilisateur: UtilisateurAuthentifie | null): {
    utilisateurId: string;
    estAdmin: boolean;
  } {
    if (utilisateur === null) {
      throw new AppError('INTERNAL_ERROR', 'Une erreur interne est survenue.');
    }
    return { utilisateurId: utilisateur.id, estAdmin: utilisateur.role === ROLE_ADMIN };
  }

  instance.get(
    '/missions/:id/export',
    {
      config: CONFIG_MISSION,
      schema: {
        params: missionParamsSchema,
        querystring: exportMissionQuerySchema,
      },
    },
    async (requete, reponse) => {
      const { nomFichier, archive } = await produireExportDeMission(
        requete.params.id,
        demandeur(requete.utilisateur),
        requete.query,
      );

      // `filename` est composé d'un UUID et de huit chiffres : aucun caractère à
      // échapper, aucune donnée du client dans le nom (invariant 2). Le titre de
      // la mission voyage dans `mission.json`, où il est à sa place.
      return (
        reponse
          .header('Content-Type', TYPE_ZIP)
          .header('Content-Disposition', `attachment; filename="${nomFichier}"`)
          .header('Content-Length', String(archive.length))
          // Un export est une PHOTO d'un état qui bouge à chaque synchronisation :
          // le mettre en cache ferait rédiger un rapport sur des données périmées.
          .header('Cache-Control', 'no-store')
          .send(archive)
      );
    },
  );

  await Promise.resolve();
};
