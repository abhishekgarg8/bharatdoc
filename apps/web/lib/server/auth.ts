import { AppError } from "@/lib/server/errors";

export interface VerifiedUser {
  uid: string;
  phoneNumber: string;
}

export interface TokenVerifier {
  verifyIdToken(token: string): Promise<VerifiedUser>;
}

export function extractBearerToken(header: string | null): string {
  if (!header) {
    throw new AppError(401, "Authorization bearer token is required.", "AUTH_REQUIRED");
  }

  const match = header.match(/^Bearer\s+(.+)$/i);

  if (!match?.[1]) {
    throw new AppError(401, "Authorization bearer token is malformed.", "AUTH_REQUIRED");
  }

  return match[1].trim();
}

export async function verifyRequestUser(request: Request, tokenVerifier: TokenVerifier): Promise<VerifiedUser> {
  const token = extractBearerToken(request.headers.get("authorization"));
  return tokenVerifier.verifyIdToken(token);
}
