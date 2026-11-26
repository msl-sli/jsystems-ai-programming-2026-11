"use client";

import { format } from "date-fns";
import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  CASE_CATEGORIES,
  CASE_CATEGORY_LABELS,
  CASE_TYPE_LABELS,
  CASE_TYPES,
  type CaseCategory,
  type CaseInput,
  type CaseType,
} from "@/domain/case-schema";
import { PHOTO_MESSAGES } from "@/domain/file-signature";
import {
  AI_NOTICE,
  descriptionLabel,
  descriptionMaxLength,
  photoHint,
  purchaseDateBounds,
} from "@/domain/form-rules";
import { cn } from "@/lib/utils";
import { PhotoField } from "./photo-field";
import { PurchaseDateField } from "./purchase-date-field";
import { createCaseResolver } from "./resolver";
import { FORM_TEXTS } from "./texts";

/** Form shape: nothing is preselected, so type and category may be undefined. */
export type CaseFormValues = {
  caseType?: CaseType;
  category?: CaseCategory;
  productName: string;
  /** `YYYY-MM-DD`, or the raw typed text while it is not a valid date. */
  purchaseDate: string;
  description: string;
};

export type CaseFormProps = {
  initialValues?: Partial<CaseFormValues>;
  initialPhoto?: File | null;
  onSubmit: (values: CaseInput, photo: File) => void | Promise<void>;
  /** Processing failure banner shown above the form (AC-17). */
  bannerError?: string | null;
  onRetry?: () => void;
  /** `YYYY-MM-DD` used for the purchase date bounds. Defaults to the browser's local date. */
  today?: string;
  /**
   * Reports whether the customer has entered anything (a field or a photo), for the leave-page
   * guard (AC-39). Called from an effect, never during an input event: a parent state update
   * inside the event made React restore the controlled input and drop the first keystroke.
   */
  onDirtyChange?: (dirty: boolean) => void;
};

const EMPTY_VALUES: CaseFormValues = {
  productName: "",
  purchaseDate: "",
  description: "",
};

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  );
}

