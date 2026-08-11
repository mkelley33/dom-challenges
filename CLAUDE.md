# CLAUDE.md

@AGENTS.md

Everything about how this project is built, tested, committed and reasoned about lives in `AGENTS.md`, imported above.
Read it. Nothing in it is restated here — if a rule appears in both files, one of them is already out of date, so this
file only carries what is specific to working on this repo _as Claude_.

## Precedence

`AGENTS.md` overrides the global instruction files where they differ. Those defaults assume a Next.js / Prisma /
ESLint-9 / MUI stack; this repo is none of those, and applying them here produces confident, wrong advice. The stack
this repo actually uses is stated in `README.md` and in the spec.

## Read the spec before touching the runner

`docs/superpowers/specs/2026-08-09-dom-challenges-design.md` is the approved design. Read the relevant section before
changing anything in `src/runner/`, `src/types/challenge.ts`, or the solution-gating logic — those are the parts with
a written contract that other parts of the app and every challenge module depend on, and the spec explains what they
are for, which the code alone cannot. §3 is the execution model, §4 the content model, §7 the testing strategy, §8.1
solution visibility.

`docs/superpowers/plans/` holds the phase plans — history, useful for _why_ something is the way it is, never
authoritative about what the code does now. A per-task ledger exists at `.superpowers/sdd/progress.md`, but that whole
directory is gitignored: if it is not already on your machine it does not exist for you, and you cannot cite it to
anyone else. Everything in it that outlived its task was moved into `AGENTS.md`. The code and `AGENTS.md` are the
authorities.

## Skills that apply here

- `superpowers:test-driven-development` — this repo is test-first throughout, and §1 and §8 of `AGENTS.md` describe the
  specific ways tests here have failed to be worth writing.
- `superpowers:verification-before-completion` — run the gates in `AGENTS.md` §1 and read their output before claiming
  anything is done. "Should pass" has been wrong here more than once.
- `superpowers:systematic-debugging` — several bugs in this codebase presented three times in three disguises before
  anyone named the single cause (`AGENTS.md` §4). Find the cause, not the symptom.
- `superpowers:requesting-code-review` before merging a task's work.
- `superpowers:using-git-worktrees` when starting isolated feature work.
- `mk-pr` for PR titles and descriptions; `mk-conflicts` for merge conflicts.

## Repo-specific cautions

- `.claude/` is gitignored except `settings.json`. Anything you write elsewhere in there is invisible to the next
  contributor — so knowledge that matters belongs in `AGENTS.md`, not in a local note. Several facts in that file are
  there precisely because they nearly died in a gitignored scratch file.
- Verifying browser-only behaviour (realm identity, focus order, `inert`) requires a **foreground** tab and real key
  events. `AGENTS.md` §5 records the probe that gave a wrong reading first time; do not repeat it.
