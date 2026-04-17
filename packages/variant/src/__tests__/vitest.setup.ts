import "@testing-library/jest-dom/vitest";
import { beforeEach, vi } from "vitest";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/__variiant/config")) {
      return new Response(JSON.stringify({
        token: "test-token",
        agent: {
          enabled: false,
          commandLabel: null,
          message: "Local agent bridge unavailable in tests.",
          streaming: null,
          supportsImages: false,
        },
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    return new Response(JSON.stringify({
      error: "Unhandled test fetch request.",
    }), {
      status: 404,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }));
});
