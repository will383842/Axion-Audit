// =============================================================================
// `PanneauNotes` EST RENDU DEUX FOIS — SES IDENTIFIANTS DOIVENT ÊTRE UNIQUES
//
// Relevé par A22 en fermant M1, corrigé le 2026-09-06 : les trois titres de
// section portaient des `id` CONSTANTS (`axn-notes-question`, `-general`,
// `-volantes`), désignés par `aria-labelledby`.
//
// ── POURQUOI CE N'EST PAS THÉORIQUE ────────────────────────────────────────
// `EcranEntretien` monte ce panneau à DEUX endroits : la colonne droite
// (`<aside>`, rendue en permanence tant que l'écran n'est pas partagé) et le
// panneau d'écran étroit (`<Panneau>`, qui se monte à l'ouverture). Sur un
// écran LARGE, les deux conditions sont vraies en même temps dès que
// l'auditeur ouvre les notes : les trois `id` existent alors en double dans le
// document, et chaque `aria-labelledby` en désigne un au hasard.
//
// C'est `duplicate-id-aria`, une violation WCAG. Le balayage axe ne la voyait
// pas : il n'ouvre pas ce panneau-là à cette largeur-là. Un test qui rend
// simplement DEUX instances la voit, lui, en dix millisecondes — et c'est tout
// l'intérêt de le poser ici plutôt que d'attendre un navigateur.
//
// ── CE QUE CE TEST NE FAIT PAS ─────────────────────────────────────────────
// Il ne nomme aucun identifiant. Nommer `axn-notes-question` le ferait passer
// le jour où quelqu'un renomme la constante en gardant le défaut. Il compte
// les `id` du document et exige qu'aucun ne se répète : la propriété, pas sa
// forme du jour.
//
// Traçabilité : E44 (UX/UI 2026-2027, tokens et police locale — la grille §33), E13 (écran 3 zones).
// =============================================================================
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PanneauNotes } from './PanneauNotes.js';

function panneau(cle: string): React.ReactElement {
  return (
    <PanneauNotes
      key={cle}
      cleNoteDeQuestion={`${cle}-q`}
      noteDeQuestion=""
      onNoteDeQuestion={() => undefined}
      ecriturePossible={false}
      motifLectureSeule="Démarrez l’entretien pour écrire."
      cleBlocNotes={`${cle}-s`}
      notesGenerales=""
      onNotesGenerales={() => undefined}
      notesVolantes={[]}
      onCapturerNoteVolante={() => Promise.resolve(true)}
      reponseCouranteId={null}
      onRattacher={() => undefined}
      onDetacher={() => undefined}
      onSupprimer={() => undefined}
      fuseau="Europe/Paris"
    />
  );
}

describe('PanneauNotes — deux instances simultanées', () => {
  it('@critique aucun identifiant du document n’est porté deux fois', () => {
    // La colonne droite ET le panneau, comme sur un iPad en paysage dont
    // l'auditeur vient d'ouvrir les notes.
    const { container } = render(
      <div>
        {panneau('laterale')}
        {panneau('panneau')}
      </div>,
    );

    const identifiants = Array.from(container.querySelectorAll('[id]')).map((n) => n.id);
    const doublons = identifiants.filter((id, rang) => identifiants.indexOf(id) !== rang);

    expect(
      Array.from(new Set(doublons)),
      'Deux nœuds portent le même `id` alors que le panneau est monté deux fois.\n' +
        'Un `aria-labelledby` ou un `aria-describedby` désigne alors le mauvais nœud,\n' +
        'et axe le refuse (`duplicate-id-aria`). Dérive-les de `useId()`, jamais\n' +
        'd’une constante de module.',
    ).toEqual([]);

    // ANTI-VACUITÉ : si le panneau ne rendait aucun `id`, le cas ci-dessus
    // passerait sans rien mesurer. Les deux instances en portent, et en nombre.
    expect(identifiants.length).toBeGreaterThanOrEqual(6);
  });

  it('les deux instances rendent bien le MÊME nombre d’identifiants', () => {
    // Un écart signalerait que l'une des deux ne s'est pas montée entièrement —
    // auquel cas l'absence de doublon ci-dessus ne prouverait rien.
    const seule = render(<div>{panneau('seule')}</div>);
    const nSeule = seule.container.querySelectorAll('[id]').length;
    seule.unmount();

    const deux = render(
      <div>
        {panneau('a')}
        {panneau('b')}
      </div>,
    );
    expect(deux.container.querySelectorAll('[id]').length).toBe(nSeule * 2);
  });
});