export function CaseForm({
  initialValues,
  initialPhoto = null,
  onSubmit,
  bannerError = null,
  onRetry,
  today,
  onDirtyChange,
}: CaseFormProps) {
  const id = useId();
  const [effectiveToday] = useState(
    () => today ?? format(new Date(), "yyyy-MM-dd"),
  );
  const resolvedToday = today ?? effectiveToday;
  const resolver = useMemo(
    () => createCaseResolver(resolvedToday),
    [resolvedToday],
  );
  const bounds = useMemo(
    () => purchaseDateBounds(resolvedToday),
    [resolvedToday],
  );

  const {
    control,
    handleSubmit,
    trigger,
    formState: { errors, touchedFields, isDirty },
  } = useForm<CaseFormValues, unknown, CaseInput>({
    resolver,
    mode: "onTouched",
    shouldFocusError: true,
    defaultValues: { ...EMPTY_VALUES, ...initialValues },
  });

  const [photo, setPhoto] = useState<File | null>(initialPhoto);

  const dirty = isDirty || photo !== null;
  // Layout effect so the leave-page guard is armed before the entered value is painted.
  useLayoutEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoButtonRef = useRef<HTMLButtonElement>(null);

  const caseType = useWatch({ control, name: "caseType" });
  const descriptionLength = useWatch({ control, name: "description" }).length;
  const hint = photoHint(caseType);

  const ids = {
    typeLabel: `${id}-type-label`,
    typeError: `${id}-type-error`,
    category: `${id}-category`,
    categoryError: `${id}-category-error`,
    name: `${id}-name`,
    nameError: `${id}-name-error`,
    date: `${id}-date`,
    dateHelp: `${id}-date-help`,
    dateError: `${id}-date-error`,
    description: `${id}-description`,
    descriptionCounter: `${id}-description-counter`,
    descriptionError: `${id}-description-error`,
  };
  const describedBy = (...parts: (string | false | undefined)[]) =>
    parts.filter(Boolean).join(" ") || undefined;

  async function submit(event?: React.BaseSyntheticEvent) {
    event?.preventDefault();
    const missingPhoto = photo === null;
    if (missingPhoto) setPhotoError(PHOTO_MESSAGES.required);
    await handleSubmit(async (values) => {
      if (!photo) {
        photoButtonRef.current?.focus();
        return;
      }
      await onSubmit(values, photo);
    })();
  }

  return (
    <form
      noValidate
      onSubmit={submit}
      className="flex flex-col gap-6"
      aria-labelledby={`${id}-title`}
    >
      {bannerError ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{bannerError}</span>
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              {FORM_TEXTS.retry}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <header className="flex flex-col gap-2">
        <h1 id={`${id}-title`} className="text-2xl font-bold">
          {FORM_TEXTS.title}
        </h1>
        <p className="text-muted-foreground">{FORM_TEXTS.intro}</p>
      </header>

      <div className="flex flex-col gap-2">
        <span id={ids.typeLabel} className="text-sm font-medium leading-none">
          {FORM_TEXTS.caseTypeLabel}
        </span>
        <Controller
          control={control}
          name="caseType"
          render={({ field }) => (
            <RadioGroup
              value={field.value ?? ""}
              onValueChange={(next) => {
                field.onChange(next);
                // AC-13: values stay; the description rules follow the new type.
                if (touchedFields.description) void trigger("description");
              }}
              aria-labelledby={ids.typeLabel}
              aria-invalid={errors.caseType ? true : undefined}
              aria-describedby={describedBy(errors.caseType && ids.typeError)}
              className="grid-cols-2 gap-3"
            >
              {CASE_TYPES.map((type, index) => (
                <Label
                  key={type}
                  htmlFor={`${id}-type-${type}`}
                  className={cn(
                    "flex min-h-14 cursor-pointer items-center gap-3 rounded-md border bg-background px-4 py-3 text-base font-medium",
                    "has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-muted",
                    "has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                    errors.caseType && "border-destructive",
                  )}
                >
                  <RadioGroupItem
                    id={`${id}-type-${type}`}
                    value={type}
                    ref={index === 0 ? field.ref : undefined}
                    onBlur={field.onBlur}
                  />
                  {CASE_TYPE_LABELS[type]}
                </Label>
              ))}
            </RadioGroup>
          )}
        />
        <FieldError id={ids.typeError} message={errors.caseType?.message} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={ids.category}>{FORM_TEXTS.categoryLabel}</Label>
        <Controller
          control={control}
          name="category"
          render={({ field }) => (
            <Select
              value={field.value ?? ""}
              onValueChange={field.onChange}
              onOpenChange={(open) => {
                if (!open) field.onBlur();
              }}
            >
              <SelectTrigger
                id={ids.category}
                ref={field.ref}
                className="h-10 w-full"
                aria-invalid={errors.category ? true : undefined}
                aria-describedby={describedBy(
                  errors.category && ids.categoryError,
                )}
              >
                <SelectValue placeholder={FORM_TEXTS.categoryPlaceholder} />
              </SelectTrigger>
              <SelectContent position="popper">
                {CASE_CATEGORIES.map((category) => (
                  <SelectItem key={category} value={category}>
                    {CASE_CATEGORY_LABELS[category]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <FieldError id={ids.categoryError} message={errors.category?.message} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={ids.name}>{FORM_TEXTS.productNameLabel}</Label>
        <Controller
          control={control}
          name="productName"
          render={({ field }) => (
            <Input
              {...field}
              id={ids.name}
              autoComplete="off"
              placeholder={FORM_TEXTS.productNamePlaceholder}
              className="h-10"
              aria-invalid={errors.productName ? true : undefined}
              aria-describedby={describedBy(
                errors.productName && ids.nameError,
              )}
            />
          )}
        />
        <FieldError id={ids.nameError} message={errors.productName?.message} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={ids.date}>{FORM_TEXTS.purchaseDateLabel}</Label>
        <Controller
          control={control}
          name="purchaseDate"
          render={({ field }) => (
            <PurchaseDateField
              id={ids.date}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              inputRef={field.ref}
              bounds={bounds}
              invalid={Boolean(errors.purchaseDate)}
              describedBy={describedBy(
                ids.dateHelp,
                errors.purchaseDate && ids.dateError,
              )}
            />
          )}
        />
        <p id={ids.dateHelp} className="text-sm text-muted-foreground">
          {FORM_TEXTS.purchaseDateHelp}
        </p>
        <FieldError id={ids.dateError} message={errors.purchaseDate?.message} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={ids.description}>{descriptionLabel(caseType)}</Label>
        <Controller
          control={control}
          name="description"
          render={({ field }) => (
            <Textarea
              {...field}
              id={ids.description}
              rows={5}
              className="min-h-28"
              aria-invalid={errors.description ? true : undefined}
              aria-describedby={describedBy(
                ids.descriptionCounter,
                errors.description && ids.descriptionError,
              )}
            />
          )}
        />
        <div className="flex justify-between gap-4">
          <FieldError
            id={ids.descriptionError}
            message={errors.description?.message}
          />
          <span
            id={ids.descriptionCounter}
            className={cn(
              "ml-auto text-sm text-muted-foreground",
              descriptionLength > descriptionMaxLength && "text-destructive",
            )}
          >
            {`${descriptionLength} / ${descriptionMaxLength}`}
          </span>
        </div>
      </div>

      <PhotoField
        value={photo}
        onChange={setPhoto}
        error={photoError}
        onError={setPhotoError}
        hint={hint}
        chooseButtonRef={photoButtonRef}
      />

      <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
        {AI_NOTICE}
      </p>

      <Button
        type="submit"
        className="h-11 w-full text-base sm:w-auto sm:self-start sm:px-8"
      >
        {FORM_TEXTS.submit}
      </Button>
    </form>
  );
}
