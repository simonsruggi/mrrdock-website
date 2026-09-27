import { SITE_URL, API_VERSION, PRODUCT, PLATFORMS } from "../data/product.js";
import { RATE_LIMIT, ERROR_CODES, SUPPORT_FIELDS } from "./api.js";

const problemRef = { $ref: "#/components/responses/Problem" };
const rateHeaders = {
  RateLimit: { $ref: "#/components/headers/RateLimit" },
  "RateLimit-Policy": { $ref: "#/components/headers/RateLimitPolicy" },
};
const ok = (description, schemaRef) => ({
  description,
  headers: rateHeaders,
  content: { "application/json": { schema: { $ref: schemaRef } } },
});

export function buildOpenApi() {
  return {
    openapi: "3.1.0",
    info: {
      title: `${PRODUCT.name} public API`,
      version: API_VERSION,
      summary: `Read-only facts about ${PRODUCT.name}, the ${PRODUCT.tagline}.`,
      description:
        `Read-only, unauthenticated API describing ${PRODUCT.name}: requirements, install commands, the latest release (read live from the app's Sparkle update feed), supported payment platforms and features. ` +
        `It does not expose anyone's revenue: MRRDock has no server and revenue data never leaves the user's Mac. ` +
        `Rate limit: ${RATE_LIMIT.limit} requests per ${RATE_LIMIT.windowSeconds} seconds per IP (best effort, per edge location). Errors are application/problem+json.`,
      license: { name: "MIT", identifier: "MIT" },
      contact: { name: PRODUCT.author.name, url: `${SITE_URL}/contact`, email: PRODUCT.author.email },
    },
    externalDocs: { description: "Developer docs", url: `${SITE_URL}/docs` },
    servers: [{ url: SITE_URL }],
    security: [],
    tags: [{ name: "product", description: "Facts about the MRRDock app" }],
    paths: {
      "/api/v1/info": {
        get: {
          operationId: "getProductInfo",
          tags: ["product"],
          summary: "Get everything about MRRDock",
          description:
            "Name, summary, license, price, macOS requirements, Homebrew and download instructions, latest release, supported platforms, features, MRR formula, privacy model, alternatives and FAQ.",
          responses: {
            200: ok("Product facts.", "#/components/schemas/ProductInfo"),
            429: problemRef,
          },
        },
      },
      "/api/v1/platforms": {
        get: {
          operationId: "listPlatforms",
          tags: ["product"],
          summary: "List supported payment platforms",
          description: "Payment platforms MRRDock reads, with what each one reports and the API key it needs.",
          parameters: [
            {
              name: "supports",
              in: "query",
              required: false,
              description: "Only platforms that report this figure.",
              schema: { type: "string", enum: SUPPORT_FIELDS },
            },
          ],
          responses: {
            200: ok("Platforms.", "#/components/schemas/PlatformList"),
            400: problemRef,
            429: problemRef,
          },
        },
      },
      "/api/v1/platforms/{id}": {
        get: {
          operationId: "getPlatform",
          tags: ["product"],
          summary: "Get one supported platform",
          description: "Coverage, API used, key and permissions for one platform.",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              description: "Platform id.",
              schema: { type: "string", enum: PLATFORMS.map((p) => p.id) },
            },
          ],
          responses: {
            200: ok("One platform.", "#/components/schemas/PlatformEnvelope"),
            404: problemRef,
            429: problemRef,
          },
        },
      },
      "/api/v1/release": {
        get: {
          operationId: "getLatestRelease",
          tags: ["product"],
          summary: "Get the latest release",
          description: "Latest version, build, publication date, download URL and minimum macOS, read live from the app's update feed (cached 15 minutes).",
          responses: {
            200: ok("Latest release.", "#/components/schemas/ReleaseEnvelope"),
            429: problemRef,
            503: problemRef,
          },
        },
      },
    },
    components: {
      headers: {
        RateLimit: { description: "IETF RateLimit header: remaining requests and seconds to reset.", schema: { type: "string" } },
        RateLimitPolicy: { description: "IETF RateLimit-Policy header.", schema: { type: "string" } },
      },
      responses: {
        Problem: {
          description: "Error (RFC 9457 problem details).",
          content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } } },
        },
      },
      schemas: {
        Problem: {
          type: "object",
          required: ["type", "title", "status", "code", "detail"],
          properties: {
            type: { type: "string", format: "uri" },
            title: { type: "string" },
            status: { type: "integer" },
            code: { type: "string", enum: Object.keys(ERROR_CODES) },
            detail: { type: "string" },
            resolution: { type: "string", description: "What to do next." },
          },
        },
        Release: {
          type: "object",
          required: ["version", "releaseNotesUrl"],
          properties: {
            version: { type: "string", examples: ["1.1.2"] },
            build: { type: ["string", "null"] },
            publishedAt: { type: ["string", "null"], format: "date-time" },
            minimumMacOS: { type: ["string", "null"], examples: ["14.0"] },
            downloadUrl: { type: ["string", "null"], format: "uri" },
            downloadSizeBytes: { type: ["integer", "null"] },
            releaseNotesUrl: { type: "string", format: "uri" },
            source: { type: "string", format: "uri", description: "Update feed the data was read from." },
          },
        },
        ReleaseEnvelope: { type: "object", required: ["release"], properties: { release: { $ref: "#/components/schemas/Release" } } },
        Platform: {
          type: "object",
          required: ["id", "name", "supports"],
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            supports: {
              type: "object",
              properties: Object.fromEntries(
                SUPPORT_FIELDS.map((f) => [f, { oneOf: [{ type: "boolean" }, { type: "string", const: "optional" }] }])
              ),
            },
            apiUsed: { type: "string" },
            key: { type: "string", description: "API key and permissions needed." },
            notes: { type: "string" },
            url: { type: "string", format: "uri" },
          },
        },
        PlatformList: { type: "object", required: ["platforms"], properties: { platforms: { type: "array", items: { $ref: "#/components/schemas/Platform" } } } },
        PlatformEnvelope: { type: "object", required: ["platform"], properties: { platform: { $ref: "#/components/schemas/Platform" } } },
        ProductInfo: {
          type: "object",
          required: ["name", "summary", "license", "price", "requirements", "install", "supportedPlatforms"],
          properties: {
            name: { type: "string" },
            tagline: { type: "string" },
            summary: { type: "string" },
            category: { type: "string" },
            platform: { type: "string" },
            license: { type: "object" },
            price: { type: "object" },
            requirements: { type: "object" },
            install: { type: "object" },
            distribution: { type: "object" },
            latestRelease: { oneOf: [{ $ref: "#/components/schemas/Release" }, { type: "null" }], description: "null when the update feed is unreachable." },
            supportedPlatforms: { type: "array", items: { type: "object", properties: { id: { type: "string" }, name: { type: "string" } } } },
            features: { type: "array", items: { type: "object", properties: { name: { type: "string" }, description: { type: "string" } } } },
            mrrCalculation: { type: "object" },
            privacy: { type: "object" },
            alternatives: { type: "array", items: { type: "object" } },
            faq: { type: "array", items: { type: "object", properties: { question: { type: "string" }, answer: { type: "string" } } } },
            tech: { type: "object" },
            links: { type: "object" },
            author: { type: "object" },
          },
        },
      },
    },
  };
}
