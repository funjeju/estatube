// lib/env.ts — Node 스크립트용 환경변수 로더 (.env.local 우선, .env 폴백).
// Next 런타임은 자체적으로 .env.local 을 읽으므로 이 함수는 스크립트 전용.

import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

let _loaded = false;

export function loadLocalEnv(): void {
  if (_loaded) return;
  const here = dirname(fileURLToPath(import.meta.url));
  const root = resolve(here, ".."); // lib/ → 프로젝트 루트
  dotenvConfig({ path: resolve(root, ".env.local") });
  dotenvConfig({ path: resolve(root, ".env") });
  _loaded = true;
}
