"use client";

import { format, parseISO } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useState } from "react";
import { pl } from "react-day-picker/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { isIsoCalendarDate } from "@/domain/case-schema";
import { FORM_TEXTS } from "./texts";

const TYPED_DATE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;

/** `dd.MM.yyyy` becomes `YYYY-MM-DD`; anything else is passed on trimmed for the schema to judge. */
export function typedDateToIso(text: string): string {
  const trimmed = text.trim();
  const match = TYPED_DATE.exec(trimmed);
  if (!match) return trimmed;
  const [, day, month, year] = match;
  return `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;
}

function isoToDisplay(value: string): string {
  return isIsoCalendarDate(value)
    ? format(parseISO(value), "dd.MM.yyyy")
    : value;
}

type PurchaseDateFieldProps = {
  id: string;
  /** Form value: `YYYY-MM-DD`, or the raw text when it is not a date. */
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  inputRef: React.Ref<HTMLInputElement>;
  bounds: { min: string; max: string };
  invalid: boolean;
  describedBy?: string;
};

export function PurchaseDateField({
  id,
  value,
  onChange,
  onBlur,
  inputRef,
  bounds,
  invalid,
  describedBy,
}: PurchaseDateFieldProps) {
  const [text, setText] = useState(() => isoToDisplay(value));
  const [open, setOpen] = useState(false);
  const selected = isIsoCalendarDate(value) ? parseISO(value) : undefined;
  const min = parseISO(bounds.min);
  const max = parseISO(bounds.max);

  return (
    <div className="flex gap-2">
      <Input
        id={id}
        ref={inputRef}
        value={text}
        inputMode="numeric"
        autoComplete="off"
        placeholder={FORM_TEXTS.purchaseDatePlaceholder}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="h-10 flex-1"
        onChange={(event) => {
          setText(event.target.value);
          onChange(typedDateToIso(event.target.value));
        }}
        onBlur={onBlur}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-10"
            aria-label={FORM_TEXTS.openCalendar}
          >
            <CalendarIcon aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-0">
          <Calendar
            mode="single"
            locale={pl}
            captionLayout="dropdown"
            selected={selected}
            defaultMonth={selected ?? max}
            startMonth={min}
            endMonth={max}
            disabled={[{ before: min }, { after: max }]}
            onSelect={(date) => {
              if (!date) return;
              const iso = format(date, "yyyy-MM-dd");
              setText(isoToDisplay(iso));
              onChange(iso);
              onBlur();
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
