import { z } from "zod";

export const EmailSchema = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());

export const PasswordSchema = z.string().min(8).max(128);

export const PasswordCredentialsSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema
});

export type PasswordCredentials = z.infer<typeof PasswordCredentialsSchema>;

export function normalizeEmail(email: string): string {
  return EmailSchema.parse(email);
}
