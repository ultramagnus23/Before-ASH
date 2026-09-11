/*
 * Task 5 — booking deep links.
 *
 * The adapter interface. Every provider is the same shape: given an item and
 * a distance band, either produce a link or decline. There is deliberately no
 * `getPrice`, no `getAvailability`, no `book()` — none of these companies has
 * given this app an API, and a method that cannot be implemented honestly is
 * an invitation to fake it later.
 *
 * A provider that ever does get a real integration implements this same
 * interface and returns a better URL. Nothing else in the app changes.
 */

/**
 * How far the thing is, which is what decides whether a provider is even
 * relevant. Derived from the catalog's `locale`, not from GPS: the app never
 * asks for a location, and for a single-campus product the item's own locale
 * is a better answer than a coordinate anyway.
 */
export type DistanceBand = "on_campus" | "sonipat" | "ncr" | "anywhere";

export const DISTANCE_BANDS: DistanceBand[] = ["on_campus", "sonipat", "ncr", "anywhere"];

export type BookingContext = {
  title: string;
  category: string;
  band: DistanceBand;
};

export type BookingLink = {
  providerId: string;
  label: string;
  url: string;
};

export interface BookingAdapter {
  readonly id: string;
  readonly label: string;
  /** Null when this provider has nothing useful to offer for this item. */
  linkFor(context: BookingContext): BookingLink | null;
}

/**
 * The catalog's locale vocabulary is not the same as a distance band, and
 * conflating them is how "anywhere" ends up showing a Delhi metro route.
 *
 * `campus` is on campus. `ncr` means it is out in Delhi NCR. `anywhere` and
 * `any` are items with no particular place attached — a habit, a piece of
 * admin — and they get the widest band, which most providers decline.
 */
export function bandForLocale(locale: string): DistanceBand {
  switch (locale) {
    case "campus":
      return "on_campus";
    case "ncr":
      return "ncr";
    default:
      return "anywhere";
  }
}
