# Draft issues for gossipcat-ai/gossipcat-ai

Drafts only; nothing is posted. Seen on gossipcat 0.9.1 (Windows, Claude Code host). A search of the tracker found no open duplicate. The closest are #126 and #520, both closed.

## 1. Reasoning-model check misses gateway-prefixed names

`isReasoningModel()` uses `/^gpt-(?:[5-9]|[1-9]\d)/i` and `/^o[0-9]/i`, so a name routed through a gateway, such as `openai/gpt-5.5`, does not match.

**Effect:** temperature 0 is sent, and the upstream answers 400: "Unsupported value: 'temperature' does not support 0 with this model." On 0.8.1 this silently produced 0 cross-review entries. On 0.9.1 the `TEMPERATURE_UNSUPPORTED_RE` retry appears to recover, at the cost of one failed request per call.

**Suggested fix:** test the part after the last `/`: `model.split('/').pop()`.

## 2. The `openai` provider has a 120 s timeout, unlike `openclaw` and `deepseek`

`createProvider` passes 600 s for `openclaw` and `deepseek`, but `case "openai"` passes `undefined`, so `OpenAIProvider` falls back to 120 s. This case also serves local OpenAI-compatible servers (llama.cpp), which are the slowest.

**Effect:** `FATAL ERROR in executeTask: TimeoutError: The operation was aborted due to timeout (code=23)` on a turn that was still generating normally.

**Suggested fix:** use 600 s when a `base_url` is set, or add a per-agent `timeout_ms` setting.

## 3. Non-streaming calls die at Node's 300 s headers limit

Requests use `fetch` without streaming, so undici's default `headersTimeout` of 300 s applies whatever `AbortSignal.timeout` is set. A local model at about 41 tokens per second that writes over 12,000 tokens fails with `HeadersTimeoutError (code=UND_ERR_HEADERS_TIMEOUT)`, even with a 600 s provider timeout. The task fails after all its earlier turns are spent.

**Suggested fix:** pass an undici `Agent` with `headersTimeout` matching the provider timeout, or stream.

## 4. A context-size error kills the task

llama.cpp returns 400 `exceed_context_size_error`, with `n_prompt_tokens` and `n_ctx` in the body. gossipcat raises it as a fatal error and an `unhandledRejection`, and records a failure signal against the agent, though the cause is server configuration.

**Suggested fix:** recognise this error, say which setting to change, and don't count it against the agent's accuracy. Optionally trim the context and retry.

## 5. `resolutionRoots` does not reach relay workers' file tools

With `resolutionRoots: ["<worktree>"]`, relay workers can't read that path: `Path "..." resolves outside project root`. They can then fall back to the same relative path in the main checkout and review stale code without saying so. In one run a reviewer reported defects from an older README, and nothing in the result showed that the requested file had been refused.

**Suggested fix:** add the roots to the workers' allowed roots, and fail the task clearly when an explicitly named path is refused.

## 6. A reply that is only working notes counts as a completed task

Gemini sometimes returns only thinking-aloud text ("Let me look at..."), with no findings. The task is recorded as completed, and synthesis shows nothing, so a reviewer that did no review looks the same as a reviewer that found nothing wrong. A cross-review reply of prose instead of JSON has the same effect: `parsed to 0 entries`. This was seen on 0.8.1 and not repeated in the 0.9.1 tests, so it may be intermittent.

**Suggested fix:** flag a task result with no `agent_finding` block and no explicit "nothing found", and retry once.

## 7. `gossip_collect` outlasts the host's tool timeout

Synchronous collect can run longer than the MCP client's default limit. Claude Code stopped it at 180 s even when given `timeout_ms: 15000`, and it did the same at 900 s with `MCP_TOOL_TIMEOUT` raised. The tasks had finished or were still running, but the results didn't come back in that call; a later collect worked in some cases.

**Suggested fix:** honor `timeout_ms` strictly and return partial results with a "still running" note.
