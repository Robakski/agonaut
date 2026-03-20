import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware({
  ...routing,
  localeDetection: true, // Auto-detect from Accept-Language header
});

export const config = {
  // Match all paths except static files, api, and _next
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
