// =============================================================================
// TESTS DES DEUX GARDE-FOUS DE LA PILE COOLIFY
//   · scripts/check-isolation-reseau.mjs
//   · scripts/check-compose-coolify.mjs
//
// POURQUOI CE FICHIER EXISTE, ET POURQUOI IL EST ÉCRIT PAR QUELQU'UN D'AUTRE.
// 09 §5.6 : « le code de test n'est JAMAIS écrit par l'agent qui a écrit le code
// testé ». Ces deux scripts ont été réécrits par A12b puis éprouvés par le gardien
// A02 — deux contrôles précieux, mais aucun des deux n'est une revue croisée.
// Ce fichier est écrit par A17, réviseur croisé, qui n'a produit ni l'un ni l'autre.
//
// COMMENT ILS SONT ÉPROUVÉS. Chaque cas fabrique un DÉPÔT JETABLE dans un dossier
// temporaire — `<bac>/scripts/<le script copié>` et `<bac>/infra/docker-compose.coolify.yml`
// — puis exécute le script tel quel. Les deux scripts calculent leur racine par
// `resolve(import.meta.dirname, '..')` : copié dans `<bac>/scripts/`, le script
// lit la fixture et résout ses chemins relatifs depuis `<bac>`. On teste donc le
// FICHIER LIVRÉ, sans le modifier, sans point d'injection, et sans jamais écrire
// dans `infra/`.
//
// CE QUE CHAQUE CAS AFFIRME. Un garde-fou ne se juge pas sur ce qu'il imprime mais
// sur son CODE DE SORTIE : chaque fixture fautive doit rendre EXIT=1, chaque
// écriture légitime EXIT=0. Les cinq formes d'évasion réseau connues y sont, plus
// les trois contournements que la revue croisée a mesurés le 2026-08-28.
//
// Traçabilité : invariant 3 · E17, E43 · 02 §30.4-4 · 09 §5.6.
// =============================================================================
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const RACINE_DEPOT = resolve(import.meta.dirname, '..');
const CHEMIN_COMPOSE = 'infra/docker-compose.coolify.yml';

const ISOLATION = 'check-isolation-reseau.mjs';
const COOLIFY = 'check-compose-coolify.mjs';
type Script = typeof ISOLATION | typeof COOLIFY;

interface Verdict {
  readonly code: number;
  readonly sortie: string;
}

const bacs: string[] = [];

// Les couleurs ANSI n'ont rien à faire dans une assertion. Le motif se construit à
// partir du code du caractère d'échappement : écrit en littéral, il déclencherait
// `no-control-regex`, et le désactiver pour un test serait exactement le genre de
// contournement que ce dépôt refuse ailleurs.
const CODES_ANSI = new RegExp(`${String.fromCharCode(27)}\\[\\d+m`, 'g');

/** Un dépôt jetable contenant le script copié, et rien d'autre par défaut. */
function creerBac(script: Script): string {
  const bac = mkdtempSync(join(tmpdir(), 'axion-garde-fous-'));
  bacs.push(bac);
  mkdirSync(join(bac, 'scripts'), { recursive: true });
  copyFileSync(join(RACINE_DEPOT, 'scripts', script), join(bac, 'scripts', script));
  return bac;
}

function executer(bac: string, script: Script): Verdict {
  const resultat = spawnSync(process.execPath, [join(bac, 'scripts', script)], {
    encoding: 'utf8',
  });
  const sortie = `${resultat.stdout}${resultat.stderr}`.replaceAll(CODES_ANSI, '');
  return { code: resultat.status ?? -1, sortie };
}

/**
 * Exécute `script` sur `compose`. `fichiers` crée, dans le dépôt jetable, les
 * chemins que la fixture prétend monter ou construire (contenu sans importance :
 * seule leur EXISTENCE est vérifiée par le contrôle des chemins relatifs).
 */
function garnir(bac: string, compose: string, fichiers: readonly string[]): void {
  const cibleCompose = join(bac, CHEMIN_COMPOSE);
  mkdirSync(dirname(cibleCompose), { recursive: true });
  writeFileSync(cibleCompose, compose, 'utf8');
  for (const relatif of fichiers) {
    const cible = join(bac, relatif);
    mkdirSync(dirname(cible), { recursive: true });
    writeFileSync(cible, '# fixture de test\n', 'utf8');
  }
}

