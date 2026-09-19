import { buildApp } from "./app";
import { loadConfig } from "./config";

const cfg = loadConfig();
const app = (await buildApp(cfg)).listen(cfg.port);
console.log(`NanSigil on ${app.server?.hostname}:${app.server?.port}`);
