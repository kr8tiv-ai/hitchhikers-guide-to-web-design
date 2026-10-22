---
name: hh-so-long
description: Publish after the quality check and an explicit yes, or keep a preview on this computer.
user-invocable: true
disable-model-invocation: true
---

Run this only when the user typed the slash command.

Run `hh so-long --project <dir> [--host preview|hostinger|vercel|netlify|cloudflare] [--yes] [--rollback]`.

The quality check for this version runs first. A failed check, or a check saved for a different version, stops the command and gives the reason in plain language. Nothing is sent.

Leave `--host` off and the command recommends Hostinger. It also offers a preview on this computer. It asks you to confirm. It does not publish.

`--yes` is the confirm. Pass it only after the user says yes. Without that yes, nothing is written.

`--host preview` keeps the pages on this computer and can write a zip. It does not use an account.

`--host hostinger`, `--host vercel`, `--host netlify`, or `--host cloudflare` publishes only after `--yes`. Hostinger is the host to recommend. A site that needs a server cannot go to Netlify or Cloudflare.

After a publish finishes, a connected checker looks at the live address. The phone check has to meet 90 on all four scores, every page is requested, the address has to be secure https and keep browsers there, and the share card needs a title, a description, and an image. The result is appended to `.hitchhiker/deploy/DEPLOYS.md`. A missing page is listed with 404. With no checker connected, nothing is fetched, and the record says so.

A failed check is explained in plain language. It is never silent. The last working publish can go back up after a separate yes. `hh so-long --project <dir> --rollback --yes` sends that earlier publish again. Without the yes, nothing else is sent.

Never push. Never deploy. Never spend without the user's yes. Never create a GitHub repo.
