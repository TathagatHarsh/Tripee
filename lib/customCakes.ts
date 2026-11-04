import { normalizePhone, siteUrl } from "./whatsapp";

/**
 * The bakery's own custom work, shown at /custom-cakes and on the home page.
 *
 * Files live in public/custom/, made from the client's WhatsApp exports: photos
 * as WebP at 1200px tall, videos as silent H.264 with a WebP poster. Both drop
 * the phone's EXIF, location included. Custom cakes are quoted, not sold from
 * the catalogue, so every call to action is a WhatsApp chat with the bakery.
 */
export type CustomGroup = "kids" | "weddings" | "celebrations";

export interface CustomCake {
  id: string;
  group: CustomGroup;
  alt: string;
  width: number;
  height: number;
  /** Photos are `/custom/<id>.webp`; videos are `/custom/<id>.mp4` with a `.poster.webp`. */
  video?: true;
}

export const CUSTOM_GROUPS: { id: CustomGroup; title: string; blurb: string }[] = [
  { id: "kids", title: "Kids' birthdays", blurb: "Jungles, princesses, space and superheroes, with their name on top." },
  { id: "weddings", title: "Weddings & engagements", blurb: "Tiered, floral and as grand or as quiet as the day." },
  { id: "celebrations", title: "Every other celebration", blurb: "Anniversaries, milestones, big birthdays and just because." },
];

const P = 900, T = 1200, N = 675, V = { width: 576, height: 1024, video: true } as const;

