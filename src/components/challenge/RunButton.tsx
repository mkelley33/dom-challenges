import { LoaderCircleIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';

export interface RunButtonProps {
  onRun: () => void;
  isRunning: boolean;
}

/**
 * The primary action of a challenge page: hand the current draft to the runner.
 *
 * Two decisions about the in-flight state, and they are the same two `ClearButton` made -- this
 * component exists so that they are made once and visibly.
 *
 * The label stays "Run tests" rather than swapping to "Running…". A control's accessible name is
 * its identity, and renaming it under a screen reader mid-action is disorienting; worse, the swap
 * says nothing the page does not already say better. `aria-disabled` announces that the button is
 * unavailable, and the results region is a live region that announces "Running tests…" on its own.
 * The state belongs in the status, not in the name of the control.
 *
 * `focusableWhenDisabled` because the keyboard route into this button is Enter, and a plainly
 * `disabled` button cannot hold focus: pressing it would drop the learner onto <body> as a
 * consequence of their own successful action. Base UI still blocks activation -- inert, but
 * findable. It also omits the native `disabled` attribute, which is why the dimming comes from
 * `buttonVariants`' `aria-disabled:` utilities rather than its `disabled:` ones.
 *
 * The spinner is what makes the in-flight state visible without touching the name: an `aria-hidden`
 * icon is motion only. `buttonVariants` sizes a bare `<svg>` for the current button size, so it
 * carries no size class of its own.
 */
export function RunButton({ onRun, isRunning }: RunButtonProps) {
  return (
    <Button onClick={onRun} disabled={isRunning} focusableWhenDisabled size="sm">
      {isRunning && <LoaderCircleIcon aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
      Run tests
    </Button>
  );
}
