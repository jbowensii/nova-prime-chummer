# Gossipcat: why ChatGPT (gpt-reviewer) timed out, and the fix

Date: 2026-10-19. Gossipcat v0.8.1 (v0.9.1 available). Agent: `gpt-reviewer`, provider `openai`, model `gpt-5.5`.

## Bottom line

ChatGPT is working. The failure was not the connection, the key or the quota. Gossipcat stops any single
OpenAI request after **120 seconds**, and the first task let ChatGPT pile so much file text into its
conversation that one reply took longer than that. With a smaller job it finished in 131 seconds with
8 good findings.

Two things need fixing:

1. **The limit itself.** It is hard-coded to 120 s for OpenAI. Other slow providers in the same file get 600 s.
2. **How much we let ChatGPT read.** Nothing stops it reading whole large files. Everything it reads stays in
   the conversation, so each later request is bigger and slower.

## What happened (from `.gossip/mcp.log`)

| | First attempt (task 7498f34f) | Smaller retry (task ef25b57c) |
|---|---|---|
| Job | All 371 rows + "read effects.py" | Rows #1-190, "grep, don't read effects.py whole" |
| Files read into the chat | 11 reads, about 360,000 characters (dataset + effects.py in chunks) in its first 3 turns | Targeted reads |
| Size of the last request | about 110,000 tokens | 70,000 tokens |
| Slowest single request | over 120 s, so it was cut off (turn 7, 10:11:24 to 10:13:24, exactly 120.0 s) | 75 s |
| Result | `TimeoutError: The operation was aborted due to timeout` after 180.7 s total | OK, 131 s, 8 findings |

It also wasted one turn trying to run `python3`, which the relay's shell does not allow (allowed: npm, npx,
node, git, tsc, jest, ls, wc, echo, pwd, which).

## Where the limit lives

In the installed bundle `%APPDATA%\npm\node_modules\gossipcat\dist-mcp\mcp-server.js` (v0.8.1):

- `OpenAIProvider` constructor: `this.timeoutMs = timeoutMs ?? 12e4;` (line 8296). Used as
  `signal: AbortSignal.timeout(this.timeoutMs)` at lines 8345 and 8400.
- `createProvider`, `case "openai"` (line 7955) passes `void 0` for the timeout, so OpenAI always gets the
  120 s default.
- The same function gives `deepseek`, `grok` and `openclaw` `6e5` (600 s). Its own comments say the 120 s
  default kills long reasoning-model replies. GPT-5.5 is a reasoning model too.
- No config setting in `.gossip/config.json` controls it.

## The fix

### 1. Raise the OpenAI request limit (bundle patch, same style as the temperature patch)

Back up `mcp-server.js` first (`mcp-server.js.bak-20261019`). Then, in `case "openai"`, change the sixth
argument from `void 0` to `6e5`:

```js
// before
return new OpenAIProvider(apiKey ?? "", model, projectRoot, baseUrl, baseUrl ? `openai:${baseUrl}` : void 0, void 0, void 0, authSlot);
// after: 600 s, like deepseek/grok
return new OpenAIProvider(apiKey ?? "", model, projectRoot, baseUrl, baseUrl ? `openai:${baseUrl}` : void 0, 6e5, void 0, authSlot);
```

Reconnect the MCP server (`/mcp`) so it reloads. Like the temperature patch, this has to be re-applied after
every gossipcat update. First check whether v0.9.1 already fixed it. If it did, upgrade instead.

The tool-call wrapper also has its own 180 s limit (`gossip_collect` timed out at 180 s today). That limit
belongs to Claude Code, not gossipcat, so use short `timeout_ms` values and collect in more than one call.

### 2. Keep ChatGPT's reading small (a skill, not an instructions edit)

Gossipcat's rule is to fix agent behaviour with a bound skill, not by editing `instructions.md`. Add a
`context-budget` skill bound to `gpt-reviewer`. It should say:

- Grep first, and read only the line ranges the grep points to (at most about 300 lines per read).
- Never read a file over 50 KB whole. Never read the same range twice.
- Stop reading at about 60,000 tokens of material and write the findings from what you have.
- The shell has no Python. Use `node -e` or `wc` for counting.

### 3. Size the dispatch calls for ChatGPT

When dispatching to `gpt-reviewer`:

- Give it at most about 60,000 tokens of material. Split big datasets into ranges (for example rows 1-190 and
  191-371) and send them as two tasks.
- Name the files and functions to look at, and say "grep, don't read whole files".
- Cap the output ("max 8 findings") so the last reply stays short. A long final answer is the slowest call.

Gemini handled 160,000 tokens without trouble here. These limits are for ChatGPT only.

## Side note

During the read-only task, Gemini made two `file_write` calls (36 and 39 characters). No repo file changed.
They look like its scratch notes or refused writes. Worth a look if it happens again on a read-only task.
