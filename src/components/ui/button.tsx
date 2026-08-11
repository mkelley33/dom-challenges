import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { type VariantProps } from 'class-variance-authority';

import { buttonVariants } from '@/components/ui/buttonVariants';
import { cn } from '@/lib/utils';

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return <ButtonPrimitive data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

// `buttonVariants` is deliberately *not* re-exported, though shadcn's own shape does. This module
// imports Base UI's button primitive, so anything importing from here drags the primitive into its
// chunk -- which is exactly what `RouteError` must not do, since it is reachable from the entry
// chunk. Re-exporting would leave a channel that silently undoes that with no test or lint to
// notice: import from `@/components/ui/buttonVariants` instead. Without the re-export, the property
// is structural rather than a convention someone has to remember.
export { Button };
