// =============================================================================
// PAGE `/design` — LA RÉFÉRENCE DE RECETTE VISUELLE (03 §19.2, §33.1, §33.5)
//
// ── LA PHRASE QU'ELLE HONORE, ET DEPUIS QUAND ELLE ATTENDAIT ───────────────
// §33.5 énumère les composants et se termine par : « Chacun : états complets
// (§19.2) + exemple sur /design ». §19.2 dit ce qu'est cette page : « une page
// “/design” interne (storybook léger) montre tous les composants — c'est la
// référence de recette visuelle ». Elle n'existait nulle part : réserve NB-2 du
// contrôle d'acceptation A02 du 2026-09-06, M6 de la recette novice, et le
// dernier point non matériel de la grille UX §33 avant que la porte P-C se
// rejoue.
//
// ── POURQUOI DANS LA CONSOLE ET NON DANS LA PWA TERRAIN ────────────────────
// Le pack ne tranche pas ; l'arbitrage est tracé dans `DECISIONS.md`
// (2026-09-07, A01 sur délégation). Deux motifs : le paquet terrain est
// PRÉCACHÉ par le service worker et vit sous contrainte de quota (05 §31) — y
// embarquer une galerie coûterait du stockage pour zéro valeur en mission, et
// l'invariant 6 dit que le terrain collecte ; et §33.4 pose la console en
// desktop-first, là où un relecteur ou un designer va regarder.
//
// ── CE QUE CETTE PAGE MONTRE, ET CE QU'ELLE NE MONTRE PAS ──────────────────
// Elle montre les états qu'on OUBLIE : le désactivé avec son motif, l'erreur, le
// vide, le chargement, le hors ligne. Une galerie qui n'aurait que le nominal ne
// vaudrait pas d'être écrite — c'est le type `ListeDeDeux` qui l'interdit.
// Elle montre aussi ses TROUS : les cinq composants que §33.5 nomme et que le
// paquet ne livre pas, chacun avec son motif. Une galerie qui tait ses trous est
// une galerie qui ment.
//
// Elle ne montre PAS : l'anneau de focus (il se vérifie à la tabulation, et la
// page le dit), le rendu hors ligne de la police (mesuré par `e2e/polices.e2e.ts`
// et par un chargement en mode avion), le mode sombre (V2, assumé).
//
// ── AUCUNE DONNÉE, AUCUN APPEL RÉSEAU ──────────────────────────────────────
// La page est entièrement statique : aucun `fetch`, donc aucun 401, donc elle
// reste lisible même quand la session est absente. C'est voulu — une référence
// de recette visuelle qu'il faut authentifier pour regarder n'est pas consultée.
// Invariant 2 : rien ici ne nomme un client ; les exemples sont génériques.
//
// Traçabilité : E27 (design moderne, charte, WCAG AA), E44 (UX/UI 2026-2027 —
// tokens, police locale), E22 (console de pilotage 7 espaces).
// =============================================================================
import { type ReactNode } from 'react';
import {
  absencesDe33_5,
  nomSpecDe,
  TOKENS_COULEUR,
  TOKENS_ESPACEMENT,
  TOKENS_MOUVEMENT,
  TOKENS_OMBRE,
  TOKENS_TAILLE,
  TOKENS_TYPOGRAPHIE,
  type NomComposantUI,
} from '@axion/ui';
import { CATALOGUE, fichesDe, NOMS_CATALOGUE, ORDRE_FAMILLES } from './catalogue.js';
import { BandeIcones } from './fiches-icones.js';
import { ETATS_DEMO, FAMILLES, type CleFamille, type FicheComposant } from './types.js';
import './design.css';

/** Identifiant d'ancre d'une famille — les liens du sommaire s'y rendent. */
function ancreFamille(famille: CleFamille): string {
  return `design-famille-${famille}`;
}

/** Identifiant d'ancre d'un composant. */
function ancreComposant(nom: NomComposantUI): string {
  return `design-composant-${nom}`;
}

// -----------------------------------------------------------------------------
// 1. Les fondations chiffrées (§33.1) — « en tokens, montrés sur /design »
// -----------------------------------------------------------------------------

