import { describe, it, expect } from "vitest";
import { bookingLinksFor, getBookingAdapters } from "@/lib/booking/registry";
import { bandForLocale } from "@/lib/booking/types";

describe("bandForLocale", () => {
  it("maps the catalog vocabulary onto distance bands", () => {
    expect(bandForLocale("campus")).toBe("on_campus");
    expect(bandForLocale("ncr")).toBe("ncr");
  });

  it("treats placeless items as the widest band", () => {
    // "anywhere" and "any" are habits and admin, not destinations. Mapping
    // either onto a narrow band is how a metro route ends up attached to
    // "set up a password manager".
    expect(bandForLocale("anywhere")).toBe("anywhere");
    expect(bandForLocale("any")).toBe("anywhere");
  });
});

describe("the provider config", () => {
  it("loads and validates", () => {
    expect(getBookingAdapters().length).toBeGreaterThan(0);
  });

  it("has no provider pointing anywhere but https", () => {
    for (const link of bookingLinksFor({ title: "x", category: "food", band: "ncr" })) {
      expect(link.url.startsWith("https://")).toBe(true);
    }
  });
});

describe("bookingLinksFor", () => {
  it("URL-encodes the title rather than pasting it raw", () => {
    const [link] = bookingLinksFor({
      title: "Chai & samosa at 3am",
      category: "food",
      band: "ncr",
    });
    expect(link!.url).not.toContain(" ");
    expect(link!.url).not.toContain("&samosa");
    expect(link!.url).toContain("Chai%20%26%20samosa");
  });

  it("leaves no unreplaced placeholder in any produced URL", () => {
    for (const band of ["on_campus", "sonipat", "ncr", "anywhere"] as const) {
      for (const link of bookingLinksFor({ title: "test", category: "food", band })) {
        expect(link.url, `${link.providerId} @ ${band}`).not.toMatch(/\{.*?\}/);
      }
    }
  });

  it("declines providers outside the item's band", () => {
    const onCampus = bookingLinksFor({ title: "x", category: "food", band: "on_campus" });
    // A restaurant booking site has nothing to say about something happening
    // inside the campus gates.
    expect(onCampus.map((l) => l.providerId)).not.toContain("zomato");
  });

  it("declines providers outside the item's category", () => {
    const links = bookingLinksFor({ title: "x", category: "academic", band: "ncr" });
    expect(links.map((l) => l.providerId)).not.toContain("zomato");
  });

  it("treats an empty category list as 'any category'", () => {
    const links = bookingLinksFor({ title: "x", category: "something_new", band: "on_campus" });
    expect(links.map((l) => l.providerId)).toContain("google-maps");
  });

  it("returns an empty list rather than throwing when nothing matches", () => {
    // The page must render fine with no booking section at all -- most of
    // the catalog is habits and campus rituals that nobody books.
    expect(() => bookingLinksFor({ title: "x", category: "nope", band: "anywhere" })).not.toThrow();
  });

  it("never invents a price, availability or booking state", () => {
    // The adapter interface has no surface for it, and this test exists so
    // that adding one is a deliberate, visible decision rather than a quiet
    // extension of an object literal.
    for (const link of bookingLinksFor({ title: "x", category: "food", band: "ncr" })) {
      expect(Object.keys(link).sort()).toEqual(["label", "providerId", "url"]);
    }
  });
});
