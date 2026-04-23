import "dotenv/config";
import { parseWorkerEnv } from "@bharatdoc/shared";

export const workerEnv = parseWorkerEnv(process.env);
