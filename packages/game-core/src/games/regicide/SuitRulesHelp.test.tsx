// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import './i18nFixture.js';
import { SuitRulesHelp } from './SuitRulesHelp.js';

describe('SuitRulesHelp', () => {
  it('renders a single `?` trigger, not the rules text itself, as the visible affordance', () => {
    render(<SuitRulesHelp />);
    const trigger = screen.getByRole('button', { name: 'TEST_suit_rules_help' });
    expect(trigger).toHaveTextContent('?');
  });

  it('carries all four suit powers, each paired with its suit symbol', () => {
    render(<SuitRulesHelp />);
    for (const suit of ['S', 'H', 'D', 'C']) {
      const rule = screen.getByText(`TEST_suit_rule_${suit}`);
      expect(rule).toBeInTheDocument();
      // The symbol and its rule sit in the same row, so the table reads as
      // four suit->power pairs rather than four unlabelled sentences.
      expect(rule.parentElement).toHaveTextContent(`TEST_${suit}`);
    }
  });

  it('keeps the rules in the accessibility tree and wires them to the trigger as its description', () => {
    render(<SuitRulesHelp />);
    // Hidden purely by CSS (opacity/visibility on hover/:focus-within), which
    // jsdom does not apply -- what matters here is that the description is
    // reachable by id, i.e. a screen reader gets the powers read out with the
    // `?` instead of having to find them elsewhere on the board.
    const trigger = screen.getByRole('button', { name: 'TEST_suit_rules_help' });
    const tipID = trigger.getAttribute('aria-describedby');
    expect(tipID).toBeTruthy();
    const tip = screen.getByRole('tooltip');
    expect(tip.id).toBe(tipID);
  });

  it('gives each instance its own tooltip id, so two copies never cross-describe', () => {
    render(
      <>
        <SuitRulesHelp />
        <SuitRulesHelp />
      </>,
    );
    const ids = screen.getAllByRole('tooltip').map((tip) => tip.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});
