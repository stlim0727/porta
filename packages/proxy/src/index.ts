/**
 * Porta Proxy Server
 *
 * Hono HTTP server that provides a stable REST API over the
 * Antigravity Language Server's dynamic Connect RPC endpoint.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { createAdaptorServer } from "@hono/node-server";

import { execSync, spawn } from "node:child_process";
import path from "node:path";
import { discovery, rpc, conversationAffinity } from "./routing.js";
import { registerConversationRoutes } from "./routes/conversations.js";
import { registerModelRoutes } from "./routes/models.js";
import { registerWorkspaceRoutes } from "./routes/workspaces.js";
import { registerFileRoutes } from "./routes/files.js";
import { registerSearchRoutes } from "./routes/search.js";
import { registerRpcPassthroughRoutes } from "./routes/rpcPassthrough.js";
import { registerGithubRoutes } from "./routes/github.js";
import { githubMonitor } from "./github-monitor.js";
import {
  assertSupportedListenHost,
  formatListenAddress,
  resolveProxyHost,
} from "./exposure.js";
import { getAllowedOrigins, resolveCorsOrigin } from "./origins.js";
import { setupWebSocket } from "./ws.js";
import { loadSettingsFromDisk } from "./chat-settings.js";

const PORT = parseInt(process.env.PORTA_PORT ?? "3170", 10);
const HOST = resolveProxyHost();

assertSupportedListenHost(HOST, process.env);

const app = new Hono();

// ── Middleware ──

const ALLOWED_ORIGINS = getAllowedOrigins();

app.use(
  "*",
  cors({
    origin: (origin) => resolveCorsOrigin(origin, ALLOWED_ORIGINS),
  }),
);

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
let PORTA_VERSION = "0.0.0";
try {
  const pkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  PORTA_VERSION = pkg.version ?? "0.0.0";
} catch {
  // fallback
}

function getGitCommitInfo(): { sha: string; shortSha: string; url: string; isPushed: boolean; isDirty: boolean } | undefined {
  try {
    const sha = execSync("git rev-parse HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (!sha) return undefined;
    const shortSha = sha.slice(0, 7);
    let repoUrl = "https://github.com/stlim0727/porta";
    try {
      const originUrl = execSync("git remote get-url origin", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (originUrl) {
        const cleaned = originUrl
          .replace(/^git@github\.com:/, "https://github.com/")
          .replace(/\.git$/, "");
        if (cleaned.startsWith("http")) repoUrl = cleaned;
      }
    } catch {
      // fallback
    }

    let isPushed = false;
    let branchName = "";
    try {
      branchName = execSync("git branch --show-current", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      const contains = execSync("git branch -r --contains HEAD", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (contains) {
        isPushed = true;
      }
    } catch {
      // ignore
    }

    let isDirty = false;
    try {
      const statusOutput = execSync("git status --porcelain", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (statusOutput) {
        isDirty = true;
      }
    } catch {
      // ignore
    }

    const encodedBranch = branchName
      ? branchName.split("/").map((seg) => encodeURIComponent(seg)).join("/")
      : "";

    const url = isPushed
      ? `${repoUrl}/commit/${sha}`
      : branchName
        ? `${repoUrl}/tree/${encodedBranch}`
        : repoUrl;

    return { sha, shortSha, url, isPushed, isDirty };
  } catch {
    return undefined;
  }
}

async function probeLanguageServer(instance: import("./discovery.js").LSInstance) {
  const start = Date.now();
  let reachable = false;
  let latencyMs = -1;
  let errMessage = "";

  try {
    // Primary probe: GetWorkspaceInfos is supported across all Language Server versions
    await rpc.call("GetWorkspaceInfos", {}, instance, true);
    reachable = true;
    latencyMs = Date.now() - start;
  } catch {
    try {
      // Fallback probe: GetProcessInfo
      await rpc.call("GetProcessInfo", {}, instance, true);
      reachable = true;
      latencyMs = Date.now() - start;
    } catch (err) {
      errMessage = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    pid: instance.pid,
    httpsPort: instance.httpsPort,
    workspaceId: instance.workspaceId,
    source: instance.source,
    reachable,
    latencyMs,
    error: errMessage || undefined,
  };
}

// ── Health & Diagnostics ──

app.get("/api/health", async (c) => {
  const instances = await discovery.getInstances();
  const lsDiagnostics = await Promise.all(instances.map((i) => probeLanguageServer(i)));
  const isOk = lsDiagnostics.length > 0 && lsDiagnostics.some((l) => l.reachable);

  return c.json({
    status: isOk ? "ok" : "degraded",
    proxy: {
      port: PORT,
      uptime: process.uptime(),
      version: PORTA_VERSION,
      gitCommit: getGitCommitInfo(),
      memory: process.memoryUsage(),
    },
    languageServers: lsDiagnostics,
    affinityEntries: conversationAffinity.size,
    rpcDiagnostics: rpc.getDiagnostics(),
  });
});

app.get("/api/diagnostics", async (c) => {
  const instances = await discovery.getInstances();
  const lsDiagnostics = await Promise.all(instances.map((i) => probeLanguageServer(i)));

  return c.json({
    timestamp: new Date().toISOString(),
    proxy: {
      port: PORT,
      host: HOST,
      uptime: process.uptime(),
      version: PORTA_VERSION,
      gitCommit: getGitCommitInfo(),
      memory: process.memoryUsage(),
    },
    languageServers: lsDiagnostics,
    affinityCacheSize: conversationAffinity.size,
    rpcStats: rpc.getDiagnostics(),
  });
});

app.post("/api/restart", (c) => {
  setTimeout(() => {
    try {
      if (process.platform === "win32") {
        const repoRoot = process.cwd();
        const psScript = path.join(repoRoot, "scripts", "restart-porta.ps1");
        const isStable = process.env.PORTA_MODE === "stable";
        const args = [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          psScript,
        ];
        if (isStable) args.push("-Stable");
        spawn("powershell.exe", args, {
          detached: true,
          stdio: "ignore",
        }).unref();
      } else {
        process.exit(0);
      }
    } catch {
      process.exit(0);
    }
  }, 500);

  return c.json({ ok: true, message: "Restarting Porta server..." });
});

// ── Routes ──

registerConversationRoutes(app);
registerModelRoutes(app);
registerWorkspaceRoutes(app);
registerFileRoutes(app);
registerSearchRoutes(app);
registerRpcPassthroughRoutes(app);
registerGithubRoutes(app);

// Load per-chat settings from disk
void loadSettingsFromDisk();

// Start background GitHub monitor polling
githubMonitor.startPolling(30_000);

// ── Start ──

const listenAddress = formatListenAddress(HOST, PORT);

console.log(`🚀 Porta proxy starting on ${listenAddress}`);

const server = createAdaptorServer({ fetch: app.fetch, port: PORT });

setupWebSocket(server, PORT, ALLOWED_ORIGINS);

void discovery
  .getInstances()
  .then((instances) => {
    if (instances.length > 0) return;

    console.warn(
      `⚠️ No Antigravity Language Server instances discovered. Make sure Antigravity is running.`,
    );
  })
  .catch((err) => {
    console.warn(`⚠️ Initial discovery failed: ${(err as Error).message}`);
  });

server.listen(PORT, HOST, () => {
  console.log(`✅ Porta proxy listening on ${listenAddress}`);
});
