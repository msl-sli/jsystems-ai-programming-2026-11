"use client";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CHAT_TEXTS as T } from "./texts";

/** AC-38: "Nowe zgłoszenie" with a confirmation; emphasized for better_photo (PRD 9.3). */
export function NewCaseButton({
  emphasized,
  onConfirm,
}: {
  emphasized: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant={emphasized ? "default" : "secondary"}
          data-emphasized={emphasized}
        >
          {T.newCase}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{T.newCaseConfirmTitle}</AlertDialogTitle>
          <AlertDialogDescription>{T.newCaseConfirm}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{T.cancel}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {T.newCaseContinue}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
