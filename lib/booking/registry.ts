import { z } from "zod";
import rawConfig from "@/config/booking-providers.json";
import {
  DISTANCE_BANDS,
  type BookingAdapter,
  type BookingContext,
  type BookingLink,
} from "./types";

/*
 * Loading and validating the provider config.
 *
 * No host is written in this file, or in any .ts file. Everything comes from
 * config/booking-providers.json, so repointing or removing a provider is a
 * data edit — which is what "no hardcoded hosts, ever" has to mean in
 * practice if it means anything.
 */

const ProviderSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  urlTemplate: z.string().url(),
  bands: z.array(z.enum(DISTANCE_BANDS as [string, ...string[]])).min(1),
  /** Empty means "any category". */
  categories: z.array(z.string()),
});

const ConfigSchema = z.object({
  providers: z.array(ProviderSchema),
});

const PLACEHOLDER = /\{(\w+)\}/g;
const SUPPORTED_PLACEHOLDERS = new Set(["query"]);

export class BookingConfigError extends Error {}

function validate(config: z.infer<typeof ConfigSchema>) {
  const seen = new Set<string>();
  for (const provider of config.providers) {
    if (seen.has(provider.id)) {
      throw new BookingConfigError(`Duplicate booking provider id: ${provider.id}`);
    }
    seen.add(provider.id);

    // A typo'd placeholder would otherwise ship as a literal "{querry}" in
    // someone's address bar, which looks like the app is broken rather than
    // the config being wrong.
    for (const match of provider.urlTemplate.matchAll(PLACEHOLDER)) {
      const name = match[1] ?? "";
      if (!SUPPORTED_PLACEHOLDERS.has(name)) {
        throw new BookingConfigError(
          `Booking provider ${provider.id} uses unknown placeholder {${name}}. Supported: ${[...SUPPORTED_PLACEHOLDERS].join(", ")}`
        );
      }
    }

    // Nothing goes out over plain http, and nothing gets to be a relative
    // path that would resolve against our own origin.
    if (!provider.urlTemplate.startsWith("https://")) {
      throw new BookingConfigError(`Booking provider ${provider.id} must use https.`);
    }
  }
}

class TemplateAdapter implements BookingAdapter {
  constructor(
    readonly id: string,
    readonly label: string,
    private readonly urlTemplate: string,
    private readonly bands: string[],
    private readonly categories: string[]
  ) {}

  linkFor(context: BookingContext): BookingLink | null {
    if (!this.bands.includes(context.band)) return null;
    if (this.categories.length > 0 && !this.categories.includes(context.category)) return null;

    const url = this.urlTemplate.replace(PLACEHOLDER, (_match, name: string) =>
      name === "query" ? encodeURIComponent(context.title) : _match
    );
    return { providerId: this.id, label: this.label, url };
  }
}

let cached: BookingAdapter[] | null = null;

/**
 * The configured providers.
 *
 * A malformed config throws rather than silently returning fewer providers:
 * a booking section that quietly empties out is indistinguishable from one
 * where nothing happened to match, and the difference matters.
 */
export function getBookingAdapters(): BookingAdapter[] {
  if (cached) return cached;

  const parsed = ConfigSchema.safeParse(rawConfig);
  if (!parsed.success) {
    throw new BookingConfigError(`config/booking-providers.json is invalid: ${parsed.error.message}`);
  }
  validate(parsed.data);

  cached = parsed.data.providers.map(
    (p) => new TemplateAdapter(p.id, p.label, p.urlTemplate, p.bands, p.categories)
  );
  return cached;
}

/** Test seam — the config is module-level, so the cache has to be resettable. */
export function resetBookingAdapters() {
  cached = null;
}

export function bookingLinksFor(context: BookingContext): BookingLink[] {
  return getBookingAdapters()
    .map((adapter) => adapter.linkFor(context))
    .filter((link): link is BookingLink => link !== null);
}
