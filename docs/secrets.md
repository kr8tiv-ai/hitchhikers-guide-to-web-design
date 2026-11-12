# Where keys live

A real key does not belong in this repository. Put it in the OS keychain, or in `.env.local`. The root `.gitignore` ignores `.env`, `.env.local`, and every `.env*` name, so git does not take the file.

`scanText` in `packages/qa/src/secrets.ts` checks text for three shapes and returns each hit as a rule name and a character index. The check is a local test over a fixture. It does not open a socket.

The shapes are:

- The prefix `xai-` plus at least eight letters or digits. The prefix by itself is safe to write. `xai-abc` is too short to count.
- The authorization scheme Bearer, then a token of at least eight characters. The scheme word alone is not a token.
- A PEM banner for a private key. The scanner looks for that uppercase banner, three words with a single space. This page does not print the banner.

Command policy still denies `git push` and deploy commands such as `vercel --prod`. The release test calls `evaluateCommand` and expects a deny.

Do not commit a real key to prove the scanner.

## The xAI key for Imagine

The default sketch path is the Grok CLI you are already signed in to. It needs no key. `hh doctor` says `Using your Grok sign-in` for that path.

When you want the billed API path, the key is the environment variable `XAI_API_KEY`. If that variable is empty, the next place is the OS keychain: service `hitchhikers-guide`, account `xai`. The environment wins over the keychain. A project file is never a source, and neither is the `.hhproject` save. `hh doctor` adds `API ready` when a key is present in either place. It does not print the key, and it does not store the key on the report.

The desk settings screen has one Imagine checkbox, for the embedded browser. Saving it keeps whatever `api` flag is already in the file. It does not turn the API path on.

To turn the API path on, edit `.hitchhiker/assets/media.json` in the project and set `"api": true`. A missing file is the same as this:

```json
{
  "order": ["grok-cli", "browser", "api"],
  "browser": false,
  "api": false
}
```

`grok-cli` stays first until you change `order`. Page sketches on the desk always start the signed-in CLI and do not attach the billed key, even when `api` is true. Section stills read the key when `api` is true. A motion clip uses the API only when no CLI spawn is passed, `api` is true, the order includes `api`, and a key is present.

`imagineBudgetUsd` in `.hitchhiker/config.json` defaults to 0. An API motion quote does not fit until that cap is raised. The prices for one typical site are in [imagine-first.md](imagine-first.md).
