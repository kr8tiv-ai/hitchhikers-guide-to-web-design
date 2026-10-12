export const PACKAGE_NAME = "@hitchhiker/crawler";

export { allowed, parseRobots, ROBOTS_MAX_CHARS } from "./robots.ts";
export type { RobotsGroup, RobotsRules } from "./robots.ts";

export {
  BadUrlError,
  DESKTOP_VIEWPORT,
  EXCERPT_LIMIT,
  MAX_REDIRECTS,
  MOBILE_VIEWPORT,
  NetworkError,
  RedirectError,
  RobotsDenied,
  USER_AGENT,
  clip,
  crawl,
  createBrowser,
  sniffStack,
} from "./crawl.ts";
export type { BrowserSession, CrawlDeps, CrawlResult, FakePage, Viewport } from "./crawl.ts";

export {
  FAMILIES as galleryFamilies,
  FAMILY_STYLE as galleryFamilyStyle,
  familyOf as galleryFamilyOf,
  selectReferenceCards as gallerySelectReferenceCards,
} from "./gallery-pick.ts";
export type { GalleryPick as GalleryPickShape } from "./gallery-pick.ts";

export {
  CURATED_PACK_FILE,
  DEFAULT_GALLERY_ALLOW,
  GALLERY_CACHE_MAX_AGE_MS,
  GALLERY_FETCH_TIMEOUT_MS,
  cacheIsFresh,
  loadCurated,
  refreshGalleries,
  suggestReferences,
} from "./galleries.ts";
export type {
  GalleryCache,
  GalleryEntry,
  GallerySource,
  GalleryStyleWorld,
  RefreshOptions,
  RefreshResult,
  SuggestQuery,
} from "./galleries.ts";
