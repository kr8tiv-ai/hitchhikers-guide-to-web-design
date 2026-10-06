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