function lancer(script: Script, compose: string, fichiers: readonly string[] = []): Verdict {
  const bac = creerBac(script);
  garnir(bac, compose, fichiers);
  return executer(bac, script);
}

/**
 * Exécute une VERSION MUTÉE du script livré sur une fixture SAINE.
 *
 * POURQUOI CE SECOND MODE D'ÉPREUVE. Tous les cas ci-dessus fabriquent un fichier
 * FAUTIF et vérifient que le script le refuse. Ils prouvent que le script sait
 * dire non — ils ne prouvent RIEN sur ce qu'il a réellement regardé pour dire oui.
 * La revue adverse du 2026-08-28 l'a démontré en une commande : forcer
 * `attachementsInspectes += 1` à `+= 0` laissait le script annoncer
 * « 0 attachement(s) inspecté(s) sur 11 service(s) ; seul « caddy » rejoint un
 * réseau hors de la pile » et sortir en 0 — les 45 cas de ce fichier restaient
 * verts, parce qu'ils n'assertaient que le CODE DE SORTIE.
 *
 * Muter le script et exiger qu'il MEURE est la seule façon d'attacher un test à un
 * compteur. `expect(source).toContain(avant)` garantit que la mutation MORD : le
 * jour où quelqu'un renomme la variable, ce test échoue au lieu de muter dans le
 * vide et de rester vert pour rien.
 */
function lancerMute(
  script: Script,
  compose: string,
  mutations: readonly (readonly [string, string])[],
  fichiers: readonly string[] = [],
): Verdict {
  const bac = mkdtempSync(join(tmpdir(), 'axion-garde-fous-'));
  bacs.push(bac);
  mkdirSync(join(bac, 'scripts'), { recursive: true });
  let source = readFileSync(join(RACINE_DEPOT, 'scripts', script), 'utf8');
  for (const [avant, apres] of mutations) {
    expect(source).toContain(avant);
    source = source.replaceAll(avant, apres);
  }
  writeFileSync(join(bac, 'scripts', script), source, 'utf8');
  garnir(bac, compose, fichiers);
  return executer(bac, script);
}

afterAll(() => {
  for (const bac of bacs) rmSync(bac, { recursive: true, force: true });
});

// =============================================================================
// FIXTURES — le témoin sain, puis chaque faute injectée UNE À LA FOIS
// =============================================================================

/**
 * Pile minimale conforme : `caddy` seul rejoint le réseau partagé, tout le reste
 * vit sur le réseau interne préfixé par le nom de projet. Chaque fixture fautive
 * ci-dessous est celle-ci PLUS une faute, et une seule.
 */
const SAIN_RESEAU = `name: axion-coolify
services:
  caddy:
    image: caddy:2
    networks:
      - axion
      - edge
  api:
    image: axion/api
    networks:
      - axion
  worker:
    image: axion/worker
    networks:
      - axion
networks:
  axion:
    name: axion-coolify-interne
  edge:
    name: coolify
    external: true
`;

/** Les mêmes réseaux, à recoller sous n'importe quelle liste de services. */
const RESEAUX_RESEAU = `networks:
  axion:
    name: axion-coolify-interne
  edge:
    name: coolify
    external: true
`;

function pileReseau(services: string): string {
  return `name: axion-coolify\nservices:\n${services}${RESEAUX_RESEAU}`;
}

const CADDY_LEGITIME = `  caddy:
    image: caddy:2
    networks:
      - axion
      - edge
`;

