/**
 * Demo mode — the single entry point.
 *
 * Import from `@/lib/demo` rather than reaching into the files below, so the
 * surface the rest of the application touches stays small and obvious.
 */

export {
  DEMO_EMAIL,
  DEMO_HOME,
  DEMO_PERMISSIONS,
  isDemoCredentials,
  isDemoRoute,
} from "./config";

export { disableDemoMode, enableDemoMode, isDemoMode } from "./session";

export { DEMO_SESSION_USER, DemoHttpError, demoRequest } from "./api";

export { demoNavSections } from "./nav";

export { resetDemoData } from "./store";
