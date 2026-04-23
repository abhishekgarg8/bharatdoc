import { AccessError } from "@bharatdoc/shared";
import { describe, expect, it } from "vitest";
import { AppError, toAppError } from "@/lib/server/errors";

describe("server error mapping", () => {
  it("keeps explicit app errors unchanged", () => {
    const error = new AppError(404, "Missing profile.", "PROFILE_NOT_FOUND");

    expect(toAppError(error)).toBe(error);
  });

  it("maps shared access errors to API statuses", () => {
    const error = toAppError(new AccessError("Doctor account is not active.", "ACCOUNT_INACTIVE"));

    expect(error).toMatchObject({
      status: 403,
      code: "ACCOUNT_INACTIVE",
      message: "Doctor account is not active."
    });
  });
});