describe('check-isolation-reseau.mjs', () => {
  it('accepte la pile où seul caddy rejoint le réseau partagé', () => {
    const { code, sortie } = lancer(ISOLATION, SAIN_RESEAU);
    expect(sortie).toContain('isolation réseau');
    expect(code).toBe(0);
  });

  // --- LES CINQ FORMES D'ÉVASION -------------------------------------------

  it("ÉVASION 1 — refuse le réseau externe nommé `edge` attaché en séquence à l'API", () => {
    const compose = pileReseau(
      `${CADDY_LEGITIME}  api:
    image: axion/api
    networks:
      - axion
      - edge
`,
    );
    const { code, sortie } = lancer(ISOLATION, compose);
    expect(sortie).toContain('ISOLATION RÉSEAU ROMPUE');
    expect(sortie).toContain('api');
    expect(code).toBe(1);
  });

  it('ÉVASION 2 — refuse le MÊME réseau externe déclaré sous un AUTRE nom (`proxy`)', () => {
    // Le mot `edge` n'apparaît nulle part du côté de l'API : c'est tout l'intérêt.
    const compose = `name: axion-coolify
services:
${CADDY_LEGITIME}  api:
    image: axion/api
    networks:
      - axion
      - proxy
networks:
  axion:
    name: axion-coolify-interne
  edge:
    name: coolify
    external: true
  proxy:
    name: coolify
    external: true
`;
    const { code, sortie } = lancer(ISOLATION, compose);
    expect(sortie).toContain('ISOLATION RÉSEAU ROMPUE');
    expect(sortie).toContain('proxy');
    expect(code).toBe(1);
  });

  it('ÉVASION 3 — refuse `network_mode: "service:caddy"`, qui hérite de la pile réseau de caddy', () => {
    const compose = pileReseau(
      `${CADDY_LEGITIME}  worker:
    image: axion/worker
    network_mode: "service:caddy"
`,
    );
    const { code, sortie } = lancer(ISOLATION, compose);
    expect(sortie).toContain('ISOLATION RÉSEAU ROMPUE');
    expect(sortie).toContain('network_mode');
    expect(code).toBe(1);
  });

  it('ÉVASION 4 — refuse le réseau externe attaché en LISTE DE FLUX', () => {
    const compose = pileReseau(
      `${CADDY_LEGITIME}  api:
    image: axion/api
    networks: [axion, edge]
`,
    );
    const { code, sortie } = lancer(ISOLATION, compose);
    expect(sortie).toContain('ISOLATION RÉSEAU ROMPUE');
    expect(code).toBe(1);
  });

  it("ÉVASION 5 — refuse l'attachement injecté par une ANCRE fusionnée (`<<:`)", () => {
    const compose = `name: axion-coolify
x-commun: &commun
  networks:
    - axion
    - edge
services:
${CADDY_LEGITIME}  api:
    image: axion/api
    <<: *commun
${RESEAUX_RESEAU}`;
    const { code, sortie } = lancer(ISOLATION, compose);
    expect(sortie).toContain('ISOLATION RÉSEAU ROMPUE');
    expect(code).toBe(1);
  });

  // --- LES TROIS CONTOURNEMENTS MESURÉS À LA REVUE CROISÉE ------------------

  it('ÉVASION 5bis — refuse une ANCRE portant la liste EN FLUX (`networks: *ancre`)', () => {
    // Trou mesuré le 2026-08-28 : `enfantsEffectifs` suivait l'alias vers les
    // ENFANTS de l'ancre, jamais vers sa VALEUR. L'ancre n'ayant aucun enfant, le
    // service ressortait avec zéro réseau — donc sain, EXIT=0.
    const compose = `name: axion-coolify
x-reseaux: &reseaux [axion, edge]
services:
${CADDY_LEGITIME}  api:
    image: axion/api
    networks: *reseaux
${RESEAUX_RESEAU}`;
    const { code, sortie } = lancer(ISOLATION, compose);
    expect(sortie).toContain('ISOLATION RÉSEAU ROMPUE');
    expect(code).toBe(1);
  });

  it('refuse la clé `"networks":` ÉCRITE ENTRE GUILLEMETS', () => {
    // Trou mesuré le 2026-08-28 : le lecteur refusait toute clé commençant par un
    // guillemet, le service perdait sa clé `networks:` et passait pour « sans
    // réseau », donc sain — SANS QU'AUCUN COMPTEUR NE BOUGE.
    const compose = pileReseau(
      `${CADDY_LEGITIME}  api:
    image: axion/api
    "networks":
      - edge
`,
    );
    const { code, sortie } = lancer(ISOLATION, compose);
    expect(code).toBe(1);
    expect(sortie).toContain('ISOLATION RÉSEAU');
  });

  it('refuse un service entier écrit en MAPPING DE FLUX sur une ligne', () => {
    // Trou mesuré le 2026-08-28 : le service comptait pour un service, mais aucune
    // de ses clés n'était inspectée. Compteur inchangé, EXIT=0.
    const compose = pileReseau(
      `${CADDY_LEGITIME}  api: {image: axion/api, networks: [edge]}
`,
    );
    const { code, sortie } = lancer(ISOLATION, compose);
    expect(code).toBe(1);
    expect(sortie).toContain('ISOLATION RÉSEAU');
  });

  // --- LES AUTRES PROPRIÉTÉS GARDÉES ---------------------------------------

  it('refuse un réseau nommé HORS DU PRÉFIXE de projet, même sans `external: true`', () => {
    const compose = `name: axion-coolify
services:
${CADDY_LEGITIME}  api:
    image: axion/api
    networks: [voisin]
networks:
  axion:
    name: axion-coolify-interne
  edge:
    name: coolify
    external: true
  voisin:
    name: reseau-du-voisin
`;
    const { code, sortie } = lancer(ISOLATION, compose);
    expect(sortie).toContain('ISOLATION RÉSEAU ROMPUE');
    expect(code).toBe(1);
  });

  it('refuse un `default` redéfini en réseau externe, même sans clé `networks:` sur le service', () => {
    const compose = `name: axion-coolify
services:
${CADDY_LEGITIME}  api:
    image: axion/api
networks:
  default:
    name: coolify
    external: true
  axion:
    name: axion-coolify-interne
  edge:
    name: coolify
    external: true
`;
    const { code, sortie } = lancer(ISOLATION, compose);
    expect(sortie).toContain('ISOLATION RÉSEAU ROMPUE');
    expect(code).toBe(1);
  });

  it("refuse un réseau dont le `name:` n'est pas résoluble (variable sans défaut)", () => {
    const compose = `name: axion-coolify
services:
${CADDY_LEGITIME}  api:
    image: axion/api
    networks: [mystere]
networks:
  axion:
    name: axion-coolify-interne
  edge:
    name: coolify
    external: true
  mystere:
    name: \${RESEAU_INCONNU}
`;
    const { code } = lancer(ISOLATION, compose);
    expect(code).toBe(1);
  });

  it('refuse le fichier sans `name:` de projet, qui priverait le critère de nom de sa référence', () => {
    const compose = `services:
${CADDY_LEGITIME}  api:
    image: axion/api
    networks: [voisin]
networks:
  axion:
    name: axion-coolify-interne
  edge:
    name: coolify
    external: true
  voisin:
    name: reseau-du-voisin
`;
    const { code, sortie } = lancer(ISOLATION, compose);
    expect(sortie).toContain('aucun `name:` de projet');
    expect(code).toBe(1);
  });

  it('refuse une clé `networks:` qui ne produit aucun réseau — le lecteur a perdu le service', () => {
    const compose = pileReseau(
      `${CADDY_LEGITIME}  api:
    image: axion/api
    networks:
`,
    );
    const { code, sortie } = lancer(ISOLATION, compose);
    expect(sortie).toContain("n'a produit AUCUN réseau");
    expect(code).toBe(1);
  });

  it('accepte `networks: []`, seule écriture qui dise VRAIMENT « aucun réseau »', () => {
    const compose = pileReseau(
      `${CADDY_LEGITIME}  api:
    image: axion/api
    networks: []
`,
    );
    const { code } = lancer(ISOLATION, compose);
    expect(code).toBe(0);
  });

  it("ne s'applique pas — et le DIT — quand le fichier compose n'existe pas encore", () => {
    const bac = creerBac(ISOLATION);
    const { code, sortie } = executer(bac, ISOLATION);
    expect(sortie).toContain('NON APPLIQUÉ');
    expect(code).toBe(0);
  });
});

