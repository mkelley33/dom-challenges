import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// Hoisted so the element handed to Base UI's `render` prop is created once rather than per render
// (react-perf/jsx-no-jsx-as-prop) -- safe because it closes over nothing.
const keepTryingRender = <Button variant="outline" />;

export interface RevealConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

/**
 * The confirm standing in front of a reveal.
 *
 * Its own module so it can be `React.lazy`'d. Base UI's dialog brings a focus trap, a portal and
 * positioning machinery -- measured at 49 kB of the `ChallengePage` route chunk -- for something
 * that mounts only after a click, only in the locked state, and only for a learner who gives up.
 * `Tabs` earns its place in the route chunk because it is on screen whenever the panel is
 * unlocked; this does not.
 */
export function RevealConfirmDialog({ open, onOpenChange, onConfirm }: RevealConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reveal the solution?</DialogTitle>
          {/* Says what is recorded, and stops there. Naming a way back would name a control that
              does not exist yet -- the Clear button arrives with the progress panel. */}
          <DialogDescription>
            Revealing is recorded against this challenge. From then on these solutions are marked revealed rather than
            earned.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={keepTryingRender}>Keep trying</DialogClose>
          <Button onClick={onConfirm}>Yes, reveal it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