export const CUSTOM_CAKES: CustomCake[] = [
  { id: "jungle-three-tier", group: "kids", width: P, height: T, alt: "Three-tier jungle cake for a fourth birthday with a lion, giraffe and elephants" },
  { id: "space-astronaut-moon", group: "kids", width: P, height: T, alt: "Two-tier blue space cake with an astronaut on a crescent moon" },
  { id: "under-the-sea", group: "kids", ...V, alt: "Three-tier under-the-sea cake with a whale, an octopus and seahorses" },
  { id: "unicorn-rainbow", group: "kids", width: P, height: T, alt: "Pink unicorn and rainbow cake for a second birthday" },
  { id: "racing-two-tier", group: "kids", width: N, height: T, alt: "Two-tier racing cake with cars, road signs and a superhero for a seventh birthday" },
  { id: "frozen-third-birthday", group: "kids", width: P, height: T, alt: "Frozen-themed cake for a third birthday with snowflakes and sugar pearls" },
  { id: "doll-red-frock", group: "kids", width: N, height: T, alt: "Fondant doll in a red frock on a white and pink ombré cake with sugar flowers" },
  { id: "jungle-tree-two-tier", group: "kids", width: P, height: T, alt: "Two-tier jungle birthday cake with a lion on top, a tree, monkeys, a giraffe and an elephant" },
  { id: "teddy-cloud-two-tier", group: "kids", ...V, alt: "Two-tier teddy bear cake with clouds, gold stars and bunting" },
  { id: "construction-digger", group: "kids", width: P, height: T, alt: "Construction-site birthday cake with a digger, cones and a little builder" },
  { id: "lilac-princess", group: "kids", width: P, height: T, alt: "Lilac princess cake with a fondant princess topper" },
  { id: "jungle-lion-bunting", group: "kids", width: N, height: T, alt: "Two-tier jungle cake with a lion, a monkey, a giraffe and bunting" },
  { id: "moon-stars-dancer", group: "kids", width: P, height: T, alt: "Grey and blue cake with a gold crescent moon, stars and a little fondant dancer" },
  { id: "teddy-lilac-two-tier", group: "kids", width: P, height: T, alt: "Two-tier lilac and white teddy bear cake with balloons and bunting" },
  { id: "frozen-elsa", group: "kids", width: N, height: T, alt: "Frozen-themed cake with a snow princess, a snowman and snowflakes" },
  { id: "playing-cards-first-birthday", group: "kids", width: P, height: T, alt: "Red and black playing-card cake with a gold crown for a first birthday" },
  { id: "butterfly-fairy", group: "kids", width: N, height: T, alt: "White and pink butterfly cake with a fondant fairy" },
  { id: "jungle-white-gifts", group: "kids", width: P, height: T, alt: "White jungle birthday cake with a lion, a monkey, a zebra and a giraffe" },
  { id: "girl-pink-balloons", group: "kids", width: P, height: T, alt: "White cake with a fondant girl in a pink dress and pink balloons" },
  { id: "doll-red-dress-daisies", group: "kids", width: P, height: T, alt: "White and pink cake with a fondant girl in a red dress and sugar daisies" },
  { id: "jungle-sheet-first-birthday", group: "kids", width: P, height: T, alt: "Teal sheet cake with jungle animal toppers for a first birthday" },

  { id: "engaged-three-tier-rings", group: "weddings", width: N, height: T, alt: "Three-tier white and sage Just Engaged cake with roses and a ring topper" },
  { id: "happy-married-lilac", group: "weddings", ...V, alt: "Three-tier lilac Happy Married cake with lilies and orchids" },
  { id: "engaged-sage-lilies", group: "weddings", width: P, height: T, alt: "Sage green Just Engaged cake with white lilies and roses" },
  { id: "white-pink-lilies", group: "weddings", width: P, height: T, alt: "Two-tier white cake with pink and white lilies" },
  { id: "engaged-ombre-roses", group: "weddings", width: N, height: T, alt: "Three-tier ombré engagement cake with white roses and baby's breath" },
  { id: "white-flower-garland", group: "weddings", width: P, height: T, alt: "Two-tier white cake with a garland of piped pink flowers" },

  { id: "sage-gold-drip", group: "celebrations", width: N, height: T, alt: "Sage and cream cake with a gold drip and fresh roses" },
  { id: "swan-three-tier", group: "celebrations", ...V, alt: "Three-tier white birthday cake with sugar swans and pearl balls" },
  { id: "purple-drape-lily", group: "celebrations", width: N, height: T, alt: "Two-tier purple cake with a fondant drape, pearls and a white lily" },
  { id: "fresh-roses-sunflowers", group: "celebrations", width: P, height: T, alt: "Two-tier white cake dressed with fresh roses and sunflowers" },
  { id: "birthday-king", group: "celebrations", width: P, height: T, alt: "Blue and white Birthday King cake with gold accents" },
  { id: "doctor-coat", group: "celebrations", width: P, height: T, alt: "White doctor's-coat cake with a pink collar and a fondant stethoscope" },
  { id: "pink-heart", group: "celebrations", width: P, height: T, alt: "Heart-shaped pink cake with a sugar rose" },
  { id: "pink-bows", group: "celebrations", width: P, height: T, alt: "Pink cake wrapped with ribbon bows" },
  { id: "handwritten-sheet", group: "celebrations", width: P, height: T, alt: "White cream sheet cake with a handwritten chocolate birthday message" },
  { id: "large-sheet-piped", group: "celebrations", width: 1175, height: T, alt: "Large cream sheet cake with a piped birthday message and a biscuit border" },
];

/** The six the home page shows. */
export const HOME_CUSTOM_IDS = ["jungle-three-tier", "engaged-three-tier-rings", "space-astronaut-moon", "sage-gold-drip", "unicorn-rainbow", "racing-two-tier"];

export const customSrc = (c: CustomCake) => `/custom/${c.id}.${c.video ? "mp4" : "webp"}`;
export const customPoster = (c: CustomCake) => `/custom/${c.id}.poster.webp`;

export const PHOTO_ENQUIRY =
  "Hi MakeYourCakes! I'd like a custom cake. I'm sending a photo of the design I have in mind.";

export const likeThisEnquiry = (c: CustomCake) =>
  `Hi MakeYourCakes! I'd like a custom cake like this one: ${siteUrl()}/custom-cakes#${c.id}`;

/** A wa.me chat with the bakery's number from /admin/settings, or null if that number is not a phone. */
export function whatsappHref(phone: string, text: string): string | null {
  const to = normalizePhone(phone);
  return to ? `https://wa.me/${to}?text=${encodeURIComponent(text)}` : null;
}
