/**
 * The compare gate runs inside the site-build close.
 * This re-export is the orchestrator surface. The runner does not call it.
 */
export { runCompGate, setCompGateDeps } from "@hitchhiker/engine";
