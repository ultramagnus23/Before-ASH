import { z } from "zod";
import { isReservedHandle } from "./auth/reserved-handles";

const ALLOWED_EMAIL_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN ?? "ashoka.edu.in";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .refine((email) => email.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`), {
    message: `Ashoka addresses only (@${ALLOWED_EMAIL_DOMAIN}).`,
  });

export const handleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "At least 3 characters.")
  .max(20, "At most 20 characters.")
  .regex(/^[a-z0-9_]+$/, "Lowercase letters, numbers, and underscores only.")
  .refine((h) => !isReservedHandle(h), { message: "That handle is reserved." });

// Strips URLs and @handles server-side, per BUILD-PROMPT.md non-negotiable
// #5 — bio is opt-in, 140 chars, no links or handles, and that stripping
// happens here regardless of what client-side validation already did.
export function sanitizeBio(raw: string): string {
  return raw
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\bwww\.\S+/gi, "")
    .replace(/@[a-z0-9_]+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

export const bioSchema = z
  .string()
  .trim()
  .max(280) // generous pre-sanitize ceiling; sanitizeBio() enforces the real 140-char limit after stripping
  .transform(sanitizeBio);

export const linkSchema = z.object({
  label: z.string().trim().min(1).max(40),
  url: z.string().trim().url().refine((u) => u.startsWith("http://") || u.startsWith("https://"), {
    message: "Only http/https links.",
  }),
});

export const itemPostSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  links: z.array(linkSchema).max(5).optional(),
});
