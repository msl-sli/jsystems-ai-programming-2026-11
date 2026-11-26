"use client";

import { ImageIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { validatePhoto } from "@/domain/file-signature";
import { FORM_TEXTS } from "./texts";

const HEAD_BYTES = 16;

type PhotoFieldProps = {
  value: File | null;
  onChange: (file: File | null) => void;
  /** Validation message from this field or from form submit. */
  error: string | null;
  onError: (message: string | null) => void;
  /** Hint above the drop zone, depends on the case type (AC-10). */
  hint: string | null;
  /** Focus target for the form's submit validation. */
  chooseButtonRef?: React.Ref<HTMLButtonElement>;
};

function readHead(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(reader.error ?? new Error("Cannot read file"));
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.readAsArrayBuffer(file.slice(0, HEAD_BYTES));
  });
}

export function PhotoField({
  value,
  onChange,
  error,
  onError,
  hint,
  chooseButtonRef,
}: PhotoFieldProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);

  // One object URL per selected file, revoked on replace, remove and unmount (AC-09).
  useEffect(() => {
    if (!value || !imageRef.current) return;
    const url = URL.createObjectURL(value);
    imageRef.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [value]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    let result: ReturnType<typeof validatePhoto>;
    try {
      result = validatePhoto({
        size: file.size,
        headBytes: await readHead(file),
      });
    } catch {
      result = validatePhoto({ size: file.size, headBytes: new Uint8Array() });
    }
    if (result.ok) {
      onError(null);
      onChange(file);
    } else {
      onChange(null);
      onError(result.message);
    }
  }

  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null]
    .filter(Boolean)
    .join(" ");
  const openPicker = () => inputRef.current?.click();

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`${id}-input`}>{FORM_TEXTS.photoLabel}</Label>
      {hint ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <input
        ref={inputRef}
        id={`${id}-input`}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-describedby={describedBy || undefined}
        onChange={(event) => {
          void handleFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <div
        data-testid="photo-dropzone"
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void handleFile(event.dataTransfer.files[0]);
        }}
        className={cn(
          "flex flex-col items-center gap-3 rounded-md border border-dashed bg-muted/40 p-4 text-center sm:flex-row sm:text-left",
          dragging && "border-primary bg-muted",
          error && "border-destructive",
        )}
      >
        {value ? (
          <>
            {/* Blob URL: next/image cannot optimise it. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imageRef}
              alt={FORM_TEXTS.thumbnailAlt(value.name)}
              className="size-20 shrink-0 rounded-md object-cover"
            />
            <span className="min-w-0 flex-1 break-all text-sm font-medium">
              {value.name}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                ref={chooseButtonRef}
                aria-describedby={describedBy || undefined}
                onClick={openPicker}
              >
                {FORM_TEXTS.changeFile}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => onChange(null)}
              >
                {FORM_TEXTS.removeFile}
              </Button>
            </div>
          </>
        ) : (
          <>
            <ImageIcon
              aria-hidden
              className="size-8 shrink-0 text-muted-foreground"
            />
            <span className="flex-1 text-sm text-muted-foreground">
              {FORM_TEXTS.dropHint}
            </span>
            <Button
              type="button"
              variant="outline"
              ref={chooseButtonRef}
              aria-describedby={describedBy || undefined}
              onClick={openPicker}
            >
              {FORM_TEXTS.chooseFile}
            </Button>
          </>
        )}
      </div>
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