// =============================================================================
// POINT 21bis DU GARDIEN — ASSERTER LE COMPTEUR AU LIEU DE L'AFFICHER
// -----------------------------------------------------------------------------
// Le symptôme relevé : sur un fichier RÉINDENTÉ portant la faute, le script
// sortait en 0 en imprimant un compteur passé de 10 à 9. Son propre en-tête
// désignait « un compte qui s'effondre » comme LE symptôme à surveiller — puis se
// contentait de l'AFFICHER. Les deux scripts refusent désormais :
//   · une clé sœur mal indentée (le service devient une sous-clé de son voisin) ;
//   · une divergence entre l'arbre et le comptage direct des clés de `services:` ;
//   · une clé déclarée deux fois (ce lecteur garde la première, YAML la dernière).
// =============================================================================

/** La faute (`api` sur le réseau partagé) ET la réindentation qui l'escamotait. */
const REINDENTE_AVEC_FAUTE = `name: axion-coolify
services:
  caddy:
    image: caddy:2
    networks:
      - axion
      - edge
   api:
    image: axion/api
    networks:
      - axion
      - edge
${RESEAUX_RESEAU}`;

describe('cardinalité et lisibilité — les deux scripts', () => {
  const scripts: readonly Script[] = [ISOLATION, COOLIFY];

  for (const script of scripts) {
    it(`${script} échoue sur le fichier RÉINDENTÉ qui escamote un service`, () => {
      const { code, sortie } = lancer(script, REINDENTE_AVEC_FAUTE);
      expect(sortie).toContain('api');
      expect(sortie.toLowerCase()).toContain('indentée');
      expect(code).toBe(1);
    });

    it(`${script} échoue quand une clé est déclarée DEUX FOIS sous le même parent`, () => {
      const compose = pileReseau(
        `${CADDY_LEGITIME}  api:
    image: axion/api
    networks: [axion]
    networks: [axion, edge]
`,
      );
      const { code, sortie } = lancer(script, compose);
      expect(sortie).toContain('deux fois');
      expect(code).toBe(1);
    });

    it(`${script} échoue quand \`services:\` n'est pas comptable clé par clé`, () => {
      const compose = `name: axion-coolify
services: {caddy: {image: 'caddy:2', networks: [axion, edge]}}
${RESEAUX_RESEAU}`;
      const { code, sortie } = lancer(script, compose);
      expect(sortie).toContain('NE DISENT PAS LA MÊME CHOSE');
      expect(code).toBe(1);
    });

    it(`${script} refuse un service qui hérite d'un AUTRE fichier par \`extends:\``, () => {
      // Ce qui vient d'ailleurs est invisible à un contrôle qui ne lit qu'un fichier :
      // `extends:` suffisait à faire rejoindre le réseau du voisin sans un mot.
      const compose = pileReseau(
        `${CADDY_LEGITIME}  api:
    extends:
      file: docker-compose.yml
      service: api
`,
      );
      const { code, sortie } = lancer(script, compose);
      expect(sortie).toContain("importée d'un autre fichier");
      expect(code).toBe(1);
    });

    it(`${script} refuse un \`include:\` de premier niveau`, () => {
      const compose = `name: axion-coolify
include:
  - ./autre-pile.yml
services:
${CADDY_LEGITIME}${RESEAUX_RESEAU}`;
      const { code, sortie } = lancer(script, compose);
      expect(sortie).toContain("importée d'un autre fichier");
      expect(code).toBe(1);
    });

    it(`${script} échoue sur une ligne qu'il ne sait pas lire plutôt que de l'ignorer`, () => {
      // Un second document YAML : le lecteur n'en gère pas, et le taire reviendrait
      // à contrôler le premier en croyant contrôler le fichier.
      const { code, sortie } = lancer(script, `---\n${SAIN_RESEAU}`);
      expect(sortie).toContain('ne sait pas lire');
      expect(code).toBe(1);
    });
  }

  it('les deux scripts embarquent le MÊME lecteur, à l’octet près', () => {
    // La duplication est assumée par les deux en-têtes ; ce test la rend vraie.
    const DEBUT = '/** Retire un commentaire de fin de ligne';
    const FIN = '// LECTURE DU FICHIER';
    const lecteurDe = (script: Script): string => {
      const source = readFileSync(join(RACINE_DEPOT, 'scripts', script), 'utf8');
      const debut = source.indexOf(DEBUT);
      const fin = source.indexOf(FIN);
      expect(debut).toBeGreaterThan(0);
      expect(fin).toBeGreaterThan(debut);
      return source.slice(debut, fin);
    };
    expect(lecteurDe(ISOLATION)).toBe(lecteurDe(COOLIFY));
  });
});

