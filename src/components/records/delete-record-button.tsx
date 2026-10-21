"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/providers/i18n-provider";
import { deleteRecordAction } from "@/lib/actions/records";

/** Deletes a single document (and its stored file) after an explicit confirm. */
export function DeleteRecordButton({
  recordId,
  title,
  label,
  confirmLabel,
}: {
  recordId: string;
  title: string;
  label?: string;
  confirmLabel?: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  const handleDelete = () => {
    if (!window.confirm(`${confirmLabel ?? t("records.deleteConfirm")}\n\n${title}`)) return;
    startTransition(async () => {
      const result = await deleteRecordAction(recordId);
      if (!result.ok) {
        toast.error(t("error.deleteFailed"));
        return;
      }
      toast.success(t("records.deleted"));
      router.push("/records");
      router.refresh();
    });
  };

  return (
    <Button variant="ghost" onClick={handleDelete} disabled={isPending} className="text-alert-600 hover:bg-alert-50">
      <Trash2 aria-hidden="true" />
      {isPending ? t("common.deleting") : label ?? t("common.delete")}
    </Button>
  );
}
