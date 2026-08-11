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

  const { control, register, watch } = useForm<ChallengeFilters>({
    // Read imperatively, not through the hook: `defaultValues` is consumed once at mount, and this
    // is what carries filters set before navigating away back into the form on the way back.
    defaultValues: useEditorStore.getState().filters,
  });

  const difficulty = useController({ control, name: 'difficulty' });
  const hideSolved = useController({ control, name: 'hideSolved' });

  useEffect(() => {
    // `watch`'s callback form: a subscription that fires on real field changes and does not render
    // this component. `watch()` called during render returns a new object every time, and pushing
    // *that* into the store from an effect is the loop this shape exists to avoid.
    const subscription = watch((values) => {
      setFilters(values);
    });
    return () => {
      subscription.unsubscribe();
    };
    // Both are stable for the life of the component -- `watch` off React Hook Form's control, and
    // `setFilters` off the store's initializer -- so this subscribes once.
  }, [watch, setFilters]);

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
