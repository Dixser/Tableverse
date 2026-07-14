// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import './i18nFixture.js';
import { PlayArea } from './PlayArea.js';

describe('PlayArea (AC8)', () => {
  it('renders every seat and their played cards', () => {
    render(
      <PlayArea
        playedCards={{ '0': [8], '1': [1, 2] }}
        eliminated={{ '0': false, '1': false }}
        handmaidProtected={{ '0': false, '1': false }}
      />,
    );
    expect(screen.getByText('Seat 1')).toBeInTheDocument();
    expect(screen.getByText('Seat 2')).toBeInTheDocument();
    expect(screen.getAllByText('TEST_Guard')).toHaveLength(1);
    expect(screen.getAllByText('TEST_Priest')).toHaveLength(1);
  });

  it('shows an eliminated badge for an eliminated seat', () => {
    render(
      <PlayArea
        playedCards={{ '0': [9], '1': [] }}
        eliminated={{ '0': true, '1': false }}
        handmaidProtected={{ '0': false, '1': false }}
      />,
    );
    expect(screen.getByText('TEST_eliminated')).toBeInTheDocument();
    expect(screen.queryByText('TEST_protected')).toBeNull();
  });

  it('shows a protected badge for a Handmaid-protected seat', () => {
    render(
      <PlayArea
        playedCards={{ '0': [4], '1': [] }}
        eliminated={{ '0': false, '1': false }}
        handmaidProtected={{ '0': true, '1': false }}
      />,
    );
    expect(screen.getByText('TEST_protected')).toBeInTheDocument();
  });

  it('played cards are inert display badges, not clickable', () => {
    render(
      <PlayArea
        playedCards={{ '0': [8] }}
        eliminated={{ '0': false }}
        handmaidProtected={{ '0': false }}
      />,
    );
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('labels a seat by username instead of "Seat N" when playerNames is known', () => {
    render(
      <PlayArea
        playedCards={{ '0': [8], '1': [] }}
        eliminated={{ '0': false, '1': false }}
        handmaidProtected={{ '0': false, '1': false }}
        playerNames={{ '0': 'Alice' }}
      />,
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.queryByText('Seat 1')).toBeNull();
    expect(screen.getByText('Seat 2')).toBeInTheDocument(); // no name synced -- falls back.
  });
});
