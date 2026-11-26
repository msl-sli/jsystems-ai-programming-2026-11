# Complaint (Warranty) Policy (fictional, PoC)

> Fictional, simplified company policy created for the Hardware Service Decision Copilot PoC.
> It is not based on, and does not claim compliance with, any consumer law.
> The decision agent follows these rules for every **complaint** case. Rule IDs (e.g. `CMP-3`) are cited in decision justifications.

## CMP-1 Warranty period
The warranty lasts **24 months** from the purchase date entered in the form.
- Within 24 months: eligible, subject to the remaining rules.
- After 24 months: the complaint is **Rejected**. The customer is told that paid repair is available by contacting support.

## CMP-2 Covered defects
The warranty covers defects that result from manufacturing or from normal, intended use, for example:
- the device does not power on or charge without visible physical damage,
- dead or stuck pixels, backlight bleeding, screen lines without an impact point,
- swollen battery without signs of impact,
- hinge, port, button or speaker failure without signs of force or impact,
- overheating or random shutdowns described by the customer without visible damage.

## CMP-3 Excluded damage
The warranty does **not** cover:
- mechanical damage: cracked or shattered screen or body with a visible impact point, dents, bent frames,
- liquid damage: visible corrosion, liquid marks, water inside a display,
- damage from unauthorized repair or modification (missing screws, opened seals, non-original parts visible),
- normal cosmetic wear (light scratches, worn coating) that does not affect function.

If the photo shows excluded damage that plausibly explains the reported problem, the complaint is **Rejected** and the justification names the visible damage and its likely cause.

## CMP-4 Remedy
For an accepted complaint:
- **Accepted – replacement or refund** when the defect is reported within **30 days** of purchase (dead-on-arrival rule).
- **Accepted – repair** in all other accepted cases. If repair proves impossible, the service team offers a replacement or refund after inspection (outside this application).

## CMP-5 Description required
The customer must describe the problem. The decision is based on both the description and the photo. If the description and photo contradict each other (e.g. "screen does not turn on" but the photo shows a working, lit screen), the decision is **Needs manual review**.

## CMP-6 Photo quality and uncertain cause
- If the photo is blurry, too dark, shows a different product type, or shows no product, no decision is made (**Needs manual review**) and the customer is asked to file a new case with a better photo.
- If the damage is visible but its cause cannot be determined (manufacturing defect vs. user damage), the decision is **Needs manual review** and the agent states what is uncertain.
- If the reported defect cannot be visible in a photo (e.g. "does not charge") and the photo shows no excluded damage, the complaint is accepted according to CMP-4.

## CMP-7 Next steps after acceptance
1. Back up personal data and remove passwords/locks from the device.
2. Send the device with a copy of the proof of purchase to: Hardware Service Center, ul. Przykładowa 2, 00-001 Warszawa (fictional address).
3. The device is inspected on arrival. The decision becomes final only after this physical inspection.
4. Repair or replacement is completed within 14 days of receipt.

## CMP-8 Manual review
For **Needs manual review**, the customer is told to contact support at `support@example.com` (fictional) or to file a new case with a better photo, as applicable.
