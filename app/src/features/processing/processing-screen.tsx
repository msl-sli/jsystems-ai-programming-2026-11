import { Spinner } from "@/components/ui/spinner";
import type { ProcessingStage } from "@/features/case-session/reducer";

export const PROCESSING_STAGE_TEXT: Record<ProcessingStage, string> = {
  screening: "Analizujemy zdjęcie…",
  decision: "Przygotowujemy decyzję…",
};
export const PROCESSING_HINT = "To może potrwać do minuty.";

/** Processing screen (AC-14, PRD 9.2): thumbnail, progress indicator, stage text; no cancel. */
export function ProcessingScreen({
  photoUrl,
  stage,
}: {
  photoUrl: string | null;
  stage: ProcessingStage;
}) {
  return (
    <div
      data-testid="processing-screen"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center"
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- blob: URL of the user's photo
        <img
          src={photoUrl}
          alt="Przesłane zdjęcie sprzętu"
          className="size-32 rounded-lg object-cover"
        />
      ) : null}
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col items-center gap-2"
      >
        <Spinner
          aria-hidden="true"
          aria-label="Trwa analiza zgłoszenia"
          className="size-8"
        />
        <p className="text-lg font-medium">{PROCESSING_STAGE_TEXT[stage]}</p>
        <p className="text-sm text-muted-foreground">{PROCESSING_HINT}</p>
      </div>
    </div>
  );
}
