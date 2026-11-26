prompt-version: 2026-11-26.1

# Screening questions (TypeSafe Jev 1.14)

Parsed by `server/ai/screening.ts`: one `## <id>` section per question with a `type:` line, an `instructions:` line and a list of
`- <key>: <criterion>` items. The `instruction` section is the fixed state text. Option keys must match the enums in `domain/contracts.ts`.

## instruction
Customer-submitted photo of an electronic device for a return or warranty complaint

## photo_quality
type: choice
instructions: Judge only the photo: can the device and its surface condition be assessed from it?
- ok: The device is clearly visible and sharp enough to judge its surface condition.
- blurry: The photo is out of focus or motion-blurred, so the surface condition cannot be judged.
- too_dark: The photo is too dark or badly lit to judge the surface condition.
- device_not_fully_visible: Part of the device is cut off, hidden or too far away to judge the whole surface.
- no_device: The photo does not show an electronic device.

## observed_category
type: choice
instructions: Which kind of device is actually visible in the photo, regardless of what the form says?
- laptop: A laptop or notebook computer.
- smartphone: A smartphone or mobile phone.
- tablet: A tablet.
- monitor: A computer monitor or display.
- tv: A television set.
- audio: Headphones, earbuds, a speaker or other audio equipment.
- console: A video game console or a game controller.
- other_electronics: Any other electronic device that is not one of the categories above.
- no_device: No electronic device is visible.

## visible_damage_or_use
type: boolean
instructions: Does the device show any visible damage or sign of use?
- true: Any visible damage or sign of use: scratches, scuffs, dents, cracks, chips, stains, dirt, residue, user stickers, missing parts, liquid marks or discoloration.
- false: The device shows no visible damage and no sign of use.

## condition
type: score
instructions: Rate the overall visible condition of the device.
- 0: Like new, no visible marks.
- 1: Minor marks visible only on close inspection.
- 2: Clear signs of use.
- 3: Damaged.
