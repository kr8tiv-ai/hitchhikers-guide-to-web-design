# Vendored GSD repositories

These are exact snapshots (`git archive HEAD`, tracked files only, upstream `.git` removed so the files live inside this repo) of the Open GSD projects. Upstream org: https://github.com/open-gsd

| Folder | Upstream | Commit | License |
|---|---|---|---|
| `gsd-core/` | https://github.com/open-gsd/gsd-core.git | `13d37238ba08377929e4850fd6ae4b8db49a22ca` | MIT License |
| `gsd-path/` | https://github.com/open-gsd/gsd-path.git | `565e40a9b0b7b08b3d7cb3a4b722d52c476d700d` | MIT License |
| `gsd-pi/` | https://github.com/open-gsd/gsd-pi.git | `8317811cf34e69c4add8eaa9deb28c17721b768e` | MIT License |
| `gsd-spec-build-loop/` | https://github.com/open-gsd/gsd-spec-build-loop.git | `f6a0ae9a0d665c48f7c73e01097b11cd8aa72b43` | MIT License |

`vendor/gsd-core/` (MIT, v1.7.0) is the backbone for the Guide's spec files and workflow (agents/, commands/gsd/, gsd-core/templates/, gsd-core/workflows/, gsd-core/references/).

Note: 3 symlinks inside `gsd-pi/src/resources/extensions/gsd/tests/__fixtures__/legacy-import-corpus/` were dropped because Windows checkouts can't represent them; they are test fixtures only.
To refresh a snapshot: clone the upstream repo, `git archive HEAD | tar -x -C vendor/<name>`, and update the commit above.
