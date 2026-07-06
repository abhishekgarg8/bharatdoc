import { CLINIC_CODE_LENGTH } from "./constants.js";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CLINIC_CODE_PATTERN = new RegExp(`^[A-Z2-9]{${CLINIC_CODE_LENGTH}}$`);
const PGIMER_CLINIC_CODE = "PGIMER";

export type RandomByteSource = (size: number) => Uint8Array;

function defaultRandomBytes(size: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(size));
}

export function generateClinicCode(randomBytes: RandomByteSource = defaultRandomBytes): string {
  const bytes = randomBytes(CLINIC_CODE_LENGTH);

  if (bytes.length < CLINIC_CODE_LENGTH) {
    throw new Error("Random byte source returned too few bytes.");
  }

  return Array.from(bytes)
    .slice(0, CLINIC_CODE_LENGTH)
    .map((byte) => ALPHABET[byte % ALPHABET.length])
    .join("");
}

export function isClinicCode(value: string): boolean {
  return CLINIC_CODE_PATTERN.test(value);
}

export function normalizeClinicCode(value: string): string {
  return value.trim().toUpperCase();
}

export function isPgimerClinicCode(value: string): boolean {
  return normalizeClinicCode(value) === PGIMER_CLINIC_CODE;
}
