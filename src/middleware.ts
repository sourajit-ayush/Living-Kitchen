import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Everything except API routes, Next internals and files with an extension. The dot must be
  // escaped for the regex ("\\."): a bare "\." in a string is just "." and excluded every path,
  // so the locale middleware never ran and dynamic pages fell back to English (Phase 7).
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
