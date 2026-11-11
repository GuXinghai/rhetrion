import { createLocalCodexLogScanner } from "./application/index.js";
import { createLocalCodexLogPorts } from "./platform/index.js";

// Source scanning has its own composition boundary. Importing this context
// does not construct export workspaces, transactions or deletion services.
export const localCodexLogScanner = createLocalCodexLogScanner(
  createLocalCodexLogPorts(),
);
