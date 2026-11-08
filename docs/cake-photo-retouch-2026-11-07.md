# Cake photo retouch — 7 November 2026

Edited with the built-in Imagegen tool, visually reviewed, and exported as WebP at the existing dimensions. The teddy-cloud video is replaced by its cleaned still so playback cannot reveal the name. Original assets remain recoverable from Git history.

## Saved assets

- `public/custom/jungle-three-tier-name-free.webp`
- `public/custom/unicorn-rainbow-name-free.webp`
- `public/custom/jungle-lion-bunting-name-free.webp`
- `public/custom/jungle-sheet-first-birthday-name-free.webp`
- `public/custom/handwritten-sheet-name-free.webp`
- `public/custom/large-sheet-piped-name-free.webp`
- `public/custom/playing-cards-first-birthday-name-free.webp`
- `public/custom/teddy-lilac-two-tier-name-free.webp`
- `public/custom/teddy-cloud-two-tier-name-free.webp`

## Prompt

Use case: precise-object-edit. Retouch this exact cake product photograph for a professional website. Remove every personal name from the cake and background cakes, including lettering on toppers and plaques. Reconstruct matching frosting or underlying rainbow/pattern seamlessly. For name-only paper cutouts remove the cutout too. Keep decorative plaques naturally blank, and preserve generic Happy Birthday messages, ages, characters, cake geometry, all other decorations, camera perspective, framing, lighting and background. Do not add text or new decorations. No blur or visible retouch patches. Image is the edit target.

The jungle-three-tier prompt specifically requested removal of “Ishaan” and its outline plus the name on the background rainbow, preserving the cream frosting, animal cutouts and number 4.

## Unresolved image-service rejections

`racing-two-tier`, `frozen-third-birthday`, and `frozen-elsa`: the service rejected output with `moderation_blocked`, category `other`, including on a retry. Originals have not been retouched.

## Layout validation

The homepage badge retains the existing copy, wraps within its container, and uses a non-shrinking decorative icon. Checked in Chrome at 375, 768, 1024, 1440 and 1920 pixels: no badge overflow. Type checking, targeted lint and all five custom-gallery tests passed. Preview used the existing no-database fallback because configured database credentials failed authentication.


## Temporarily hidden at client request

The racing cake and both Frozen-themed cakes are removed from the public gallery. Their originals are preserved in `assets/custom-cakes-pending-retouch/`, outside the publicly served directory. The homepage now features the cleaned lilac teddy cake in place of the racing cake. Restore these entries only after name-free replacements are ready:

```ts
  { id: "racing-two-tier", group: "kids", width: N, height: T, alt: "Two-tier racing cake with cars, road signs and a superhero for a seventh birthday" },
  { id: "frozen-third-birthday", group: "kids", width: P, height: T, alt: "Frozen-themed cake for a third birthday with snowflakes and sugar pearls" },
  { id: "frozen-elsa", group: "kids", width: N, height: T, alt: "Frozen-themed cake with a snow princess, a snowman and snowflakes" },
```
