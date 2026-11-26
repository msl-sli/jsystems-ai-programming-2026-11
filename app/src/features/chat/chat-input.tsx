"use client";

import { SendIcon } from "lucide-react";
import { useId, useState } from "react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { CHAT_MESSAGE_MAX_CHARS } from "@/domain/contracts";
import { CHAT_TEXTS as T } from "./texts";

const COUNTER_FROM = 900;

/** Text-only prompt input on `input-group` (no attachments, AC-36). */
export function ChatInput({
  busy,
  onSend,
}: {
  busy: boolean;
  onSend: (text: string) => void;
}) {
  const [value, setValue] = useState("");
  const id = useId();
  const trimmed = value.trim();
  const tooLong = trimmed.length > CHAT_MESSAGE_MAX_CHARS;
  const canSend = !busy && trimmed.length > 0 && !tooLong;

  function submit() {
    if (!canSend) return;
    onSend(trimmed);
    setValue("");
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="sr-only">
        {T.inputLabel}
      </label>
      <InputGroup>
        <InputGroupTextarea
          id={id}
          value={value}
          placeholder={T.inputPlaceholder}
          aria-invalid={tooLong}
          aria-describedby={tooLong ? `${id}-error` : undefined}
          rows={2}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <InputGroupAddon align="inline-end">
          {trimmed.length >= COUNTER_FROM ? (
            <span className="text-xs text-text-secondary">
              {`${trimmed.length}/${CHAT_MESSAGE_MAX_CHARS}`}
            </span>
          ) : null}
          <InputGroupButton
            type="button"
            variant="default"
            size="sm"
            disabled={!canSend}
            onClick={submit}
          >
            <SendIcon />
            {T.send}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {tooLong ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {T.limitExceeded}
        </p>
      ) : null}
    </div>
  );
}
