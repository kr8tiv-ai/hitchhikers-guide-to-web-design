---
name: seo
description: One title, one description, one h1, crawlable text, and no invented search volumes or citation promises.
when-to-use: Use when mapping a page, writing a title and description, adding schema, or briefing a post.
paths:
  - packages/knowledge/packs/seo/SKILL.md
---

# SEO

Write from the page that exists and from facts the client already gave. Do not invent a search volume, a rank, or a citation. If a number is missing, say it is unknown.

## Title and description

Each indexable page has one title, one meta description, and one h1. The title names the page. The description says what the visitor gets. The h1 matches the page's one idea. Do not add a second h1 to please a tool. Each page also has a canonical URL that points at that page.
Source: CONTEXT-PACKAGE.md
Source: hh-build-plan/RESEARCH-ADDENDUM.md section 9.

The words of the page must be in the HTML. A canvas, a WebGL scene, or a picture of a headline does not count. Repeat the offer as crawlable text. A meaningful image has a text alternative. A link points at a page that exists.

When the stack template already ships a sitemap and a robots file, keep those files. Do not invent a second set. When the stack is Astro, put the title, the description, and the canonical in the document head the template already uses.

Search Central is the baseline for a rule this pack does not state. Do not invent a ranking factor to fill a gap.
Source: https://developers.google.com/search/docs
Source: hh-build-plan/RESEARCH-ADDENDUM.md section 9.

## Keywords and posts

A phrase belongs on a page only when the client named it or it already appears on a page in the project. Map that phrase to one page. Do not estimate how often people search it. Search volumes are not estimated.

A blog brief uses a topic the client named and the page that topic supports. Leave the volume unknown. Do not write a count of searches.

## Schema and local facts

Use a type only when the page is that thing: Organization, LocalBusiness, Product, BlogPosting, or FAQPage. FAQPage is allowed only when the page is a real FAQ the client wrote. LocalBusiness needs a real address the client gave. Do not invent questions, hours, a service area, or a place.
Source: https://schema.org/
Source: hh-build-plan/RESEARCH-ADDENDUM.md section 9.

## Answer engines

Write the entity, the offer, and the checkable facts in plain sentences. Keep one h1. Add a FAQ only when it is real. This is a writing practice. It does not promise that an answer engine will cite the page. Do not tell the client the page will be cited.
Source: hh-build-plan/CONTEXT-PACKAGE.v2.md section 8.3 module 4.
Source: hh-build-plan/RESEARCH-ADDENDUM.md section 9.

## Competitors

Read titles, descriptions, and headings on the pages you were given. Name three visible differences. Do not fill a gap with a search volume.

## Lab targets

Recorded lab targets, not re-fetched for this pack: LCP at most 2.5 seconds, INP at most 200 milliseconds, and CLS at most 0.1, at the 75th percentile.
Source: hh-build-plan/RESEARCH-ADDENDUM.md section 9.
Source: https://web.dev/articles/vitals

Method from Matt Haynes's AntiHero guides (antihero.community), used with permission. Sentences in this pack are original.
