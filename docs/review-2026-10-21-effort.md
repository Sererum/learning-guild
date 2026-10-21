# AI effort review · 2026-10-21

Scope: application-local Codex CLI requests and the selected profile's controls. No real learner profile, global Codex configuration, account credentials, or course content was changed for this review.

## Findings and implementation

1. Lesson preparation and program changes had fixed Extra high; the settings page described them but could not change them. Tutor requests had a separate three-level validator. Shared-rule review silently used the CLI wrapper's Medium default. There are now seven explicit roles, each accepting only the strings `low`, `medium`, `high`, `xhigh`.
2. New `settings.json.aiEfforts` preserves the previous defaults and unrelated settings. Missing values receive defaults without writes. Partial changes, three explicit presets (all Medium, all Extra high, original defaults), restart persistence, and rejection of unknown roles/values are covered. These settings are scoped to the existing course/profile binding.
3. Each actual model boundary resolves the current role. Tutor help/review use separate defaults; lesson analysis/generation/independent review use separate defaults; all three stages of a voluntary program change use the program setting; shared-rule review has its own setting. Cached completed stages keep their results and recorded effort; new stages use the current choice. Tutor cache keys already include effort.
4. Settings and the program request page display the current selection. Runtime model-policy metadata also reflects the selected profile. The workbench no longer sends a fixed Medium override (coordinated with editor review).
5. Known account-limit and unsupported-effort failures become safe actionable messages. Classification happens in memory; raw provider error bodies are not saved or exposed. An account limit does not consume a material-correction retry. Explicit resume retains completed stage checkpoints and independent author audits. Existing local budget reservation/settlement remains in force for every new provider request.
6. Local daily budgets are explicitly distinguished from account limits. The application does not infer account balance or promise unlimited Medium use.

| Setting | Covered calls | Default |
| --- | --- | --- |
| tutorHint | Help after failed tests | Medium |
| tutorReview | Quality review and follow-up after passing tests | Medium |
| personalization | Lesson feedback analysis | Extra high |
| lessonGeneration | Lesson generation and correction | Extra high |
| lessonReview | Independent lesson review | Extra high |
| program | Program-change analysis, generation, independent review | Extra high |
| sharedRuleReview | Independent review of a proposed common rule | Medium |

## Verification

- Focused run: **71 tests passed** across effort settings/policy, tutor guards, Codex events, adaptation, program requests, generation budget, shared standards, profile governance, settings rendering, and API integration.
- Medium lesson and program pipelines execute reference/example checks and independent task audits before publication; synthetic provider-limit interruption resumes only the unfinished independent review. Rewards and source progress remain unchanged.
- The CLI process-boundary test captures actual arguments for all four levels; read-only mode and disabled tools remain present. This uses a local fake executable, not a paid model request.
- Settings API saves and survives a real server restart on an ephemeral loopback port. Invalid values leave stored settings untouched.
- Browser check on an isolated synthetic profile passes: seven selects, all Medium, individual Low/High edits, reload persistence, all Extra high, restore defaults, unrelated controls, and five sections at 390px width without horizontal overflow.
- Python validation used the existing Python 3.12 runtime and the system executor; no dependency installation or new environment.

## Official documentation and limits

Local bundled CLI inspected: `codex-cli 0.163.0-alpha.10.2`; `exec --help` confirms a per-invocation `--config key=value` override and `--output-schema` support. The app continues to invoke `--config model_reasoning_effort="…"` per request.

Official OpenAI sources retrieved on 2026-10-21:

- [Configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference): `model_reasoning_effort` is advertised by the selected model; examples include low, medium, high, xhigh; availability depends on the model/client.
- [CLI developer commands](https://learn.chatgpt.com/docs/developer-commands?surface=cli): command-line configuration overrides and noninteractive execution flags.
- Original official entry points redirect to those pages: [Codex configuration](https://developers.openai.com/codex/config-reference/) and [CLI reference](https://developers.openai.com/codex/cli/reference/).

The tests prove routing, persistence, validation gates and recovery, not equal output quality across levels or availability in every account/model. No real paid model request was made. Unknown provider failures retain the existing generic retry message. Higher effort may increase time/usage; exact account quota and reset time are not available through this application's process output. Extra high is the maximum exposed by this application, not a claim about every possible model's maximum.