function Couleurs(): ReactNode {
  const jetons = Object.keys(TOKENS_COULEUR) as (keyof typeof TOKENS_COULEUR)[];
  return (
    <ul className="axn-design__jetons" aria-label="Jetons de couleur">
      {jetons.map((jeton) => (
        <li key={jeton} className="axn-design__jeton">
          <span
            className="axn-design__pastille"
            style={{ background: `var(--couleur-${jeton})` }}
            aria-hidden="true"
          />
          <span className="axn-design__jeton-nom">
            <code>--couleur-{jeton}</code>
            <small>{TOKENS_COULEUR[jeton]}</small>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Espacements(): ReactNode {
  const jetons = Object.keys(TOKENS_ESPACEMENT) as (keyof typeof TOKENS_ESPACEMENT)[];
  return (
    <ul className="axn-design__echelle" aria-label="Échelle d’espacement">
      {jetons.map((jeton) => (
        <li key={jeton}>
          <code>--espacement-{jeton}</code>
          <span
            className="axn-design__barre"
            style={{ width: `var(--espacement-${jeton})` }}
            aria-hidden="true"
          />
          <small>{TOKENS_ESPACEMENT[jeton]}</small>
        </li>
      ))}
    </ul>
  );
}

/** Les sept crans de §33.1 : 12 / 14 / 16 (corps) / 18 / 22 / 28 / 36 px. */
const CRANS_TYPO = [
  'taille-xs',
  'taille-sm',
  'taille-base',
  'taille-lg',
  'taille-xl',
  'taille-2xl',
  'taille-3xl',
] as const;

function Typographie(): ReactNode {
  return (
    <ul className="axn-design__typo" aria-label="Échelle typographique">
      {CRANS_TYPO.map((cran) => (
        <li key={cran}>
          <span style={{ fontSize: `var(--typo-${cran})` }}>Audit et cotation</span>
          <small>
            <code>--typo-{cran}</code> · {TOKENS_TYPOGRAPHIE[cran]}
          </small>
        </li>
      ))}
    </ul>
  );
}

function TableauJetons({
  titre,
  jetons,
}: {
  titre: string;
  jetons: Readonly<Record<string, string>>;
}): ReactNode {
  return (
    <table className="axn-design__table">
      <caption>{titre}</caption>
      <thead>
        <tr>
          <th scope="col">Jeton</th>
          <th scope="col">Valeur</th>
        </tr>
      </thead>
      <tbody>
        {Object.keys(jetons).map((jeton) => (
          <tr key={jeton}>
            <td>
              <code>{jeton}</code>
            </td>
            <td>{jetons[jeton]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Fondations(): ReactNode {
  return (
    <section className="axn-design__section" aria-labelledby="design-fondations">
      <h2 id="design-fondations">Fondations chiffrées (§33.1)</h2>
      <p>
        Toute valeur visuelle du dépôt vient d’ici, et de nulle part ailleurs (invariant 4). Les
        quatre couleurs de la charte n’apparaissent en clair qu’une seule fois, dans{' '}
        <code>packages/ui/src/tokens.ts</code> ; un garde-fou de CI refuse un hexadécimal écrit
        ailleurs, y compris dans un commentaire.
      </p>
      <p className="axn-design__appui">
        <strong>L’alerte est un rouge DISTINCT de l’action.</strong> Le terracotta{' '}
        <code>--couleur-action-fond</code> ({TOKENS_COULEUR['action-fond']}) et le carmin{' '}
        <code>--couleur-alerte-bordure</code> ({TOKENS_COULEUR['alerte-bordure']}) sont séparés de
        35,8° de teinte et de 1,94 de contraste mutuel — deux axes, parce que la teinte seule ne
        suffit pas à un protanope et la luminance seule ne distingue pas deux rouges. Les deux
        pastilles se comparent ci-dessous, côte à côte.
      </p>
      <p className="axn-design__duo">
        <span className="axn-design__duo-item">
          <span
            className="axn-design__pastille"
            style={{ background: 'var(--couleur-action-fond)' }}
            aria-hidden="true"
          />
          Action — terracotta
        </span>
        <span className="axn-design__duo-item">
          <span
            className="axn-design__pastille"
            style={{ background: 'var(--couleur-alerte-bordure)' }}
            aria-hidden="true"
          />
          Alerte — carmin
        </span>
      </p>

      <h3>Couleurs sémantiques</h3>
      <p>
        Le code applicatif ne dit jamais « terracotta » : il dit « action ». Les cinq crans neutres
        dérivés du mocha (texte principal, secondaire, tertiaire, bordures, fonds de zone) sont dans
        cette liste, comme §33.1 le demande.
      </p>
      <Couleurs />

      <h3>Espacement — échelle de 4 px</h3>
      <Espacements />

      <h3>Typographie — Inter variable, auto-hébergée</h3>
      <p>
        Sept crans, interlignage 1,5 au corps et 1,25 aux titres, chiffres tabulaires partout où des
        nombres s’alignent. La police est servie par le dépôt, <strong>jamais par un CDN</strong> :
        la PWA doit rendre son texte en mode avion. Cette page ne le prouve pas — le contrôle vit
        dans <code>e2e/polices.e2e.ts</code>, qui compare la largeur peinte d’un texte hors coquille
        à celle du même texte forcé en police système.
      </p>
      <Typographie />

      <h3>Tailles, rayons, plans</h3>
      <p>
        <code>--taille-cible-tactile-min</code> vaut {TOKENS_TAILLE['cible-tactile-min']} : c’est le
        plancher d’A27, pas un confort. Les contrôles frappés debout (Oui/Non/N-A, crans 1-5)
        montent à {TOKENS_TAILLE['controle-hauteur-large']}.
      </p>
      <TableauJetons titre="Tailles et rayons" jetons={TOKENS_TAILLE} />
      <TableauJetons
        titre="Mouvement — 2 durées, respect de prefers-reduced-motion"
        jetons={TOKENS_MOUVEMENT}
      />
      <TableauJetons titre="Ombres — 2 niveaux au maximum (§33.1)" jetons={TOKENS_OMBRE} />
    </section>
  );
}

// -----------------------------------------------------------------------------
// 2. La galerie — une fiche par composant exporté, plusieurs états chacune
// -----------------------------------------------------------------------------

function Etiquette({ etat }: { etat: keyof typeof ETATS_DEMO }): ReactNode {
  return (
    <span className={`axn-design__etiquette axn-design__etiquette--${etat}`}>
      {ETATS_DEMO[etat]}
    </span>
  );
}

function Fiche({ nom, fiche }: { nom: NomComposantUI; fiche: FicheComposant }): ReactNode {
  const nomSpec = nomSpecDe(nom);
  return (
    <article
      className="axn-design__fiche"
      id={ancreComposant(nom)}
      aria-labelledby={`${ancreComposant(nom)}-titre`}
    >
      <header className="axn-design__fiche-entete">
        <h3 id={`${ancreComposant(nom)}-titre`}>
          <code>{nom}</code>
        </h3>
        <p className="axn-design__role">{fiche.role}</p>
        {nomSpec === null ? (
          <p className="axn-design__origine">
            <strong>Hors énumération §33.5.</strong>{' '}
            {fiche.origine.source === 'hors-33.5' ? fiche.origine.justification : ''}{' '}
            {fiche.origine.source === 'hors-33.5' ? <em>{fiche.origine.renvoi}</em> : null}
          </p>
        ) : (
          <p className="axn-design__origine">
            §33.5 le nomme <code lang="en">{nomSpec}</code>.
          </p>
        )}
      </header>
      <ul className="axn-design__vignettes">
        {fiche.demonstrations.map((demonstration) => {
          const { Apercu } = demonstration;
          return (
            <li key={demonstration.intitule} className="axn-design__vignette">
              <div className="axn-design__vignette-entete">
                <Etiquette etat={demonstration.etat} />
                <h4>{demonstration.intitule}</h4>
              </div>
              <p className="axn-design__propos">{demonstration.propos}</p>
              <div className="axn-design__apercu">
                <Apercu />
              </div>
            </li>
          );
        })}
      </ul>
    </article>
  );
}

function Famille({ famille }: { famille: CleFamille }): ReactNode {
  const fiches = fichesDe(famille);
  const { titre, propos } = FAMILLES[famille];
  return (
    <section
      className="axn-design__section"
      id={ancreFamille(famille)}
      aria-labelledby={`${ancreFamille(famille)}-titre`}
    >
      <h2 id={`${ancreFamille(famille)}-titre`}>
        {titre} <small>({fiches.length})</small>
      </h2>
      <p>{propos}</p>
      {famille === 'icones' ? <BandeIcones /> : null}
      {fiches.map(([nom, fiche]) => (
        <Fiche key={nom} nom={nom} fiche={fiche} />
      ))}
    </section>
  );
}

// -----------------------------------------------------------------------------
// 3. Les trous — ce que §33.5 demande et que le paquet ne livre pas
// -----------------------------------------------------------------------------

function Absences(): ReactNode {
  const absences = absencesDe33_5();
  return (
    <section className="axn-design__section" aria-labelledby="design-absences">
      <h2 id="design-absences">Ce que §33.5 nomme et qui n’existe pas ({absences.length})</h2>
      <p>
        Ces composants sont énumérés par le pack et ne sont pas dans le paquet. Chacune de ces
        absences est <strong>délibérée et déclarée</strong> — le motif vit dans{' '}
        <code>packages/ui/src/inventaire.ts</code>, où le type refuse une absence sans motif. Les
        construire pendant le lot terrain en aurait fait du code orphelin, que l’étape 6 du pipeline
        refuse à juste titre.
      </p>
      <table className="axn-design__table">
        <caption>Absences déclarées de l’inventaire §33.5</caption>
        <thead>
          <tr>
            <th scope="col">Nom cité par §33.5</th>
            <th scope="col">Famille</th>
            <th scope="col">Motif</th>
            <th scope="col">Attendu</th>
          </tr>
        </thead>
        <tbody>
          {absences.map((absence) => (
            <tr key={absence.nom}>
              <th scope="row">
                <code lang="en">{absence.nom}</code>
              </th>
              <td>{absence.famille === 'base' ? 'Socle shadcn' : 'Métier'}</td>
              <td>{absence.motif}</td>
              <td>{absence.ou}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// -----------------------------------------------------------------------------
// 4. Ce que la page ne prouve pas — dit ici plutôt que découvert en recette
// -----------------------------------------------------------------------------

function Limites(): ReactNode {
  return (
    <section className="axn-design__section" aria-labelledby="design-limites">
      <h2 id="design-limites">Ce que cette page ne prouve pas</h2>
      <p>
        Une galerie honnête sur sa portée vaut mieux qu’une galerie qui rassure. Quatre points de la
        grille §33 ne se vérifient pas en la regardant :
      </p>
      <ul className="axn-design__limites">
        <li>
          <strong>L’anneau de focus.</strong> Il n’a pas d’aperçu : il se vérifie à la tabulation.
          Parcourez cette page avec la touche Tab — chaque contrôle doit recevoir un anneau visible
          de {TOKENS_TAILLE['focus-epaisseur']}, sans exception, y compris les vignettes de la
          galerie.
        </li>
        <li>
          <strong>La police rendue hors ligne.</strong> Le rendu ici prouve que la police est
          appliquée, pas qu’elle est locale. La preuve est un chargement en mode avion, et le test
          <code> e2e/polices.e2e.ts</code>, qui compare la largeur peinte d’un texte greffé hors
          coquille à celle du même texte forcé en police système.
        </li>
        <li>
          <strong>Le contraste réel.</strong> Sous un moteur de rendu, axe-core mesure les
          combinaisons peintes ; ce que cette page montre, ce sont les jetons. Les deux mesures
          vivent dans <code>packages/ui/src/contraste-usages.test.ts</code> et dans le balayage
          axe-core de la console.
        </li>
        <li>
          <strong>Le mode sombre.</strong> Il n’existe pas, et c’est une décision : l’ivoire EST
          l’identité, et l’audit se mène de jour en entreprise (§19.2, confirmé par §33.1). V2.
        </li>
      </ul>
    </section>
  );
}

// -----------------------------------------------------------------------------
// L'écran
// -----------------------------------------------------------------------------

export function EcranDesign(): ReactNode {
  return (
    <div className="axn-design">
      <h1>Design system — référence de recette visuelle</h1>
      <p className="axn-design__chapeau">
        Page interne. Elle montre les {NOMS_CATALOGUE.length} composants de <code>@axion/ui</code>{' '}
        avec leurs états — <strong>y compris ceux qu’on oublie</strong> —, les jetons qui portent
        l’invariant 4, et les composants que §33.5 nomme sans qu’ils existent. Elle sert de
        référence de recette aux portes P-C et P-E.
      </p>
      <p className="axn-design__chapeau">
        La galerie <strong>ne peut pas oublier un composant</strong> : sa table est confrontée aux
        exports réels du paquet par{' '}
        <code>satisfies Record&lt;NomComposantUI, FicheComposant&gt;</code> (
        <code>apps/hq/src/ecrans/design/catalogue.ts</code>). Un composant exporté et absent d’ici
        fait échouer <code>pnpm typecheck</code>, avant qu’aucun test ne tourne.
      </p>

      <nav className="axn-design__sommaire" aria-label="Sommaire de la page">
        <ul>
          <li>
            <a href="#design-fondations">Fondations chiffrées</a>
          </li>
          {ORDRE_FAMILLES.map((famille) => (
            <li key={famille}>
              <a href={`#${ancreFamille(famille)}`}>{FAMILLES[famille].titre}</a>
            </li>
          ))}
          <li>
            <a href="#design-absences">Ce qui n’existe pas</a>
          </li>
          <li>
            <a href="#design-limites">Ce que la page ne prouve pas</a>
          </li>
        </ul>
      </nav>

      <Fondations />
      {ORDRE_FAMILLES.map((famille) => (
        <Famille key={famille} famille={famille} />
      ))}
      <Absences />
      <Limites />
    </div>
  );
}

/** Réexporté pour les tests : le catalogue est la source, la page n'en est qu'une vue. */
export { CATALOGUE };
