import { z } from "zod";

export const UsernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(40)
  .regex(/^[a-zA-Z0-9._-]+$/, "Use only letters, numbers, dots, underscores, or hyphens.")
  .transform((value) => value.toLowerCase());

export const PasswordSchema = z.string().min(8).max(128);

export const PasswordCredentialsSchema = z.object({
  username: UsernameSchema,
  password: PasswordSchema
});

export type PasswordCredentials = z.infer<typeof PasswordCredentialsSchema>;

export function normalizeUsername(username: string): string {
  return UsernameSchema.parse(username);
}

export function usernameToAuthEmail(username: string): string {
  return `${normalizeUsername(username)}@bharatdoc.local`;
}
