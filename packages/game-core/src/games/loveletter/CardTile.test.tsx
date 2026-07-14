// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import './i18nFixture.js';
import { CardTile } from './CardTile.js';

describe('CardTile (AC1)', () => {
  it('renders the rank, translated name, and translated effect text', () => {
    render(<CardTile rank={2} onClick={vi.fn()} />);
    const button = screen.getByRole('button');
    expect(button).toHaveTextContent('2');
    expect(button).toHaveTextContent('TEST_Priest');
    expect(button).toHaveTextContent('TEST_priest_text');
  });

  it('renders no image element or background-image reference', () => {
    const { container } = render(<CardTile rank={9} onClick={vi.fn()} />);
    expect(container.querySelector('img')).toBeNull();
    const style = container.querySelector('[style*="background-image"]');
    expect(style).toBeNull();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<CardTile rank={0} onClick={onClick} />);
    screen.getByRole('button').click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled and shows the reason when the disabled prop is set', () => {
    render(<CardTile rank={5} onClick={vi.fn()} disabled disabledReason="TEST_reason" />);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'TEST_reason');
  });

  it('is inert when no onClick is supplied (static display use, e.g. PlayArea)', () => {
    render(<CardTile rank={7} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
