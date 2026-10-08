# Where keys live

A real key does not belong in this repository. Put it in the OS keychain, or in `.env.local`. The root `.gitignore` ignores `.env`, `.env.local`, and every `.env*` name, so git does not take the file.

`scanText` in `packages/qa/src/secrets.ts` checks text for three shapes and returns each hit as a rule name and a character index. The check is a local test over a fixture. It does not open a socket.

The shapes are:

- The prefix `xai-` plus at least eight letters or digits. The prefix by itself is safe to write. `xai-abc` is too short to count.
- The authorization scheme Bearer, then a token of at least eight characters. The scheme word alone is not a token.
- A PEM banner for a private key. The scanner looks for that uppercase banner, three words with a single space. This page does not print the banner.

Command policy still denies `git push` and deploy commands such as `vercel --prod`. The release test calls `evaluateCommand` and expects a deny.

Do not commit a real key to prove the scanner.