// =============================================================================
// CONVENTIONS COOLIFY
// =============================================================================

/** Pile minimale conforme : un seul volume, nommé et déclaré. */
const SAIN_COOLIFY = `name: axion-coolify
services:
  postgres:
    image: axion/postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data
  api:
    image: axion/api
volumes:
  postgres_data:
    name: axion-coolify-postgres-data
`;

function pileCoolify(services: string): string {
  return `name: axion-coolify
services:
${services}volumes:
  postgres_data:
    name: axion-coolify-postgres-data
`;
}

describe('check-compose-coolify.mjs', () => {
  it('accepte la pile dont tous les montages sont des volumes nommés et déclarés', () => {
    const { code, sortie } = lancer(COOLIFY, SAIN_COOLIFY);
    expect(sortie).toContain('conventions Coolify');
    expect(code).toBe(0);
  });

  it('refuse une INTERPOLATION `${…}` dans une définition de volume', () => {
    const compose = pileCoolify(
      `  postgres:
    image: axion/postgres
    volumes:
      - \${DOSSIER_DONNEES}/pg:/var/lib/postgresql/data
`,
    );
    const { code, sortie } = lancer(COOLIFY, compose);
    expect(sortie).toContain('INTERPOLATION DANS UN VOLUME');
    expect(code).toBe(1);
  });

  it('refuse un CHEMIN RELATIF INEXISTANT depuis la racine du dépôt', () => {
    const compose = pileCoolify(
      `  api:
    build:
      context: ./apps/api
    volumes:
      - postgres_data:/var/lib/postgresql/data
`,
    );
    const { code, sortie } = lancer(COOLIFY, compose);
    expect(sortie).toContain('CHEMIN INEXISTANT DEPUIS LA RACINE');
    expect(code).toBe(1);
  });

  it('refuse un chemin qui ne se résout QUE depuis `infra/` — la faute qui a coûté un déploiement', () => {
    // `./postgres` n'existe qu'à `infra/postgres`. Écrit depuis `infra/`, il paraît
    // juste ; Coolify résout depuis la RACINE, où il n'existe pas.
    const compose = pileCoolify(
      `  postgres:
    build:
      context: ./postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data
`,
    );
    const { code, sortie } = lancer(COOLIFY, compose, ['infra/postgres/Dockerfile']);
    expect(sortie).toContain('CHEMIN INEXISTANT DEPUIS LA RACINE');
    expect(code).toBe(1);
  });

  it('accepte le même chemin écrit DEPUIS LA RACINE', () => {
    const compose = pileCoolify(
      `  postgres:
    build:
      context: ./infra/postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data
`,
    );
    const { code } = lancer(COOLIFY, compose, ['infra/postgres/Dockerfile']);
    expect(code).toBe(0);
  });

  it('refuse un chemin qui REMONTE au-dessus de la racine du dépôt', () => {
    const compose = pileCoolify(
      `  api:
    build:
      context: ../apps/api
`,
    );
    const { code, sortie } = lancer(COOLIFY, compose);
    expect(sortie).toContain('AU-DESSUS DE LA RACINE');
    expect(code).toBe(1);
  });

  it('refuse un montage bind depuis le dépôt (forme courte)', () => {
    const compose = pileCoolify(
      `  postgres:
    image: axion/postgres
    volumes:
      - ./infra/postgres/postgresql.conf:/etc/postgresql/postgresql.conf
`,
    );
    const { code, sortie } = lancer(COOLIFY, compose, ['infra/postgres/postgresql.conf']);
    expect(sortie).toContain('MONTAGE DEPUIS LA MACHINE OU LE DÉPÔT');
    expect(code).toBe(1);
  });

  it('refuse un montage bind écrit en FORME LONGUE', () => {
    const compose = pileCoolify(
      `  postgres:
    image: axion/postgres
    volumes:
      - type: bind
        source: ./infra/postgres/postgresql.conf
        target: /etc/postgresql/postgresql.conf
`,
    );
    const { code, sortie } = lancer(COOLIFY, compose, ['infra/postgres/postgresql.conf']);
    expect(sortie).toContain('MONTAGE DEPUIS LA MACHINE OU LE DÉPÔT');
    expect(code).toBe(1);
  });

  it('refuse un volume nommé absent de la section `volumes:` de premier niveau', () => {
    const compose = pileCoolify(
      `  postgres:
    image: axion/postgres
    volumes:
      - donnees_oubliees:/var/lib/postgresql/data
`,
    );
    const { code, sortie } = lancer(COOLIFY, compose);
    expect(sortie).toContain('VOLUME NOMMÉ NON DÉCLARÉ');
    expect(code).toBe(1);
  });

  it('refuse un fichier du dépôt exposé par `configs: … file:`', () => {
    const compose = `name: axion-coolify
services:
  postgres:
    image: axion/postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data
configs:
  pg:
    file: ./infra/postgres/postgresql.conf
volumes:
  postgres_data:
    name: axion-coolify-postgres-data
`;
    const { code, sortie } = lancer(COOLIFY, compose, ['infra/postgres/postgresql.conf']);
    expect(sortie).toContain('FICHIER DU DÉPÔT EXPOSÉ');
    expect(code).toBe(1);
  });

  // --- LES TROIS CONTOURNEMENTS MESURÉS À LA REVUE CROISÉE ------------------

  it('refuse la clé `"volumes":` ÉCRITE ENTRE GUILLEMETS', () => {
    const compose = pileCoolify(
      `  postgres:
    image: axion/postgres
    "volumes":
      - ./infra/postgres/postgresql.conf:/etc/postgresql/postgresql.conf
`,
    );
    const { code, sortie } = lancer(COOLIFY, compose, ['infra/postgres/postgresql.conf']);
    expect(code).toBe(1);
    expect(sortie).toContain('CONVENTIONS COOLIFY');
  });

  it('refuse un service entier écrit en MAPPING DE FLUX qui cache un bind', () => {
    const compose = pileCoolify(
      `  postgres: {image: axion/postgres, volumes: ['./infra/postgres/postgresql.conf:/etc/pg.conf']}
`,
    );
    const { code, sortie } = lancer(COOLIFY, compose, ['infra/postgres/postgresql.conf']);
    expect(code).toBe(1);
    expect(sortie).toContain('CONVENTIONS COOLIFY');
  });

  it('refuse un bind caché dans une ANCRE portant la liste EN FLUX', () => {
    const compose = `name: axion-coolify
x-montages: &montages ['./infra/postgres/postgresql.conf:/etc/pg.conf']
services:
  postgres:
    image: axion/postgres
    volumes: *montages
volumes:
  postgres_data:
    name: axion-coolify-postgres-data
`;
    const { code, sortie } = lancer(COOLIFY, compose, ['infra/postgres/postgresql.conf']);
    expect(code).toBe(1);
    expect(sortie).toContain('CONVENTIONS COOLIFY');
  });

  it('refuse une clé `volumes:` qui ne produit aucun montage — le lecteur a perdu le service', () => {
    const compose = pileCoolify(
      `  postgres:
    image: axion/postgres
    volumes:
`,
    );
    const { code, sortie } = lancer(COOLIFY, compose);
    expect(sortie).toContain("n'a produit AUCUN montage");
    expect(code).toBe(1);
  });

  it('lit un `build:` écrit en mapping de flux au lieu de le prendre pour un chemin', () => {
    const compose = pileCoolify(
      `  api:
    build: {context: ./apps/api, dockerfile: Dockerfile}
`,
    );
    const { code } = lancer(COOLIFY, compose, ['apps/api/Dockerfile']);
    expect(code).toBe(0);
  });

  it("ne s'applique pas — et le DIT — quand le fichier compose n'existe pas encore", () => {
    const bac = creerBac(COOLIFY);
    const { code, sortie } = executer(bac, COOLIFY);
    expect(sortie).toContain('NON APPLIQUÉ');
    expect(code).toBe(0);
  });
});

