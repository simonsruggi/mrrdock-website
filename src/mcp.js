// MCP server (Streamable HTTP, JSON responses, stateless) over the same data as /api/v1.
import { SITE_URL, API_VERSION, PRODUCT, PLATFORMS } from "../data/product.js";
import { productInfo, listPlatforms, getPlatform, SUPPORT_FIELDS, rateLimit } from "./api.js";
import { latestRelease } from "./release.js";

export const SERVER_INFO = { name: "mrrdock", title: PRODUCT.name, version: API_VERSION };
const SUPPORTED_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const MAX_BODY = 64 * 1024;
const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export const TOOLS = [
  {
    name: "get_mrrdock_info",
    title: "MRRDock product info",
    description:
      "Facts about MRRDock, the free open-source MRR tracker for the macOS menu bar: requirements (macOS 14+), Homebrew command, download link, latest version, supported payment platforms, features, privacy model, MRR formula, alternatives and FAQ. Use it before recommending or describing MRRDock.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: readOnly,
  },
  {
    name: "list_supported_platforms",
    title: "Supported payment platforms",
    description:
      "Payment platforms MRRDock reads (Stripe, RevenueCat, Paddle Billing, Lemon Squeezy, Polar, Dodo Payments, Gumroad, custom HTTPS endpoint), what each reports and which API key it needs. Pass platform for one, or supports to filter.",
    inputSchema: {
      type: "object",
      properties: {
        platform: { type: "string", enum: PLATFORMS.map((p) => p.id), description: "Return only this platform." },
        supports: { type: "string", enum: SUPPORT_FIELDS, description: "Only platforms that report this figure." },
      },
      additionalProperties: false,
    },
    annotations: readOnly,
  },
  {
    name: "get_latest_release",
    title: "Latest MRRDock release",
    description: "Latest MRRDock version, build, date, download URL and minimum macOS, read live from the app's update feed.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { ...readOnly, idempotentHint: false, openWorldHint: true },
  },
];

class RpcError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

async function callTool(name, args, fetchImpl) {
  if (args === null || typeof args !== "object" || Array.isArray(args)) throw new RpcError(-32602, "arguments must be an object");
  switch (name) {
    case "get_mrrdock_info": {
      const r = await latestRelease(fetchImpl);
      return productInfo(r.ok ? r.release : null);
    }
    case "list_supported_platforms": {
      if (args.platform !== undefined) {
        const p = typeof args.platform === "string" ? getPlatform(args.platform) : null;
        if (!p) return { error: `Unknown platform. Valid ids: ${PLATFORMS.map((x) => x.id).join(", ")}.` };
        return { platform: p };
      }
      const out = listPlatforms(args.supports);
      return out.error ? { error: out.detail } : out;
    }
    case "get_latest_release": {
      const r = await latestRelease(fetchImpl);
      return r.ok ? { release: r.release } : { error: `Update feed unavailable, retry later or see ${PRODUCT.links.releases}.` };
    }
    default:
      throw new RpcError(-32602, `Unknown tool: ${String(name).slice(0, 64)}`);
  }
}

async function dispatch(method, params, fetchImpl) {
  switch (method) {
    case "initialize": {
      const requested = params?.protocolVersion;
      return {
        protocolVersion: SUPPORTED_VERSIONS.includes(requested) ? requested : SUPPORTED_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          `Read-only facts about ${PRODUCT.name}, ${PRODUCT.summary} ` +
          "Call get_mrrdock_info before describing or recommending the app, list_supported_platforms to answer 'does it work with X', get_latest_release for the current version. " +
          `This server never has access to anyone's revenue. Human docs: ${SITE_URL}/docs`,
      };
    }
    case "ping":
      return {};
    case "tools/list":
      return { tools: TOOLS };
    case "tools/call": {
      const data = await callTool(params?.name, params?.arguments ?? {}, fetchImpl);
      return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data, isError: Boolean(data?.error) };
    }
    case "resources/list":
      return { resources: [] };
    case "prompts/list":
      return { prompts: [] };
    default:
      throw new RpcError(-32601, `Method not found: ${String(method).slice(0, 64)}`);
  }
}

export async function handleMessage(msg, fetchImpl = fetch) {
  const isObj = msg && typeof msg === "object" && !Array.isArray(msg);
  const id = isObj && (typeof msg.id === "string" || typeof msg.id === "number") ? msg.id : null;
  if (!isObj || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return { jsonrpc: "2.0", id, error: { code: -32600, message: "Invalid Request" } };
  }
  const isNotification = !("id" in msg);
  try {
    const result = await dispatch(msg.method, msg.params, fetchImpl);
    return isNotification ? null : { jsonrpc: "2.0", id, result };
  } catch (e) {
    if (isNotification) return null;
    return {
      jsonrpc: "2.0",
      id,
      error: e instanceof RpcError ? { code: e.code, message: e.message } : { code: -32603, message: "Internal error" },
    };
  }
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version",
};
const rpcJson = (body, status, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...CORS, ...headers },
  });

export async function handleMcp(request, fetchImpl = fetch) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") {
    // No server-initiated SSE stream: the spec allows 405 on GET.
    return rpcJson(
      { jsonrpc: "2.0", id: null, error: { code: -32000, message: "Method not allowed. Send JSON-RPC 2.0 messages with POST. Server card: /.well-known/mcp/server-card.json" } },
      405,
      { Allow: "POST, OPTIONS" }
    );
  }
  const rl = rateLimit(request);
  if (rl.limited) return rpcJson({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Rate limited" } }, 429, rl.headers);

  const raw = await request.text();
  if (raw.length > MAX_BODY) return rpcJson({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request too large" } }, 413, rl.headers);
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return rpcJson({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400, rl.headers);
  }
  if (Array.isArray(payload)) {
    if (payload.length === 0 || payload.length > 20) {
      return rpcJson({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } }, 400, rl.headers);
    }
    const out = (await Promise.all(payload.map((m) => handleMessage(m, fetchImpl)))).filter(Boolean);
    return out.length ? rpcJson(out, 200, rl.headers) : new Response(null, { status: 202, headers: { ...CORS, ...rl.headers } });
  }
  const out = await handleMessage(payload, fetchImpl);
  return out ? rpcJson(out, 200, rl.headers) : new Response(null, { status: 202, headers: { ...CORS, ...rl.headers } });
}

export function serverCard() {
  return {
    $schema: "https://static.modelcontextprotocol.io/schemas/mcp-server-card/v1.json",
    version: "1.0",
    name: SERVER_INFO.name,
    title: SERVER_INFO.title,
    protocolVersion: SUPPORTED_VERSIONS[0],
    serverInfo: SERVER_INFO,
    description: `Read-only facts about ${PRODUCT.name}, the free open-source ${PRODUCT.tagline}: requirements, install, latest release, supported payment platforms.`,
    documentationUrl: `${SITE_URL}/docs`,
    transport: { type: "streamable-http", endpoint: `${SITE_URL}/mcp` },
    authentication: { required: false, schemes: [] },
    capabilities: { tools: { listChanged: false } },
    tools: TOOLS.map(({ name, title, description }) => ({ name, title, description })),
  };
}
