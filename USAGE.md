# Usage

One row per agent session. In Gemini CLI, type `/stats` before you quit and copy the input and output tokens. Copilot shows credits instead of tokens: write those in the credits column. The free tier charges nothing, so record what the session **would cost at the provider's published list price**, and note once below the table which price list you used. Leave the cost empty for rows that only show credits.

| Date | Tool | Input tokens | Output tokens | Credits (if no tokens) | List-price cost |
|---|---|---|---|---|---|
| 2026-10-19 | Gemini CLI | 1 790 | 41 | | $0.002 |
| 2026-10-19 | Gemini CLI | 41 439 | 269 | | $0.01 |
| 2026-10-19 | Gemini CLI | 41 439 | 428 | | $0.03 |
| 2026-10-20 | Gemini CLI | 46 500 | 6 800 | | $0.22 |
| 2026-11-16 | Claude (Opus 5.5) coding agent | ~16 000 000 (about 15 700 000 of them cache reads | ~100 000 | ~$6.60 |
| 2026-11-17 | Claude (Opus 5.5) coding agent | ~9 000 000 (about 8 800 000 of them cache reads) | ~45 000  | ~$3.70  |
| 2026-11-17 | Claude (Opus 5.5) coding agent | ~11 000 000 (about 10 800 000 of them cache reads) | ~55 000 | ~$4.30 |
| 2026-11-17 | Claude (Opus 5.5) coding agent | ~7 000 000 (about 6 850 000 of them cache reads) | ~35 000 |  ~$2.80  |

Price lists used: Gemini rows at Google's Gemini API list price on the session date. The Claude rows at Anthropic's list price for Claude Opus 5.5 checked on 2026-11-16: $4 per million input tokens, $0.20 per million cache-read tokens, $5 per million cache-write tokens, $20 per million output tokens. Those sessions showed no token counter, so their numbers are estimates from the number of agent turns and the context size per turn.
