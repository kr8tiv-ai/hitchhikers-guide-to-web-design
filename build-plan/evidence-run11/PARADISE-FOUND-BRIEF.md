# Paradise Found: Customer Brief for the Desk

> **EXAMPLE CONTENT.** Paradise Found is a test persona for an end-to-end run of the Hitchhiker's Guide desk. Listings, names, prices, people and quotes are invented. Nothing here is legal, tax or immigration advice. Every legal point is phrased as "work with a licensed Costa Rican lawyer", and the site must do the same.

## 1. The business in one breath
Paradise Found helps expats, mostly from the US and Canada, buy ocean-view farms in Costa Rica and build their own piece of paradise: eco-built homes, food they grow themselves, a life lived off the land, and freedoms they couldn't have back home. Local farmers can live on the land for free as caretakers. Buyers and sellers close directly with suggested independent Costa Rican lawyers, so there are no middlemen.

**Tagline:** Paradise Found. Find your calm.
**Vibe:** surreal, cool jungle, uplifting, aspirational. Calm, not salesy.

## 2. Brand assets (files sit next to this brief)
| File | What it is |
|---|---|
| `paradise-found-mark.png` | The mark: a thin crescent arc over a horizon line |
| `paradise-found-logo.png` | Full logo on white: mark, "PARADISE FOUND" in widely spaced caps, "Find your calm." underneath |
| `paradise-found-hero.jpg` | Hero photo: green pasture with horses, a farmhouse, an ocean sunset |

Never change: the crescent-over-horizon mark, the widely spaced caps, the tagline wording.

### Colors (taken from the hero photo)
| Role | Name | Hex |
|---|---|---|
| Primary | Jungle green | `#1F4D3A` |
| Light green | Pasture | `#7FA65A` |
| Accent | Sunset gold | `#E8A43C` |
| Warm accent | Ember | `#D9673B` (use sparingly) |
| Secondary | Ocean blue | `#2B6E8F` |
| Dark | Night canopy | `#0F1F1A` |
| Light | Mist / sand | `#F4EFE6` |
Gold text on mist fails contrast. Use gold for marks, rules and buttons with dark text.

### Type
Headings: a light, wide geometric or humanist sans that echoes the logo's spaced caps (e.g. Jost Light, or Montserrat with 0.3em tracking for display caps). Body: a warm, readable serif or sans (e.g. Source Serif 4 or Inter). Must be free and open licensed.

## 3. Audience and buyer personas
1. **Dana and Rob, 52 and 55, Colorado.** Selling a suburban house; want 5 to 20 acres with a sea view, a vegetable garden and horses. Fear: getting scammed on title, buying beach land they can't own. Device: iPad in the evening, laptop to compare.
2. **Maya, 38, remote software designer, Vancouver.** Wants an off-grid cabin, solar, permaculture, fast internet. Fear: isolation, bad roads, water rights. Device: phone first.
3. **The Okafors, family of four, Texas.** Homeschool, grow their own food, raise animals. Fear: schools, healthcare, residency. Device: laptop.
4. **Esteban, 61, Costa Rican farmer (caretaker).** Wants to keep working land near his family and live there free. Fear: being pushed out. Device: Android phone, Spanish first.
5. **Lucía, landowner selling a family finca.** Wants a fair, direct sale without broker fees. Device: phone, WhatsApp.

## 4. Site map
1. **Home**: hero photo with tagline; three promises (Own your view. Grow your food. Close direct.); featured farms; caretaker program teaser; how buying works in 4 steps; inquiry call to action.
2. **Farms / Listings**: grid plus map; filters; each farm has a detail page (gallery, acres, view, water, road access, elevation, zoning notes, "ask a lawyer about this title" box, inquiry form prefilled with farm ID).
3. **Live on the Land (Caretaker Program)**: how farmers live free on the land, what buyers get (care, local knowledge), how matching works, a caretaker sign-up form.
4. **How Buying Works**: step-by-step with independent lawyers; questions to ask; a plain-language glossary (folio real, plano catastrado, escritura, ZMT); "work with a licensed Costa Rican lawyer" throughout; lawyer directory placeholder.
5. **Eco-Building & Food**: building with local timber, bamboo, earth; solar and rainwater; permaculture and food forests; a seasonal planting calendar.
6. **About**: the origin story, values, the people (example).
7. **Contact / Inquiry**: general form, WhatsApp link, email, office hours in Costa Rica time.
Footer: legal disclaimer, privacy, language switch EN/ES, newsletter.

