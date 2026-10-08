# Live dogfood

Opt-in end-to-end run for a small Towel and Tea site. It is not part of CI.

The script spawns real `grok` sessions only when `HH_LIVE` is exactly `1`. Any other value, including an unset variable, exits without writing a report and without starting a model.

```powershell
$env:HH_LIVE = "1"
node --experimental-strip-types evals/dogfood-live/run.ts
```

On a live run the script writes `evals/dogfood-live/REPORT.md`. The table has one row per prompt: exit code, duration in milliseconds, and input and output token counts. Those numbers feed prompt 118. The site files stay in a temp directory and are removed when the script finishes.

A Grok usage limit pauses that temp drive queue, stops the remaining prompts, and still writes the report. Leave `HH_LIVE` unset on CI and on every normal test run.