// =============================================================================
// LES COMPTEURS — CE QUE LES 45 CAS PRÉCÉDENTS NE TUAIENT PAS
// -----------------------------------------------------------------------------
// Les cas ci-dessus tuent la neutralisation du VERDICT (remplacer `process.exit(1)`
// par `exit(0)` les fait tous tomber). Ils ne tuaient PAS la neutralisation des
// COMPTEURS : un script réduit à `attachementsInspectes += 0` restait vert chez
// eux tout en affirmant « seul « caddy » rejoint un réseau hors de la pile » sans
// avoir regardé un seul attachement. C'est la récidive exacte du défaut qui avait
// motivé la réécriture de ces deux scripts — le compteur était AFFICHÉ, jamais
// ASSERTÉ.
//
// Deux verrous, posés ensemble parce qu'aucun des deux ne suffit :
//   · les cas « annonce » ci-dessous lisent le NOMBRE IMPRIMÉ et le comparent à une
//     vérité connue de la fixture (4 attachements pour 3 services, pas « un
//     nombre »). Un compteur faux, dans un sens comme dans l'autre, les fait
//     tomber ;
//   · les cas « mutation » exécutent le script AMPUTÉ de son incrément sur une
//     fixture SAINE et exigent EXIT=1. C'est le seul test qui reproduit à
//     l'identique la commande de la revue adverse.
// Traçabilité : point 21bis du gardien A02 · revue adverse du 2026-08-28 · 09 §5.6.
// =============================================================================

