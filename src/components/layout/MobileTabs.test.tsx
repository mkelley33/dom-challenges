import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { MobileTab } from '@/store/editorStore';

import { MobileTabs } from './MobileTabs';

function renderTabs(value: MobileTab) {
  const onChange = vi.fn<(tab: MobileTab) => void>();
  render(<MobileTabs value={value} onChange={onChange} />);
  return { onChange };
}

function tabNames(): (string | null)[] {
  return screen.getAllByRole('tab').map((tab) => tab.textContent);
}

describe('MobileTabs', () => {
  it('is a named tablist with one tab per panel', () => {
    renderTabs('problem');

    expect(screen.getByRole('tablist', { name: 'Challenge view' })).toBeInTheDocument();
    expect(tabNames()).toEqual(['Problem', 'Code', 'Results']);
  });

  it('marks the tab it was given as the selected one', () => {
    renderTabs('code');

    // Read off `aria-selected` rather than a class: the class is how it looks, and this is the only
    // channel that tells a screen reader which of the three the learner is actually looking at.
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('Code');
  });

  it('follows the value it is given rather than keeping its own', () => {
    renderTabs('result');

    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('Results');
  });

  it('reports which tab was activated, not merely that one was', async () => {
    const { onChange } = renderTabs('problem');

    await userEvent.click(screen.getByRole('tab', { name: 'Results' }));

    // The value matters as much as the call: a handler wired to a constant, or to the tab that was
    // already selected, would satisfy `toHaveBeenCalled` and leave the learner on the wrong panel.
    expect(onChange).toHaveBeenCalledExactlyOnceWith('result');
  });

  it('leaves the selected tab alone until the caller changes the value', async () => {
    const { onChange } = renderTabs('problem');

    await userEvent.click(screen.getByRole('tab', { name: 'Code' }));

    // Controlled, not merely notified: an uncontrolled `defaultValue` would move the selection here
    // on its own and then disagree with the store the moment anything else set the tab.
    expect(onChange).toHaveBeenCalledExactlyOnceWith('code');
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('Problem');
  });
});