## 5. How buying works (copy guidance, not legal fact)
Phrase every point as something to confirm with a licensed Costa Rican lawyer:
- Foreigners can generally hold titled land the same way citizens can. **Confirm the title and its status with a licensed Costa Rican lawyer.**
- Land near the coast may fall in the maritime-terrestrial zone (Ley 6043), commonly described as a 200 m strip from high tide where the first 50 m are public and the rest is often held by municipal concession, with limits on foreign holders. **Your lawyer checks whether a parcel is titled or a concession before you pay anything.** Ocean-*view* farms are usually inland on titled land; still have it checked.
- A Costa Rican notary is also a lawyer and prepares and records the transfer deed. **Ask your lawyer how deposits are held (escrow arrangements) and when funds are released.**
- Due diligence often covers the registry record, the cadastral survey, liens, access, water, zoning and environmental limits. **Your lawyer decides what applies.**
- Paradise Found suggests independent lawyers but does not give legal advice and does not hold funds.

Steps on the page: 1 Find a farm. 2 Visit and ask questions. 3 Pick an independent lawyer from our suggested list (or your own). 4 Your lawyer checks title and survey. 5 Sign an option or purchase agreement your lawyer drafts. 6 Close with a notary and record at the national registry.

## 6. Features and functions to test
| Feature | What should work |
|---|---|
| Listing filter | Filter by price range, acres, region (Guanacaste, Nicoya, Central Pacific, South Pacific, Caribbean), ocean view yes/no, water source, caretaker available, road access. Results count updates, "clear filters" works, empty state message, filters survive back button / URL. |
| Sort | Price low/high, acres, newest. |
| Listing detail | Gallery with keyboard nav, specs table, map, prefilled inquiry. |
| Inquiry form | Name, email, phone/WhatsApp (optional), farm ID, budget range, timeline, message, consent checkbox. Required-field errors, email validation, success state, no double submit. |
| Caretaker sign-up form | Name, region, farming skills, family size, languages. |
| Favorites / shortlist | Heart a farm, see it on a shortlist (local storage). |
| Language toggle | EN/ES switch keeps the current page. |
| Newsletter | Email field, success message. |
| Navigation | Sticky header, mobile menu opens/closes, all links resolve, no 404s. |
| Media | Hero image loads, lazy images, alt text. |
| Motion | Gentle parallax on hero; respects reduced motion. |
| Accessibility | Contrast passes, focus visible, forms labelled. |
| Performance | Hero LCP under 2.5 s on mobile emulation. |

## 7. Example listings (invented)
| ID | Name | Region | Acres | Price (USD) | View | Caretaker |
|---|---|---|---|---|---|---|
| PF-001 | Finca Luna Alta | Nicoya Peninsula | 12 | 420,000 | Ocean, sunset | Yes |
| PF-002 | Cerro Verde Farm | South Pacific (Uvita) | 25 | 690,000 | Ocean + jungle | Yes |
| PF-003 | Rancho Horizonte | Guanacaste | 8 | 310,000 | Ocean, distant | No |
| PF-004 | Quebrada Dulce | Central Pacific | 40 | 950,000 | Valley to sea | Yes |
| PF-005 | Finca Colibrí | Caribbean (Puerto Viejo) | 5 | 185,000 | Jungle, no ocean | No |

## 8. Tone and copy samples
Voice: a calm friend who already moved and loves it. Warm, plain, honest about the hard parts. No hype, no "investment opportunity!!!". If it were an animal: a heron standing still at sunrise.
- Hero: **Paradise Found.** *Find your calm.* "Ocean-view farms in Costa Rica, for people ready to grow their own life."
- Promise: "Own your view. Grow your food. Close direct, with a lawyer on your side."
- Caretaker: "The land is better with someone who knows it. Our caretakers live here free and keep the farm alive while you build."
- Buying: "No middlemen. You, the seller, and an independent licensed Costa Rican lawyer."
- Eco: "Build with what the land gives: timber, bamboo, sun and rain."
- CTA: "Ask about this farm", "Plan a visit", "Talk to a lawyer first".
- Disclaimer: "Paradise Found does not give legal advice. Work with a licensed Costa Rican lawyer on every purchase."

