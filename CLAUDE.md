# Working rules

## This fork

This is `w00lsheep/ha-diorama`, Hendrik's fork of `CarlesRojas/ha-diorama`. It runs on his Home Assistant wall dashboard, installed through HACS as a custom repository that points at this fork. Talk to him in German, casually and briefly. Code, comments, commit messages and docs stay in English and follow the rules below.

What the fork adds on top of upstream:

- Imported models can stand for a device. A tag in square brackets in a node name gives a part a behavior: `[glow]`, `[glow 0.6]`, `[led]`, `[on]`, `[off]`, `[hinge <axis> <deg>]`, `[slide <axis> <m>]`, `[spin <axis> <turns/s>]`. `[top]` makes a part's upper face a top other pieces can stand on, and a model can have several: `surfaceTops` in `src/decoration/catalog.ts` gives them, `src/decoration/surfaces.ts` stands pieces on them, and a piece names a top that is not the highest in `level`. The parser and the signals a model expresses live in `src/decoration/modelTags.ts`. `src/scene/decor/modelShape.ts` keeps each tagged node's origin as the pivot and the color and finish of each part's material. `src/decoration/models.ts` builds the kind from that, and `src/scene/decor/CustomModel.tsx` draws it. Axes are the model's own: x right, y up, z toward the front.
- `tools/model-builder/build_model.py` builds a tagged .glb from a YAML file of simple shapes, with a preview and a report. Examples are in `tools/model-builder/examples/`. New models for Hendrik's room are built with it, and their YAML goes into `tools/model-builder/models/`.
- `src/dev/models.html?glb=<url>,<url>` draws .glb files in the card with made up devices, for checking a model with `pnpm dev`. Add `on=1`, `level=0.5`, `sun=-10` or `stretch=1.5,1,1` as needed.

Rules for the fork:

- Keep the fork's changes small and close to upstream's code, so syncing with upstream stays easy. Prefer a new file over spreading edits through existing ones.
- Syncing with upstream: `git fetch upstream && git merge upstream/main` on `main` (add the remote with `git remote add upstream https://github.com/CarlesRojas/ha-diorama.git` if it is missing). Resolve conflicts in favor of upstream's structure and re-apply the fork's behavior on top. Run `pnpm lint` and `pnpm build` before pushing.
- Releases: the card reaches Home Assistant only through a release. After a change on `main` that should reach the dashboard, tell Hendrik to run Actions, Release, Run workflow (or run it with `gh workflow run release.yml -f bump=patch` when that is allowed). HACS then offers the update.
- Never touch the dashboard's card config from here. Hendrik's card config lives in Home Assistant.
- Anything that would be worth upstream (a fix, the model behaviors as a whole) can be offered as a pull request to `CarlesRojas/ha-diorama`, but only when Hendrik asks for it. Then the branch rules below apply to that pull request.

## Branch state before any work

In this fork small changes go straight to `main`. Larger work goes on a branch with a pull request in the fork, and for that branch, and for any pull request to upstream, these rules apply.

Before starting any task, check the state of the branch you are working on against `main`:

- If the branch's pull request was merged into `main`: do not add commits to it. Start the new work on a fresh branch created from the latest `origin/main` (`git fetch origin main && git checkout -B <branch> origin/main`). Any pull request opened for it is a new one.
- If the branch was rebased or force-pushed: fetch it and continue the work on top of that.
- If the branch is open and unchanged: continue as is.

Check this on every new session and again right before every commit: fetch, confirm the branch's pull request is still open and the remote branch has not moved. Never commit on stale assumptions.

Whenever a pull request is merged, and whenever you check the state of the branches, fetch with `--prune` and delete every local branch whose pull request was merged and whose remote branch is gone. Never delete a local branch with commits that were not merged.

Keep working on the same branch and pull request while it is open, whatever the task. Only start a new branch when the pull request was merged or the user asks for one.

## Project

Custom Lovelace card for Home Assistant: a 3D model of the flat with entities bound to objects. React + Three.js, Vite in lib mode building a single `dist/card.js`. See `docs/DEVELOPMENT.md` for the local Home Assistant setup and the full reference; `README.md` is the short public pitch and install guide for people who are not developers.

- Package manager: pnpm. `pnpm build` runs tsc and vite, `pnpm lint` runs oxlint, `pnpm watch` rebuilds on change.
- Styling: Tailwind v4, injected into the card's shadow root from `src/index.css`. Use the `cn` helper from `src/lib/utils.ts`.
- `dist/` is bind-mounted into the Home Assistant container. Never empty it from the build config.
- Write in plain sentences. Never use em dashes, in code comments, commit messages, or docs.
- When giving the user card YAML, always give the complete card config, never a fragment to merge.
- Dev pages and previews open on a dark background, a dark gradient or a dark grey, never white, and with Home Assistant's dark theme where the page has one. A light version is only ever opt in, through a query parameter.
- `showroom.yaml` is a card with every decoration kind in its own row and each of its styles along it, at default sizes and colors. Run `pnpm showroom` to regenerate it after any change to the catalog, and commit it with that change. Do not send it to the user.

## Changelog

`CHANGELOG.md` follows Keep a Changelog. It is for people who use the card, not a record of every change: it should stay short enough to read calmly and be understood in full. Only a change a user would clearly notice, and that is not a small detail, goes under `## [Unreleased]`, in the same commit as the change. Small tweaks to spacing, sizes, colors, wording or polish of something already there do not go in, and several related changes are best told as one entry. When an entry for the same feature is already under Unreleased, change that entry rather than adding another. A new feature or piece goes under `### Added`, a change in behavior under `### Changed`, a bug fix under `### Fixed`, something taken away under `### Removed`. Write each entry as one plain sentence about what the user sees, not about the code. Internal refactors, tooling and dev pages do not go in. Never add a version heading by hand: the Release workflow moves the Unreleased entries under the new version when it publishes.
