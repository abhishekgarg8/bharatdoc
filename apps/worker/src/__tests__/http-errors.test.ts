import { describe, expect, it, vi } from "vitest";
import {
  createErrorHandler,
  HttpError,
  sanitizeErrorForTelemetry,
} from "../http-errors.js";

describe("worker HTTP error handling", () => {
  it("sanitizes internal HttpError messages in responses while logging telemetry", () => {
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    const handler = createErrorHandler(logger);
    const response = {
      locals: { requestId: "req-123" },
      status: vi.fn(function status() {
        return response;
      }),
      json: vi.fn(),
    };

    handler(
      new HttpError(500, "OpenAI API key failed: sk-secret", "INTERNAL_ERROR"),
      { method: "POST", path: "/api/transcribe" } as never,
      response as never,
      vi.fn(),
    );

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error.",
      },
    });
    expect(logger.error).toHaveBeenCalledWith(
      "http.request.failed",
      expect.objectContaining({
        request_id: "req-123",
        error_message: "Internal server error.",
      }),
    );
  });

  it("preserves user-actionable HttpError messages", () => {
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    const handler = createErrorHandler(logger);
    const response = {
      locals: {},
      status: vi.fn(function status() {
        return response;
      }),
      json: vi.fn(),
    };

    handler(
      new HttpError(
        413,
        "Audio file exceeds the Phase 1 size limit.",
        "AUDIO_TOO_LARGE",
      ),
      { method: "POST", path: "/api/transcribe" } as never,
      response as never,
      vi.fn(),
    );

    expect(response.status).toHaveBeenCalledWith(413);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: "AUDIO_TOO_LARGE",
        message: "Audio file exceeds the Phase 1 size limit.",
      },
    });
  });

  it("maps body parser size limits to a stable 413 response", () => {
    expect(
      sanitizeErrorForTelemetry(
        Object.assign(new Error("request entity too large"), {
          type: "entity.too.large",
        }),
      ),
    ).toMatchObject({
      error_status: 413,
      error_code: "REQUEST_TOO_LARGE",
    });
  });

  it("maps every multipart resource limit to the stable audio 413", () => {
    expect(
      sanitizeErrorForTelemetry(
        Object.assign(new Error("Too many parts"), {
          name: "MulterError",
          code: "LIMIT_PART_COUNT",
        }),
      ),
    ).toMatchObject({
      error_status: 413,
      error_code: "AUDIO_TOO_LARGE",
    });
  });

  it("keeps bounded upstream provider metadata for diagnostics", () => {
    const error = Object.assign(new Error("Invalid value for audio"), {
      status: 400,
      code: "invalid_value",
      type: "invalid_request_error",
      param: "file",
    });

    expect(sanitizeErrorForTelemetry(error)).toMatchObject({
      error_code: "INTERNAL_ERROR",
      error_message: "Internal server error.",
      upstream_status: 400,
      upstream_code: "invalid_value",
      upstream_type: "invalid_request_error",
      upstream_message: "Invalid value for audio",
      upstream_param: "file",
    });
  });
});
