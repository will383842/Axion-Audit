// =============================================================================
// L'ÉCRAN DE SYNCHRONISATION — la file de cet appareil, lue dans le LOCAL (L6b)
//
// 05 §9.3 : « à examiner » visible, jamais de suppression silencieuse ; « n
// réponse(s) arbitrée(s) », cliquable. 05 §9.9 : une op rejetée est montrée avec
// son motif, et n'offre AUCUN geste de relance. 03 §33.2 : les quatre états.
// `LOT_L6.md` §3ter C.2 : au plus UN role="alert" (l'erreur de lecture), le reste
// en role="status" ; tokens du design system seulement ; aucun réseau.
//
// L'écran ne calcule rien : il rend `lireFileSync` (`sync/file-locale.ts`) et
// délègue le seul geste — « Remettre en file » — au port de sync. Il ne peint pas
// de <h1> : la coquille le fait (`app/vues.ts`) ; ses sections sont des <h2>.
//
// Traçabilité : E7, E38, E44 ; invariants 4, 5, 7, 8.
// =============================================================================
import { useCallback, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bouton, Message, RappelHorsLigne, ZoneEtat, type EtatZone } from '@axion/ui';
import {
  CAPACITES_HORS_LIGNE,
  PASTILLE_PORTEE_PAR_LA_COQUILLE,
} from '../../app/capacites-hors-ligne.js';
import { useTerrain } from '../../app/contexte.js';
import { portSyncDeLaBase } from '../../app/port-sync-terrain.js';
import { contexteLocal } from '../../local/contexte.js';
import { useEnLigne } from '../../session/media.js';
import { lireFileSync, type FileSync, type OpBloquee } from '../../sync/file-locale.js';

function pluriel(n: number, singulier: string, plurielForme: string): string {
  return `${String(n)} ${n > 1 ? plurielForme : singulier}`;
}

function LigneOp({ op, geste }: { readonly op: OpBloquee; readonly geste?: ReactNode }): ReactNode {
  return (
    <li className="axn-journee__carte">
      <p className="axn-coquille__mention">{`Mission : ${op.missionTitre}`}</p>
      <p>{op.motif}</p>
      {geste !== undefined && <div className="axn-journee__actions">{geste}</div>}
    </li>
  );
}

export function EcranSynchronisation(): ReactNode {
  const { base } = useTerrain();
  const enLigne = useEnLigne();
  const [detailArbitrages, setDetailArbitrages] = useState(false);
  const [enCours, setEnCours] = useState<ReadonlySet<string>>(new Set());

  // `undefined` = lecture en cours ; `null` = la lecture locale a ÉCHOUÉ.
  const file = useLiveQuery(
    async (): Promise<FileSync | null | undefined> => {
      if (base === null) return undefined;
      try {
        return await lireFileSync(base, contexteLocal().coffre);
      } catch {
        // La cause technique n'est pas affichée (11 §2) : l'écran dit la cause
        // métier et l'action.
        return null;
      }
    },
    [base],
    undefined,
  );

  const remettre = useCallback(
    (op: OpBloquee): void => {
      if (base === null) return;
      setEnCours((avant) => new Set(avant).add(op.opId));
      void portSyncDeLaBase(base)
        .remettreEnFile(op.missionId, [op.opId])
        .catch(() => undefined)
        .finally(() => {
          setEnCours((avant) => {
            const apres = new Set(avant);
            apres.delete(op.opId);
            return apres;
          });
        });
    },
    [base],
  );

  const vide =
    file?.enAttente === 0 &&
    file.aExaminer.length === 0 &&
    file.rejetees.length === 0 &&
    file.arbitrees === 0;

  const etat: EtatZone =
    file === undefined
      ? { nature: 'chargement', libelle: 'Lecture de la file de synchronisation', lignes: 3 }
      : file === null
        ? {
            nature: 'erreur',
            titre: 'La file de synchronisation n’a pas pu être lue',
            cause: 'Les données locales de cet appareil n’ont pas pu être ouvertes.',
            action:
              'Rechargez la page. Si le problème persiste, exportez une sauvegarde de secours avant toute autre manipulation.',
          }
        : vide
          ? {
              nature: 'vide',
              titre: 'Aucune opération en attente',
              description:
                'Toutes les saisies de cet appareil ont été acceptées par le siège. Les prochaines partiront d’elles-mêmes dès qu’il y aura du réseau.',
            }
          : { nature: 'nominal' };

  return (
    <section className="axn-pile">
      <ZoneEtat etat={etat}>
        {file != null && (
          <>
            <Message ton="info" titre="File de cet appareil">
              {file.enAttente === 0
                ? 'Aucune opération en attente d’envoi.'
                : `${pluriel(file.enAttente, 'opération en attente', 'opérations en attente')} d’envoi.`}
            </Message>

            {file.arbitrees > 0 && (
              <div className="axn-journee__carte">
                <Bouton
                  variante="secondaire"
                  aria-expanded={detailArbitrages}
                  onClick={() => {
                    setDetailArbitrages((ouvert) => !ouvert);
                  }}
                >
                  {pluriel(file.arbitrees, 'réponse arbitrée', 'réponses arbitrées')}
                </Bouton>
                {detailArbitrages && (
                  <p>
                    Le siège détenait une version plus récente de ces réponses : elle a été retenue,
                    et la vôtre a été archivée au siège. Rien n’est perdu ; la console permet de les
                    comparer.
                  </p>
                )}
              </div>
            )}

            <section className="axn-pile">
              <h2 className="axn-journee__titre-carte">À examiner</h2>
              {file.aExaminer.length === 0 ? (
                <p className="axn-coquille__mention">Aucune opération à examiner.</p>
              ) : (
                <ul className="axn-journee__liste">
                  {file.aExaminer.map((op) => (
                    <LigneOp
                      key={op.opId}
                      op={op}
                      geste={
                        <Bouton
                          variante="secondaire"
                          chargement={enCours.has(op.opId)}
                          onClick={() => {
                            remettre(op);
                          }}
                        >
                          Remettre en file
                        </Bouton>
                      }
                    />
                  ))}
                </ul>
              )}
            </section>

            <section className="axn-pile">
              <h2 className="axn-journee__titre-carte">Rejetées par le siège</h2>
              {file.rejetees.length === 0 ? (
                <p className="axn-coquille__mention">Aucune opération rejetée.</p>
              ) : (
                <ul className="axn-journee__liste">
                  {file.rejetees.map((op) => (
                    <LigneOp key={op.opId} op={op} />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </ZoneEtat>

      {/* §33.2 — ce qui reste faisable sans réseau ; se tait en ligne. */}
      <RappelHorsLigne
        enLigne={enLigne}
        capacites={CAPACITES_HORS_LIGNE.synchronisation}
        avecPastille={PASTILLE_PORTEE_PAR_LA_COQUILLE}
      />
    </section>
  );
}
