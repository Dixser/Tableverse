// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmojiCounter } from './EmojiCounter.js';

describe('EmojiCounter', () => {
  it('renders the emoji once per unit of count', () => {
    const { container } = render(<EmojiCounter emoji="🐰" count={3} ariaLabel="Lives: 3" />);
    expect(container.textContent).toBe('🐰🐰🐰');
  });

  it('renders nothing visible at count 0, but keeps the accessible label', () => {
    render(<EmojiCounter emoji="💫" count={0} ariaLabel="Stars: 0" />);
    const el = screen.getByLabelText('Stars: 0');
    expect(el.textContent).toBe('');
  });

  it('exposes the count via an accessible label, not visible digits', () => {
    render(<EmojiCounter emoji="💫" count={2} ariaLabel="Stars: 2" />);
    expect(screen.getByLabelText('Stars: 2')).toBeInTheDocument();
    expect(screen.queryByText('2')).toBeNull();
  });
});
