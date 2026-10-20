# Releasing ego-jev

Each step ends on the check in its last sentence.

1. **Gates.** `npm run typecheck && npm test` pass, and
   `node docs/bench/eval/run.mjs 5` prints PASS for every case. If Google
   changed its home page, recapture first (see
   [Decision eval](bench/README.md#decision-eval)) and recheck `expect`.
2. **Version.** Bump `skills/ego-jev/SKILL.md` `metadata.version`,
   `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`;
   `test/release.test.ts` fails until all three agree. Minor for new options or
   behavior changes, patch for fixes.
3. **Docs.** README, SKILL.md and `skills/ego-jev/reference.md` describe every
   changed behavior. Check each claim about TypeSafe API behavior (models,
   headers, question types) against docs.typesafe.ai before writing it.
4. **Notes.** Draft release notes in the format of the previous release
   (`gh release view <last-tag> --json body -q .body`): Added / Changed /
   Fixed, a test count and the eval results.
5. **Publish.** Commit with `ai-commit generate`, fast-forward `main` (it may
   be checked out in another worktree; leave its untracked files alone), tag
   `vX.Y.Z` on that commit, `git push origin main vX.Y.Z`, then
   `gh release create vX.Y.Z --notes-file <notes> --verify-tag`. CI on `main`
   is green.
6. **Read back.** `gh release view vX.Y.Z` is Latest and not a draft; the
   version at the tag reads back through `gh api .../contents/...?ref=vX.Y.Z`.
7. **Local install.** `npx skills update ego-jev -g`, then
   `diff -r ~/.agents/skills/ego-jev skills/ego-jev` shows no difference.
   Already-open agent sessions keep the old SKILL.md until restarted.
