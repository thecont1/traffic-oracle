/**
 * Bun test preload — sets up jsdom + jest-dom matchers for React component tests.
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// bun:test already provides describe/it/expect; we just need a DOM.
// happy-dom is lighter and bun-native; use it instead of jsdom.
GlobalRegistrator.register();
