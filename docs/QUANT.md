# Quant in DeskOps

Open **Quant** in the main menu, or visit `/quant`. The page connects to the
research agent in `multigate-backtest/agent/quant`, with the same Qwen model,
configuration tools and backtest engine used by terminal chat.

## Using the page

- Ask questions or describe configuration changes in the conversation. Enter
  sends; Shift + Enter adds a line. Tool results appear as expandable action cards.
- Choose an experiment on the right to give the next message context. Newly
  created experiments are selected automatically. The selected strategy, gate,
  dates and revision are visible before running it.
- **Run backtest**, **Generate matrix** and **Start research** call the existing
  tools directly, without asking the model to choose identifiers or revisions.
  Research uses that experiment's saved limits, metrics and parameter ranges.
- **Stop research** remains available during execution. A stop request may take a
  moment to finish the active operation; the page reports the actual worker state.
- Research completion, failed evaluations and whether the performance target was
  met are shown separately. The latest backtest includes its actual date window;
  it may be a development or validation slice of the experiment.
- Use **New chat** or the conversation selector to return to a saved conversation.
  Reloading or leaving the page does not cancel an accepted chat or backtest.

Ollama must be running on the configured host for model requests. The connection
badge checks both the service and whether Quant's configured model is installed.
Direct experiment controls do not require a model response, except that research
needs the model when it reaches a proposal step. Restarting a chat is unnecessary
after prompt changes: each new web turn loads the current authoritative prompt.

Model proposals can still contain mistakes. Action cards retain rejected requests
and the actual saved configuration; the GUI does not silently substitute another
strategy or rewrite the model's results. The ORB starter supplies the exact
strategy and gate identifiers.

Quant allows 10 minutes and up to 4,096 output tokens per model response. If
Ollama cannot parse a native tool response, the chat shows a recovery notice and
requests a structured tool selection followed by complete arguments. It resumes
from recorded results using the existing validators and duplicate-call protection.
Malformed or truncated arguments are never executed; one correction attempt is
allowed before reporting failure. A recovered turn can therefore take longer
than one model response. These settings live in Quant's YAML.
For Qwen 3.5, structured requests enable thinking to work around older Ollama
versions ignoring the JSON schema when thinking is disabled. Only the resulting
answer/tool arguments are retained; the thinking text is discarded.

## Implementation and saved files

- `apps/web/src/routes/quant/+page.svelte`: page, polling and controls.
- `apps/web/src/routes/api/quant/+server.js`: same-origin JSON endpoint. GET is
  read-only; POST accepts only the explicit supported operations.
- `apps/web/src/lib/server/quant.js`: launches the repository's existing virtual
  environment with a fixed Python module, passing JSON on stdin without a shell.
- `../multigate-backtest/src/quant_web.py`: durable conversation transport. It
  delegates chat to `quant.chat_reply` and actions to `quant.execute_chat_tool`.

No additional service or port is required. DeskOps resolves the Gulfchain root
with its existing helper and starts the bridge in `multigate-backtest` using that
repository's `.venv/bin/python`. Quant's YAML model continues to take priority;
the generic DeskOps LLM panel's model setting does not replace it.

Browser conversations are stored under `multigate-backtest/runs/quant/web/<id>/`
(derived from the configured chat directory): `session.json`, `transcript.jsonl`,
`requests/<id>.json` and `worker.log`. Terminal transcripts remain in their
existing location. Only the selected conversation ID and experiment preference
are saved in browser storage; canonical model/tool history stays on the server.

Each accepted request has a persistent ID. An HTTP retry with the same ID and
content returns the existing state; a conflicting reuse or concurrent new turn
is rejected. Workers survive HTTP disconnects. Interrupted workers are shown as
interrupted, with earlier actions retained. A read-only experiment snapshot uses
the existing immutable revision and status readers, so status can refresh while
the engine holds its execution lock. Configuration writes retain their locks and
revision checks.

Request IDs use `crypto.getRandomValues` so chat and action buttons also work in
browsers and HTTP LAN contexts that do not expose `crypto.randomUUID`. If a tab
still shows the old `randomUUID is not a function` error, refresh it to load the
updated page. The ID format and retry protection are unchanged.

The page renders model text as escaped text and tool data as escaped JSON. POST
requests reject foreign origins and non-JSON bodies. Existing DeskOps host/network
access determines who can use the page.

This page supports SPY underlying research. It does not add options execution,
live brokerage trading, model-weight training or a second backtesting engine.
