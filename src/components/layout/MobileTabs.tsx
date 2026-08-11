import { useCallback } from 'react';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { MobileTab } from '@/store/editorStore';

export interface MobileTabsProps {
  value: MobileTab;
  onChange: (tab: MobileTab) => void;
  /**
   * The id of the column each tab shows.
   *
   * Base UI wires `aria-controls` itself only when a matching `Tabs.Panel` is mounted, and there is
   * none here: the three columns are the app's layout, and they are `region` landmarks at desktop
   * where this control does not exist at all. `aria-controls` puts no role constraint on its
   * target, so pointing at them directly restores the relationship -- and the jump-to-controlled
   * command that depends on it -- without re-roling three landmarks for a control that is hidden
   * above `lg`.
   */
  panelIds: Record<MobileTab, string>;
}

// Module scope, because the list never varies: rebuilt inline it would be a new array on every
// render of the challenge page.
const TABS: readonly { value: MobileTab; label: string }[] = [
  { value: 'problem', label: 'Problem' },
  { value: 'code', label: 'Code' },
  { value: 'result', label: 'Results' },
];

/**
 * The segmented control that chooses which of the three panels a phone shows.
 *
 * `lg:hidden` rather than unmounted above the breakpoint: the panels themselves are one tree at
 * every size, and this is the control that is meaningless once all three are on screen at once.
 *
 * Fully controlled -- no `defaultValue`. The selection lives in the editor store, so an
 * uncontrolled copy here would move on its own click and then disagree with the store the next time
 * anything else set the tab (running the tests does exactly that).
 */
export function MobileTabs({ value, onChange, panelIds }: MobileTabsProps) {
  // Wrapped rather than handed straight to Base UI, which calls its listener with a second
  // `eventDetails` argument. Passing that through would put a primitive's event object in this
  // component's public signature, where a caller storing the tab has no use for it.
  const handleValueChange = useCallback(
    (next: MobileTab) => {
      onChange(next);
    },
    [onChange],
  );

  return (
    <Tabs value={value} onValueChange={handleValueChange} className="lg:hidden">
      <TabsList aria-label="Challenge view" className="w-full">
        {TABS.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} aria-controls={panelIds[tab.value]}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