/** Un service SANS clé `networks:` : Compose l'attache au `default` implicite. */
const SAIN_AVEC_DEFAUT_IMPLICITE = `name: axion-coolify
services:
${CADDY_LEGITIME}  api:
    image: axion/api
${RESEAUX_RESEAU}`;

/** Pile Coolify saine portant DEUX chemins relatifs résolus : contexte + Dockerfile. */
const SAIN_COOLIFY_AVEC_CHEMINS = pileCoolify(
  `  postgres:
    image: axion/postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data
  api:
    build:
      context: ./infra/api
      dockerfile: Dockerfile
`,
);

describe('les compteurs sont assertés, pas seulement affichés', () => {
  it('isolation — ANNONCE le nombre exact d’attachements de la fixture (4 sur 3 services)', () => {
    // caddy → axion + edge (2) · api → axion (1) · worker → axion (1).
    const { code, sortie } = lancer(ISOLATION, SAIN_RESEAU);
    expect(code).toBe(0);
    expect(sortie).toContain('4 attachement(s) inspecté(s) sur 3 service(s)');
  });

  it('isolation — compte le réseau `default` IMPLICITE du service qui ne déclare rien', () => {
    // caddy → 2 · api → aucune clé `networks:`, donc 1 attachement implicite.
    const { code, sortie } = lancer(ISOLATION, SAIN_AVEC_DEFAUT_IMPLICITE);
    expect(code).toBe(0);
    expect(sortie).toContain('3 attachement(s) inspecté(s) sur 2 service(s)');
  });

  it('isolation — `networks: []` ne compte pour AUCUN attachement, et le dit', () => {
    const compose = pileReseau(
      `${CADDY_LEGITIME}  api:
    image: axion/api
    networks: []
`,
    );
    const { code, sortie } = lancer(ISOLATION, compose);
    expect(code).toBe(0);
    expect(sortie).toContain('2 attachement(s) inspecté(s) sur 2 service(s)');
  });

  it('isolation — MEURT si l’incrément d’attachements est neutralisé (fixture saine)', () => {
    const { code, sortie } = lancerMute(ISOLATION, SAIN_RESEAU, [
      ['attachementsInspectes += 1', 'attachementsInspectes += 0'],
    ]);
    expect(sortie).toContain("compteur d'attachements est incohérent");
    expect(sortie).toContain('0 inspecté(s) pour 3 attendu(s)');
    expect(code).toBe(1);
  });

  it('coolify — ANNONCE les deux nombres exacts de la fixture (1 montage, 0 chemin)', () => {
    const { code, sortie } = lancer(COOLIFY, SAIN_COOLIFY);
    expect(code).toBe(0);
    expect(sortie).toContain('1 montage(s) inspecté(s) sur 2 service(s)');
    expect(sortie).toContain('0 chemin(s) relatif(s)');
  });

  it('coolify — ANNONCE les deux chemins relatifs (contexte + Dockerfile)', () => {
    const { code, sortie } = lancer(COOLIFY, SAIN_COOLIFY_AVEC_CHEMINS, ['infra/api/Dockerfile']);
    expect(code).toBe(0);
    expect(sortie).toContain('1 montage(s) inspecté(s) sur 2 service(s)');
    expect(sortie).toContain('2 chemin(s) relatif(s)');
  });

  it('coolify — MEURT si l’incrément de montages est neutralisé (fixture saine)', () => {
    const { code, sortie } = lancerMute(COOLIFY, SAIN_COOLIFY, [
      ['montagesInspectes += 1', 'montagesInspectes += 0'],
    ]);
    expect(sortie).toContain("compteurs d'inspection sont incohérents");
    expect(sortie).toContain('montages : 0 inspecté(s)');
    expect(code).toBe(1);
  });

  it('coolify — MEURT si l’incrément de chemins est neutralisé (fixture saine)', () => {
    const { code, sortie } = lancerMute(
      COOLIFY,
      SAIN_COOLIFY_AVEC_CHEMINS,
      [['cheminsInspectes += 1', 'cheminsInspectes += 0']],
      ['infra/api/Dockerfile'],
    );
    expect(sortie).toContain("compteurs d'inspection sont incohérents");
    expect(sortie).toContain('chemins  : 0 inspecté(s) pour 2 attendu(s)');
    expect(code).toBe(1);
  });
});
