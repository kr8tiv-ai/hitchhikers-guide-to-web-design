# Towel and Tea site prompts

The calm fixture is three pages (home, work, visit), one css-scroll hero mark, a contact form, the Resend integration, sitemap and JSON-LD, and the Astro stack. `generateSkeleton` turns that fixture into 50 to 150 prompt entries. `authorPackage` writes each body from the matching golden template, the cited CONTEXT.md anchors, the knowledge packs, and the template paths. `validatePackage` gates the finished package.

The engine test `packages/engine/test/author.test.ts` authors that package with a scripted `think()` and asserts the validator accepts it. The prompt files are not checked in. A checked-in copy would pad the repo and drift from the skeleton.

Five of the authored bodies name their own files and a concrete value: the nav bar, the hero still, the css-scroll duration, the credits row, and the deploy token. A second failure on one entry is marked needs-human and is not written as ready.
