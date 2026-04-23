import "server-only";
import { parseWebEnv, type WebEnv } from "@bharatdoc/shared";

export function getWebEnv(): WebEnv {
  return parseWebEnv(process.env);
}
