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
const cancelRender = <Button variant="outline" />;

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title: string;
  description: string;
  cancelLabel: string;
  confirmLabel: string;
  /** Styles the confirm for an action that destroys something. Copy still has to say what. */
  destructive?: boolean;
}

/**
 * The confirm standing in front of an action the learner cannot take back: revealing a solution,
 * and clearing one.
 *
 * Its own module so it can be `React.lazy`'d, and one module rather than one per caller so both
 * dialogs share it. Base UI's dialog brings a focus trap, a portal and positioning machinery --
 * measured at 49 kB of the `ChallengePage` route chunk -- for something that mounts only after a
 * click. `Tabs` earns its place in the route chunk because it is on screen whenever the solutions
 * panel is unlocked; this does not.
 *
 * The copy is the caller's: what is about to happen, and what it costs, is the one thing the two
 * uses do not share.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  cancelLabel,
  confirmLabel,
  destructive = false,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={cancelRender}>{cancelLabel}</DialogClose>
          <Button variant={destructive ? 'destructive' : 'default'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
