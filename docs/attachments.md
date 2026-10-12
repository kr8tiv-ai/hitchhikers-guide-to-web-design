# Attachments

Some interview questions ask for a website, a logo, a photo, or a file. Those cards show a bounded drop zone and an Attach button. Questions that do not ask for either show neither.

## Where files go

Files stay on this machine, inside the project:

`<project>/.hitchhiker/uploads/<question-id>/<stored-name>`

The stored name is a sanitized base name. Directory parts, control characters, and leading dots are removed. A collision gets a numeric suffix (`mark-2.png`). The answer records the project-relative path. The page never receives an absolute path.

A link is stored as text in the answer, for example `Links: example.com`. The desk does not fetch, screenshot, or open a dropped URL.

## How to add them

Drag files onto the zone, or use Attach. Attach opens the system picker and accepts more than one file. It does not force the camera. On a phone, Attach is the way in.

Paste an image onto the card and it is named `pasted-image-<time>.<ext>`. Paste a link, or several links separated by spaces or newlines, on a website question. You can also type a link and press Add or Enter. A bare hostname gets `https://`. Only `http` and `https` are kept.

A link dropped from a browser (`text/uri-list` or plain text) is accepted. A dropped `.url` or `.webloc` shortcut is read on this machine for its URL line. The shortcut file itself is not stored.

## Caps and types

| Cap | Value |
|---|---|
| One file | 25 MB |
| Files on one answer | 8 |
| Links on one answer | 12 |
| One attach request | 200 MB (8 × 25 MB) |

A request larger than 200 MB is refused before anything is written. A single file over 25 MB is refused on its own, and the other files in that drop still save.

Images: PNG, JPEG, WEBP, GIF, SVG, AVIF. The server checks the leading bytes, so a renamed program is refused.

Other files: PDF, TXT, MD, DOCX. Zip and audio are not accepted on this control. Push-to-talk still uses its own route.

A wrong type names the file and the kinds that question accepts. The typed draft and the chips that already saved stay put. A failed upload can be retried. Answer waits until the upload finishes, and a failure turns it back on.

## What the answer stores

The saved answer is still one text value. Files and links are a short line at the end, for example `Attached: tins.jpg, logo.svg. Links: example.com`. An answer that is only that line is accepted by the desk. The logo questions also keep the existing logo pointer the brand plate reads.