## 9. Answers for the desk interview (by question ID)
| ID | Question (short) | Customer answer |
|---|---|---|
| DP-0.1 | Own business or client? | My own business. |
| DP-0.2 | Had a website before? | No. This is the first site. |
| DP-0.2a | Love / wince | Skip, or: I wince at listing sites that look like spreadsheets and shout "investment". |
| DP-0.3 | How hands-on? | (d) I'm brand new to all of this. |
| DP-0.4 | Logo, colors, photos? | Yes: attach `paradise-found-logo.png`, `paradise-found-mark.png`, `paradise-found-hero.jpg`. |
| DP-0.5 | Connect X? | No thanks. (Skip.) |
| DP-0.7 | Time today | About an hour. |
| DP-1.1 | Logo? | Yes, attached: a thin crescent arc over a horizon line, PARADISE FOUND in wide caps, "Find your calm." under it. |
| DP-1.1a | Happy with it? | Yes. |
| DP-1.1b | Suggestions? | No, keep it. Maybe a white version for dark backgrounds. |
| DP-1.2 | Colors | Jungle green, sunset gold, ocean blue, from the hero photo. Plus soft sand and a near-black green. |
| DP-1.3 | Tagline? | Yes: "Paradise Found. Find your calm." |
| DP-1.3a | Suggestions? | No. |
| DP-1.4 | Pictures you like | The hero photo: golden hour, horses, farmhouse, ocean. Surreal, calm, jungle. |
| DP-1.5 | Fonts | No fonts yet. Light, wide, airy sans for headings like the logo; easy-reading body. |
| DP-1.5a | Font screenshots | Show me pairings. (Pick the lightest, widest one.) |
| DP-1.6 | Voice / animal | A calm friend who already moved here. A heron at sunrise. |
| DP-1.6a | Brands' voices | Patagonia, Aesop, Airbnb Luxe, Kinfolk. |
| DP-1.7 | Origin story | We moved from the US, bought a farm, and nearly got burned by middlemen. We want others to find land honestly, keep local farmers on it, and live free. |
| DP-1.7a | Understand your why? | Yes: help people find their calm on land they truly own, with locals beside them. |
| DP-1.8 | Similar / loved brands | Similar: Lands of America, Land.com, Encuentra24, Costa Rica real-estate sites. Loved: Patagonia, Aesop, Kinfolk. |
| DP-1.9 | Never change | The mark, the wide caps, the tagline. |
| DP-2.1 | Site's job | Connect expats with ocean-view Costa Rican farms and walk them to an honest, lawyer-led direct purchase. |
| DP-2.2 | One action | Send an inquiry about a farm. |
| DP-2.3 | Site kind | Sales, local, content. |
| DP-2.4 | Monthly goal | 30 qualified inquiries a month. |
| DP-2.5 | One offer or story? | Both: the dream first, then the farms. |
| DP-2.6 | One visitor | Dana, 52, Colorado: wants sea view, horses and a garden; fears losing money on bad title; browses on an iPad. |
| DP-2.7 | What and why care | Ocean-view farms sold direct, with free caretakers and independent lawyers. No middlemen, no surprises. |
| later questions | Anything not listed | Answer from sections 3 to 8. Pages: section 4. Features: section 6. Budget: modest, open-source tools. Deadline: 4 weeks. Hosting: none yet; suggest. Languages: English first, Spanish second. Motion appetite: medium, gentle parallax. SEO: "Costa Rica farm for sale ocean view", "live off the land Costa Rica", "Costa Rica caretaker farm". Competitors: Encuentra24, Costa Rica real-estate listing sites, LandWatch. |

## 10. Research notes (sources, 2026)
- Sites studied for structure: LandWatch / Land.com (filters by acres, price, features), Encuentra24 (local classifieds), Costa Rica realtor and expat sites (buying guides, maritime-zone explainers), eco-community sites (permaculture, off-grid sections).
- Maritime zone and foreign buyers: aegispartners.law/blog/maritime-zone-costa-rica-property; costaricarealtor.com (Ley 6043 guide); foliocostarica.com/academy/buying/foreign-buyers.
- Notary and escrow roles: costaricanotary.com/escrow-services-costa-rica-real-estate; crossinghq.com/costa-rica/how-to-buy-property.
These inform the copy only. The site states none of it as fact; it tells visitors to work with a licensed Costa Rican lawyer.
