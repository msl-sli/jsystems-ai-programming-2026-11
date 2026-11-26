"use client";

import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  CASE_CATEGORY_LABELS,
  CASE_TYPE_LABELS,
  type CaseInput,
} from "@/domain/case-schema";
import type { DecisionHistoryEntry } from "@/domain/contracts";
import { DecisionBadge } from "./decision-badge";
import { CHAT_TEXTS as T } from "./texts";

/** ISO yyyy-mm-dd to dd.MM.yyyy without a Date object (no time-zone shift). */
export function formatPurchaseDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function Fact({ label, children }: { label: string; children: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-text-secondary">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}

/** AC-29: case summary above the conversation; details collapse on mobile. */
export function CaseSummaryCard({
  caseInput,
  photoUrl,
  decision,
}: {
  caseInput: CaseInput;
  photoUrl: string | null;
  decision: DecisionHistoryEntry;
}) {
  const [open, setOpen] = useState(true);
  return (
    <Card data-testid="case-summary" size="sm" className="shrink-0">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-sm font-semibold">
            {T.summaryTitle}
          </CardTitle>
          <DecisionBadge category={decision.category} label={decision.label} />
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto md:hidden"
              aria-label={T.summaryDetails}
            >
              <ChevronDownIcon
                className={
                  open
                    ? "rotate-180 transition-transform"
                    : "transition-transform"
                }
              />
            </Button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent
          forceMount
          className="data-[state=closed]:hidden md:data-[state=closed]:block"
        >
          <CardContent className="flex items-start gap-4 pt-3">
            {photoUrl ? (
              <Dialog>
                <DialogTrigger asChild>
                  <button
                    type="button"
                    aria-label={T.enlargePhoto}
                    className="shrink-0 cursor-zoom-in overflow-hidden rounded-lg ring-1 ring-foreground/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    {/* Blob URL: next/image cannot optimise it. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photoUrl}
                      alt={T.photoAlt(caseInput.productName)}
                      className="size-20 object-cover"
                    />
                  </button>
                </DialogTrigger>
                <DialogContent showCloseButton={false} className="sm:max-w-2xl">
                  <DialogTitle>{T.photoDialogTitle}</DialogTitle>
                  <DialogDescription className="sr-only">
                    {T.photoAlt(caseInput.productName)}
                  </DialogDescription>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoUrl}
                    alt={T.photoEnlargedAlt(caseInput.productName)}
                    className="max-h-[70vh] w-full rounded-lg object-contain"
                  />
                  <DialogClose asChild>
                    <Button variant="outline">{T.close}</Button>
                  </DialogClose>
                </DialogContent>
              </Dialog>
            ) : null}
            <dl className="grid min-w-0 flex-1 grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
              <Fact label={T.caseType}>
                {CASE_TYPE_LABELS[caseInput.caseType]}
              </Fact>
              <Fact label={T.category}>
                {CASE_CATEGORY_LABELS[caseInput.category]}
              </Fact>
              <Fact label={T.productName}>{caseInput.productName}</Fact>
              <Fact label={T.purchaseDate}>
                {formatPurchaseDate(caseInput.purchaseDate)}
              </Fact>
            </dl>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
