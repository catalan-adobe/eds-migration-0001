// The two prompts of a run: the lead agent's (the skill, a domain, the operator's policy,
// the model tiers, where to stop) and the retrospective's. The lead is told only what the
// skill cannot know: that it runs headless, which models to use, and the harness's policy.

/** What the lead agent is asked to do. */
export function leadPrompt(config) {
  const { models } = config;
  const scope = config.scope ? ` with the scope ${config.scope}` : '';
  return `Run the analysis phase of a website migration to EDS for ${config.domain}${scope},
in this project, with the migration-pipeline skill (its SKILL.md and the step briefs it
points to are your instructions). Plan ${config.pages} pages: \`init --pages ${config.pages}\`.

The operator — the person the skill says decides at the gates — is not here. These are
their words, for every gate and every question: "${config.operator}" Record them as the
operator's note where the skill asks for one.

System 1 (triage, structure) needs an env file: ${config.s1Env}. Pass it as
\`node --env-file=${config.s1Env} …\`. Never read it.

Models. You are ${models.lead}. Each step brief names its tier. Run a \`medium\` step's work
on ${models.medium} and a \`low\` step's on ${models.low}: when that is not you, hand the
step to an agent through the workflow tool — \`agent(<the brief, the paths and what the step
needs>, { model: '<model>' })\` — then check the step in \`pipeline state --text\` yourself.
Always call the workflow tool with \`background: false\`: this session has no person to come
back to it.

Headless. A step's worker runs detached; wait for it with \`sleep 60\` between two
\`pipeline state --text\`, never in a tighter loop.

Where to stop. When discover, access, cache, chrome and triage are done:
\`pipeline sample --count 10 --write judge-10\`, then \`pipeline structure judge-10\` (System 1
env), then \`migration.mjs structure-review judge-10\`, then the report step. Then write one
note — \`migration.mjs note report agent "<what you did, what you could not, what you
decided and why>"\` — and end. If you cannot go on, write that note with why, and end.`;
}

/** What the retrospective agent is asked to write. */
export function retroPrompt(config, paths) {
  return `You are reviewing an end-to-end run of the migration-pipeline skill by an agent.
Read, in this order: the run's config ${paths.config}; the result checks ${paths.result};
the monitor log ${paths.monitor} (one line a minute: state of the steps, cost, tool calls);
the agent's session transcript under ${paths.sessions}; the project's notes
(${paths.project}/migration/notes/) and state (\`node ${paths.project}/.agents/skills/
migration-pipeline/scripts/pipeline.mjs state --text\`); the step briefs under
${paths.project}/.agents/skills/migration-pipeline/steps/.

Write ${paths.retro}, in this form:
1. Outcome — success or not by the result checks; where it stopped and why.
2. Timeline — per step: start, end, minutes, cost, model(s), retries.
3. Departures — every place the agent did something a brief does not say, or skipped what
   one says; quote the transcript.
4. Briefs — every brief that was missing, ambiguous or wrong for what happened; what to add.
5. Failures — every error, what the agent did, whether it was right.
6. Artefacts — the result checks, and what you see in the data that the checks miss.
7. Models — what each model did well or badly on its steps.
8. Changes — the smallest changes to the skill that would have made this run succeed or
   cost less, most valuable first.
Facts with their evidence (a transcript line, a file); no praise, no padding.`;
}
