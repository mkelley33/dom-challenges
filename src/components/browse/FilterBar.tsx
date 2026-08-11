import { useEffect, useId } from 'react';
import { useController, useForm } from 'react-hook-form';

import { DIFFICULTIES, DIFFICULTY_LABELS } from '@/challenges/registry';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { ChallengeFilters } from '@/store/editorStore';
import { useEditorStore } from '@/store/editorStore';

const ANY_DIFFICULTY_LABEL = 'All levels';

/**
 * Value-to-label map for the trigger's `Select.Value`, which otherwise shows the raw stored value
 * ("novice", "all"). Hoisted so the object passed as a prop is created once rather than per render.
 */
const DIFFICULTY_OPTION_LABELS: Record<string, string> = { all: ANY_DIFFICULTY_LABEL, ...DIFFICULTY_LABELS };

/**
 * How long a burst of typing coalesces into one store write.
 *
 * Every `setFilters` makes zustand's persist middleware serialise the whole persisted payload
 * synchronously, and that payload carries `drafts` -- a full editor buffer per challenge the
 * learner has opened. Undebounced, a learner a dozen challenges in stringifies all of them on
 * every keystroke. Long enough to swallow a burst, short enough that the list still feels like it
 * is filtering as you type.
 */
const QUERY_WRITE_DELAY_MS = 200;

/**
 * The filter controls for a category listing, backed by React Hook Form and pushed into the editor
 * store, which is where `ChallengeList` and the persist middleware both read them from.
 *
 * The form is the owner of the values while the bar is mounted and the store is the destination --
 * deliberately one-directional. Reading the store back as a subscription here would close the loop:
 * every keystroke writes `filters`, a subscription would re-render on that write, and a form that
 * re-seeded itself from what it had just written is one render away from never settling.
 */
export function FilterBar() {
  const setFilters = useEditorStore((state) => state.setFilters);
  const queryFieldId = useId();
  const difficultyLabelId = useId();
  const hideSolvedLabelId = useId();

  const { control, getValues, register, watch } = useForm<ChallengeFilters>({
    // Read imperatively, not through the hook: `defaultValues` is consumed once at mount, and this
    // is what carries filters set before navigating away back into the form on the way back.
    defaultValues: useEditorStore.getState().filters,
  });

  const difficulty = useController({ control, name: 'difficulty' });
  const hideSolved = useController({ control, name: 'hideSolved' });

  useEffect(() => {
    let pending: ReturnType<typeof setTimeout> | null = null;

    const cancel = (): void => {
      if (pending === null) return;
      clearTimeout(pending);
      pending = null;
    };

    // `watch`'s callback form: a subscription that fires on real field changes and does not render
    // this component. `watch()` called during render returns a new object every time, and pushing
    // *that* into the store from an effect is the loop this shape exists to avoid.
    const subscription = watch((values, { name }) => {
      // The text box is the only control that fires per keystroke, so it is the only one that
      // needs coalescing. The select and the switch are single decisions and write immediately --
      // a toggle whose effect arrives 200ms later reads as a laggy control.
      if (name !== 'query') {
        cancel();
        setFilters(values);
        return;
      }

      cancel();
      pending = setTimeout(() => {
        pending = null;
        // `getValues()` rather than the captured `values`: whatever the form holds when the timer
        // fires is what the store should end up with, including any field changed since.
        setFilters(getValues());
      }, QUERY_WRITE_DELAY_MS);
    });

    return () => {
      // Flushed, not dropped. A learner who types and immediately clicks into a challenge should
      // find their search still there on the way back -- discarding the pending write would make
      // whether the filter survives depend on how fast they moved.
      if (pending !== null) {
        cancel();
        setFilters(getValues());
      }
      subscription.unsubscribe();
    };
    // All three are stable for the life of the component -- `watch` and `getValues` off React Hook
    // Form's control, `setFilters` off the store's initializer -- so this subscribes once.
  }, [watch, getValues, setFilters]);

  return (
    <search className="mt-4 flex flex-wrap items-end gap-4">
      <div className="flex min-w-56 flex-col gap-1">
        <label htmlFor={queryFieldId} className="text-sm text-muted">
          Search challenges
        </label>
        <Input id={queryFieldId} type="text" placeholder="Title or concept" {...register('query')} />
      </div>

      <div className="flex flex-col gap-1">
        {/* A visible label rather than an `aria-label`: the trigger shows the chosen value, so
            without this there is nothing on screen saying which axis that value is on either. */}
        <span id={difficultyLabelId} className="text-sm text-muted">
          Difficulty
        </span>
        <Select
          value={difficulty.field.value}
          onValueChange={difficulty.field.onChange}
          items={DIFFICULTY_OPTION_LABELS}
        >
          <SelectTrigger aria-labelledby={difficultyLabelId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{ANY_DIFFICULTY_LABEL}</SelectItem>
            {DIFFICULTIES.map((level) => (
              <SelectItem key={level} value={level}>
                {DIFFICULTY_LABELS[level]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2 pb-2">
        {/* The switch renders a button, which a `<label>` cannot name -- only a labelable control
            can be a label's target -- so the association is by id. */}
        <span id={hideSolvedLabelId} className="text-sm text-muted">
          Hide solved
        </span>
        <Switch
          checked={hideSolved.field.value}
          onCheckedChange={hideSolved.field.onChange}
          aria-labelledby={hideSolvedLabelId}
        />
      </div>
    </search>
  );
}
