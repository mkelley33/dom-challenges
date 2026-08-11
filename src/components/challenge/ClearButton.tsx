import { LoaderCircleIcon } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { isUnrecorded, useClearProgress, useStoredProgress } from '@/hooks/useProgress';
import { useEditorStore } from '@/store/editorStore';

const ConfirmDialog = lazy(async () => {
  const { ConfirmDialog: Component } = await import('./ConfirmDialog');
  return { default: Component };
});

const CONFIRM_DESCRIPTION =
  'This deletes your saved progress for this challenge — every attempt, the solve, and any solution you revealed — and puts the starter code back in the editor. What you have written here is not kept.';

export interface ClearButtonProps {
  challengeId: string;
  onCleared: () => void;
}

/**
 * The way back out of a challenge: start it again from the starter code, with nothing recorded.
 *
 * The record is resolved at click time through `useStoredProgress` rather than taken as a prop.
 * A `recordId` prop would have to come from a render, and on a cold deep-link a render still holds
 * `emptyProgress(challengeId)` -- whose `id` is the *challenge* id. json-server assigns its own id
 * on create and discards the client's, so deleting that id aims at a row that does not exist: the
 * DELETE 404s, `useClearProgress` rolls its optimistic removal back, and the learner is left
 * looking at an unchanged page after confirming a destructive action.
 *
 * Clearing resets three things, and the caller owns the third: the draft (here), the stored record
 * (here), and the on-screen result (`onCleared`). Leaving the result behind would sit a stale set
 * of passing tests next to freshly reset starter code.
 */
export function ClearButton({ challengeId, onCleared }: ClearButtonProps) {
  const [confirming, setConfirming] = useState(false);
  // Latched rather than mirrored from `confirming`: unmounting the dialog the instant it closes
  // would cut short Base UI's exit transition and, with it, the focus restoration to the button.
  const [dialogNeeded, setDialogNeeded] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [failed, setFailed] = useState(false);
  const clearDraft = useEditorStore((state) => state.clearDraft);
  const readStoredProgress = useStoredProgress(challengeId);
  const { mutateAsync: clearProgress } = useClearProgress();

  useEffect(() => {
    // Warmed on mount so the boundary below is a formality by the time a learner has read the copy
    // and decided. Effects run after paint, so this never delays the page; without it, a click on a
    // cold connection would sit on `fallback`. Best effort -- `lazy` runs the import again when the
    // boundary is actually crossed, so a failed warm only means the click pays for the load.
    import('./ConfirmDialog').catch(() => undefined);
  }, []);

  const handleOpen = useCallback(() => {
    setDialogNeeded(true);
    setConfirming(true);
  }, []);

  const handleOpenChange = useCallback((open: boolean) => {
    setConfirming(open);
  }, []);

  const handleConfirm = useCallback(() => {
    setConfirming(false);
    setFailed(false);
    setIsClearing(true);

    const clear = async (): Promise<void> => {
      try {
        const stored = await readStoredProgress();
        if (stored === null) {
          // Nothing is cleared at all, not even the draft. Reported rather than swallowed -- they
          // confirmed a destructive action and are owed an answer either way.
          setFailed(true);
          return;
        }

        // No row to delete, which is not a failure: the placeholder's `id` is the challenge id, so
        // a DELETE for it would 404 on a record that was never there.
        if (!isUnrecorded(stored)) {
          try {
            // `mutateAsync`, not `mutate`: nothing local is cleared until the row is actually gone.
            // Fire-and-forget would clear the draft optimistically, and a rejected DELETE would then
            // roll the record back into place while the learner's code stayed deleted -- the exact
            // half-clear the branch above refuses to make, keeping the unrecoverable half. Waiting
            // costs no new affordance: the flow already awaits the read, behind the same in-flight
            // state, and on success the learner sees the same order either way.
            await clearProgress(stored.id);
          } catch {
            setFailed(true);
            return;
          }
        }

        clearDraft(challengeId);
        onCleared();
      } finally {
        setIsClearing(false);
      }
    };

    void clear();
  }, [challengeId, clearDraft, clearProgress, onCleared, readStoredProgress]);

  return (
    <>
      {/* Two decisions about the in-flight state.
          The label stays "Clear solution" rather than swapping to "Clearing…": a control whose
          accessible name changes under a screen reader mid-action is disorienting, and the button
          says it is unavailable through its state instead -- announced as `aria-disabled` and, from
          `buttonVariants`, dimmed and un-hovered by the matching `aria-disabled:` utilities.
          `focusableWhenDisabled` because the dialog restores focus to this button as it closes, and
          the clear behind it is two requests long on a cold deep-link. A plainly disabled button
          cannot take that focus, so it would drop to <body>. Base UI still blocks activation --
          inert, but findable. It also omits the native `disabled` attribute, which is why the look
          cannot come from the `disabled:` variants.
          The spinner is the visible half. Dimming alone is a weak signal and, under Vitest, an
          unverifiable one -- happy-dom loads no stylesheet, so a test can only read the class back.
          An `aria-hidden` icon adds motion the learner can see without touching the name, and
          `buttonVariants` sizes a bare <svg> for the current button size. */}
      <Button variant="destructive" size="sm" onClick={handleOpen} disabled={isClearing} focusableWhenDisabled>
        {isClearing && <LoaderCircleIcon aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
        Clear solution
      </Button>

      {failed && (
        <p role="alert" className="text-xs text-destructive">
          Your progress could not be cleared. Check your connection and try again.
        </p>
      )}

      {/* `null`, because a dialog is portaled and fixed: nothing it renders sits in this row's
          flow, so there is no space to reserve and nothing to jump when it arrives. */}
      <Suspense fallback={null}>
        {dialogNeeded && (
          <ConfirmDialog
            open={confirming}
            onOpenChange={handleOpenChange}
            onConfirm={handleConfirm}
            title="Clear your progress?"
            description={CONFIRM_DESCRIPTION}
            cancelLabel="Keep my work"
            confirmLabel="Yes, clear it"
            destructive
          />
        )}
      </Suspense>
    </>
  );
}
