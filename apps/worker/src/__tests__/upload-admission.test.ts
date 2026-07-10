import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  createUploadAdmission,
  holdUploadPermitForHandler,
  MAX_TRANSCRIPTION_REQUEST_BYTES,
} from "../upload-admission.js";

const auth = {
  doctor: { id: "doctor-1" },
};

function requestWith(contentLength?: string, idempotencyKey?: string) {
  return Object.assign(new EventEmitter(), {
    header: vi.fn((name: string) =>
      name === "content-length"
        ? contentLength
        : name === "idempotency-key"
          ? idempotencyKey
        : name === "content-type"
          ? "multipart/form-data; boundary=test"
          : undefined,
    ),
    socket: { remoteAddress: "127.0.0.1" },
  });
}

function requestFrom(ipHeader: string | undefined) {
  const req = requestWith();
  req.header = vi.fn((name: string) =>
    name === "x-real-ip"
      ? ipHeader
      : name === "content-type"
        ? "multipart/form-data; boundary=test"
        : undefined,
  );
  return req;
}

function response() {
  return Object.assign(new EventEmitter(), {
    locals: { auth },
    setHeader: vi.fn(),
  });
}

describe("upload admission", () => {
  it("uses Railway's single validated IP and falls back for malformed values", () => {
    const { limitIp } = createUploadAdmission({ maxPerIp: 1 });
    const accepted = vi.fn();
    limitIp(requestFrom("192.0.2.1") as never, response() as never, accepted);
    expect(accepted).toHaveBeenCalledWith(undefined);

    const separateIp = vi.fn();
    limitIp(
      requestFrom("198.51.100.2") as never,
      response() as never,
      separateIp,
    );
    expect(separateIp).toHaveBeenCalledWith(undefined);

    const fallback = vi.fn();
    limitIp(
      requestFrom("192.0.2.1, 198.51.100.2") as never,
      response() as never,
      fallback,
    );
    expect(fallback).toHaveBeenCalledWith(undefined);

    const sameFallback = vi.fn();
    limitIp(
      requestFrom("not-an-ip") as never,
      response() as never,
      sameFallback,
    );
    expect(sameFallback).toHaveBeenCalledWith(
      expect.objectContaining({ code: "UPLOAD_IP_RATE_LIMITED" }),
    );
  });

  it("rejects a declared oversized request before acquiring upload memory", () => {
    const { admitAuthenticated } = createUploadAdmission();
    const next = vi.fn();

    admitAuthenticated(
      requestWith(String(MAX_TRANSCRIPTION_REQUEST_BYTES + 1)) as never,
      response() as never,
      next,
    );

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 413,
        code: "AUDIO_TOO_LARGE",
      }),
    );
  });

  it("releases a process permit exactly once across finish and close", () => {
    const { admitAuthenticated } = createUploadAdmission({
      maxConcurrent: 1,
      maxPerUser: 10,
    });
    const firstResponse = response();
    const firstNext = vi.fn();
    admitAuthenticated(
      requestWith() as never,
      firstResponse as never,
      firstNext,
    );
    expect(firstNext).toHaveBeenCalledWith();

    const blockedNext = vi.fn();
    admitAuthenticated(
      requestWith() as never,
      response() as never,
      blockedNext,
    );
    expect(blockedNext).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 429,
        code: "UPLOAD_CONCURRENCY_LIMITED",
      }),
    );

    firstResponse.emit("finish");
    firstResponse.emit("close");
    const admittedResponse = response();
    const admittedNext = vi.fn();
    admitAuthenticated(
      requestWith() as never,
      admittedResponse as never,
      admittedNext,
    );
    expect(admittedNext).toHaveBeenCalledWith();

    const stillBlocked = vi.fn();
    admitAuthenticated(
      requestWith() as never,
      response() as never,
      stillBlocked,
    );
    expect(stillBlocked).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 429,
        code: "UPLOAD_CONCURRENCY_LIMITED",
      }),
    );
  });

  it("releases admission when a client aborts during multipart parsing", () => {
    const { admitAuthenticated } = createUploadAdmission({
      maxConcurrent: 1,
      maxPerUser: 10,
    });
    const abortedRequest = requestWith();
    admitAuthenticated(
      abortedRequest as never,
      response() as never,
      vi.fn(),
    );
    abortedRequest.emit("aborted");

    const admitted = vi.fn();
    admitAuthenticated(requestWith() as never, response() as never, admitted);
    expect(admitted).toHaveBeenCalledWith();
  });

  it("holds a permit after client close while the handler still owns the buffer", () => {
    const { admitAuthenticated } = createUploadAdmission({
      maxConcurrent: 1,
      maxPerUser: 10,
    });
    const activeResponse = response();
    admitAuthenticated(
      requestWith() as never,
      activeResponse as never,
      vi.fn(),
    );
    const release = holdUploadPermitForHandler(activeResponse as never);
    activeResponse.emit("close");

    const blocked = vi.fn();
    admitAuthenticated(requestWith() as never, response() as never, blocked);
    expect(blocked).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "UPLOAD_CONCURRENCY_LIMITED",
      }),
    );

    release();
    const admitted = vi.fn();
    admitAuthenticated(requestWith() as never, response() as never, admitted);
    expect(admitted).toHaveBeenCalledWith();
  });

  it("queues one canonical duplicate without admitting a distinct upload", () => {
    const { admitAuthenticated } = createUploadAdmission({ maxConcurrent: 1, maxPerUser: 10 });
    const key = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:transcription:v1";
    const firstResponse = response();
    admitAuthenticated(requestWith("512", key) as never, firstResponse as never, vi.fn());

    const duplicate = vi.fn();
    admitAuthenticated(requestWith("512", key) as never, response() as never, duplicate);
    expect(duplicate).not.toHaveBeenCalled();

    const queueOverflow = vi.fn();
    admitAuthenticated(requestWith("512", key) as never, response() as never, queueOverflow);
    expect(queueOverflow).toHaveBeenCalledWith(
      expect.objectContaining({ code: "UPLOAD_CONCURRENCY_LIMITED" }),
    );

    const distinct = vi.fn();
    const distinctKey = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb:transcription:v1";
    admitAuthenticated(requestWith("512", distinctKey) as never, response() as never, distinct);
    expect(distinct).toHaveBeenCalledWith(expect.objectContaining({ code: "UPLOAD_CONCURRENCY_LIMITED" }));

    firstResponse.emit("finish");
    expect(duplicate).toHaveBeenCalledWith();
  });

  it("removes an aborted duplicate from the bounded queue", () => {
    const { admitAuthenticated } = createUploadAdmission({ maxConcurrent: 1, maxPerUser: 10 });
    const key = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:transcription:v1";
    const firstResponse = response();
    admitAuthenticated(requestWith("512", key) as never, firstResponse as never, vi.fn());
    const queuedRequest = requestWith("512", key);
    const queued = vi.fn();
    admitAuthenticated(queuedRequest as never, response() as never, queued);
    queuedRequest.emit("aborted");
    firstResponse.emit("finish");

    expect(queued).not.toHaveBeenCalled();
    const admitted = vi.fn();
    admitAuthenticated(requestWith() as never, response() as never, admitted);
    expect(admitted).toHaveBeenCalledWith();
  });
});
