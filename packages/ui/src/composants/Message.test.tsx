// =============================================================================
// TESTS — MESSAGE (@axion/ui)
// Écrits par un agent qui n'a PAS écrit le composant (09 §5.6).
//
// LE POINT ÉPROUVÉ EST LE RÔLE ARIA, ET C'EST UNE EXIGENCE DE PACK, PAS UN GOÛT.
// §17.3 interdit toute notification INTRUSIVE en entretien : `role="alert"`
// interrompt le lecteur d'écran au milieu d'une phrase, `role="status"` attend la
// fin. Un composant qui mettrait `alert` partout couperait la parole à un
// auditeur malvoyant pour lui annoncer une consigne de cotation. Le rôle doit
// donc suivre le ton, et un seul ton mérite l'interruption.
//
// §17.6 : « chaque erreur dit la CAUSE ET L'ACTION » — d'où le test qui vérifie
// que les actions rendues restent atteignables par leur rôle de bouton.
// Traçabilité : E27.
// =============================================================================
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Message, type TonMessage } from './Message.js';
import { Bouton } from './Bouton.js';

afterEach(() => {
  cleanup();
});

describe('Message — §17.3 : seule une alerte a le droit d’interrompre', () => {
  const NON_INTRUSIFS: readonly TonMessage[] = ['info', 'succes', 'avertissement'];

  it.each(NON_INTRUSIFS)('le ton « %s » prend `role="status"`, jamais `alert`', (ton) => {
    render(<Message ton={ton}>Consigne de cotation.</Message>);
    expect(screen.getByRole('status').textContent).toContain('Consigne de cotation.');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('le ton « alerte » prend `role="alert"` — le seul qui coupe la parole', () => {
    render(<Message ton="alerte">Stockage local presque plein.</Message>);
    expect(screen.getByRole('alert').textContent).toContain('Stockage local presque plein.');
  });

  it('sans ton précisé, le message est informatif et non intrusif', () => {
    render(<Message>Rappel de confidentialité.</Message>);
    expect(screen.getByRole('status')).not.toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Message — le contenu se lit, l’icône ne parle pas à sa place (§33.6)', () => {
  it('affiche le titre ET le corps', () => {
    render(
      <Message ton="avertissement" titre="Étape verrouillée">
        Il manque deux entretiens de l’unité.
      </Message>,
    );
    expect(screen.getByText('Étape verrouillée')).not.toBeNull();
    expect(screen.getByText('Il manque deux entretiens de l’unité.')).not.toBeNull();
  });

  it('retire son icône de l’arbre d’accessibilité', () => {
    const { container } = render(<Message ton="alerte">Erreur de synchronisation.</Message>);
    const icone = container.querySelector('svg');
    expect(icone).not.toBeNull();
    expect(icone?.getAttribute('aria-hidden')).toBe('true');
  });

  it('rend le texte identique quel que soit le ton (aucun sens dans la couleur)', () => {
    const { container: info } = render(<Message ton="info">Même phrase.</Message>);
    const { container: alerte } = render(<Message ton="alerte">Même phrase.</Message>);
    expect(alerte.textContent).toBe(info.textContent);
  });
});

describe('Message — §17.6 : la cause s’accompagne d’une ACTION atteignable', () => {
  it('expose les actions comme de vrais boutons nommés', () => {
    render(
      <Message ton="alerte" titre="Synchronisation impossible" actions={<Bouton>Réessayer</Bouton>}>
        Le réseau n’a pas répondu.
      </Message>,
    );
    expect(screen.getByRole('button', { name: 'Réessayer' })).not.toBeNull();
  });
});
