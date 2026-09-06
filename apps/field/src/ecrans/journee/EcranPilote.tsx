// =============================================================================
// PILOTE DE MISSION — 03 §17.2 (les 6 étapes), §19.1 (verrous parlants),
// §29 R1 (parcours express condensé)
//
// ── LA RÈGLE D'AFFICHAGE QUI COMMANDE CET ÉCRAN ────────────────────────────
// 03 §19.1, dernière ligne : « chaque étape verrouillée affiche PRÉCISÉMENT ce
// qui manque pour la déverrouiller (**liste cliquable**), **jamais un simple
// cadenas muet**. » Et §17.2 : « cliquer sur un item incomplet amène directement
// à l'écran qui le résout ».
// C'est pourquoi chaque étape non validée rend SES manques, et pourquoi ceux qui
// se résolvent au terrain portent un bouton. Ceux qui se résolvent au SIÈGE le
// disent — envoyer l'auditeur vers un écran qui n'existe pas sur sa tablette
// serait pire qu'un cadenas muet : ce serait une porte peinte sur un mur.
//
// ── CE QUE LE TERRAIN CALCULE, ET CE QU'IL NE CALCULE PAS ──────────────────
// Il MESURE ses propres lignes locales (unités, questions figées, sessions) et
// en déduit l'état des étapes. Il ne fait PAS avancer la mission : la machine à
// états de `missions.status` est SERVEUR (`packages/shared/src/missions.ts`,
// L3), et le §32.2 réserve les transitions au siège. Cet écran ORIENTE, il ne
// décide pas — invariant 6.
//
// ── R1 EN UN COUP D'ŒIL ────────────────────────────────────────────────────
// En parcours express (03 §29), trois étapes seulement sont visibles et le motif
// est affiché : l'auditeur doit pouvoir voir POURQUOI son pilote est condensé,
// sinon un parcours qui change de forme d'une mission à l'autre ressemble à un
// bug.
//
// Traçabilité : E24 (validation obligatoire de chaque étape), E23 (novice
// < 30 min), E6 (hors ligne total).
// =============================================================================
import { type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Badge, Bouton, Message, ZoneEtat, type EtatZone } from '@axion/ui';
import { construirePilote, type MesureMission, type PiloteMission } from '../../agenda/pilote.js';
import { useTerrain } from '../../app/contexte.js';
import { contexteLocal } from '../../local/contexte.js';
import { lireMissionsLocales } from '../../session/missions.js';
import './journee.css';

interface VuePilote {
  readonly titre: string;
  readonly pilote: PiloteMission;
}

/**
 * Mesure la mission sur les données LOCALES.
 *
 * Les trois compteurs se lisent sur l'en-tête d'index en clair (`LOT_L5.md`
 * §3.2) : aucun déchiffrement, donc un écran instantané même sur une mission
 * chargée.
 */
async function mesurer(missionId: string, auditLevel: string): Promise<MesureMission> {
  const { base } = contexteLocal();
  const [unites, entretiens, questions] = await Promise.all([
    base.orgUnits
      .where('missionId')
      .equals(missionId)
      .filter((ligne) => ligne.supprimeLe === null && ligne.status !== 'fusionnee')
      .count(),
    base.interviews
      .where('missionId')
      .equals(missionId)
      .filter((ligne) => ligne.supprimeLe === null)
      .count(),
    base.missionQuestions
      .where('missionId')
      .equals(missionId)
      .filter((ligne) => ligne.supprimeLe === null)
      .count(),
  ]);
  return { auditLevel, unites, entretiens, questions };
}

export function EcranPilote(): ReactNode {
  const { base, naviguer } = useTerrain();

  const vues = useLiveQuery(
    async (): Promise<readonly VuePilote[] | null | undefined> => {
      if (base === null) return undefined;
      try {
        const missions = await lireMissionsLocales();
        return await Promise.all(
          missions.map(async (mission) => ({
            titre: mission.titre,
            // Les validations HUMAINES descendent du siège (`step_validations`)
            // et ne sont pas encore dans le schéma local : la liste est vide
            // aujourd'hui, et `construirePilote` la traite déjà comme prévalant
            // sur l'automatisme. Le jour où L6b les descend, il n'y a qu'un
            // argument à remplir. Point remonté au rapport.
            pilote: construirePilote(await mesurer(mission.id, mission.auditLevel), []),
          })),
        );
      } catch {
        return null;
      }
    },
    [base],
    undefined,
  );

  const etat: EtatZone =
    vues === undefined
      ? { nature: 'chargement', libelle: 'Lecture de l’avancement', lignes: 6 }
      : vues === null
        ? {
            nature: 'erreur',
            titre: 'L’avancement n’a pas pu être lu',
            cause: 'Les données locales de cet appareil n’ont pas pu être ouvertes.',
            action: 'Rechargez la page, puis rouvrez cet écran.',
          }
        : vues.length === 0
          ? {
              nature: 'vide',
              titre: 'Aucune mission sur cet appareil',
              description:
                'Embarquez une mission depuis l’accueil pour voir où elle en est. Le pilote se calcule sans réseau.',
            }
          : { nature: 'nominal' };

  return (
    <section className="axn-pile">
      <h1>Où en est la mission</h1>

      <ZoneEtat etat={etat}>
        <>
          {(vues ?? []).map((vue) => (
            <div key={vue.titre} className="axn-journee__carte">
              <div className="axn-journee__entete-carte">
                <h2 className="axn-journee__titre-carte">{vue.titre}</h2>
                {vue.pilote.express ? (
                  <Badge ton="info">Parcours condensé</Badge>
                ) : (
                  <Badge ton="neutre">Parcours complet</Badge>
                )}
              </div>

              {vue.pilote.express ? (
                <Message ton="info" titre="Parcours condensé">
                  Cette mission tient en {vue.pilote.etapesVisibles.length} étapes : structure
                  mono-unité et diagnostic de cadrage. Les étapes déjà satisfaites ont été validées
                  automatiquement.
                </Message>
              ) : (
                vue.pilote.motifGuideIntegral !== null && (
                  <Message ton="info" titre="Parcours guidé complet">
                    {vue.pilote.motifGuideIntegral}
                  </Message>
                )
              )}

              <ol className="axn-journee__pilote">
                {vue.pilote.etapesVisibles.map((etape) => (
                  <li key={etape.code} className="axn-journee__etape">
                    {etape.validee ? (
                      <Badge ton="succes">
                        {etape.origine === 'automatique_express' ? 'Validée d’office' : 'Validée'}
                      </Badge>
                    ) : (
                      <Badge ton="avertissement">À faire</Badge>
                    )}
                    <div>
                      <span className="axn-journee__etape-libelle">{etape.libelle}</span>
                      {etape.manques.length > 0 && (
                        <ul className="axn-journee__manques">
                          {etape.manques.map((manque) => (
                            <li key={manque}>{manque}</li>
                          ))}
                        </ul>
                      )}
                      {/* §17.2 : « cliquer sur un item incomplet amène directement
                          à l'écran qui le résout ». Seule l'étape Collecte a un
                          écran ICI ; les autres se résolvent au siège, et l'écran
                          le dit plutôt que d'offrir un bouton qui ne mène nulle
                          part. */}
                      {!etape.validee && etape.code === 'collecte' && (
                        <div className="axn-journee__actions">
                          <Bouton
                            variante="secondaire"
                            onClick={() => {
                              naviguer({ type: 'aller', vue: 'agenda' });
                            }}
                          >
                            Planifier une session
                          </Bouton>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </>
      </ZoneEtat>
    </section>
  );
}
