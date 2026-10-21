import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/auth/guards";
import { getRecordDetail } from "@/lib/database/queries";
import { readUploadedFile } from "@/lib/uploads/storage";

/**
 * Streams an uploaded document to its owner only.
 *
 * The file lives outside the web root and is never served statically. Access is
 * checked against the record's owning profile on every request, and the response
 * is marked `private, no-store` so a shared phone browser cache cannot leak it.
 * Every access is written to the audit log.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const record = await getRecordDetail(id);
  // Same response for "not found" and "not yours" — never confirm existence.
  if (!record || record.profile.userId !== user.id) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (!record.filePath) {
    return NextResponse.json({ error: "NO_FILE" }, { status: 404 });
  }

  try {
    const buffer = await readUploadedFile(record.filePath);
    await writeAuditLog({
      userId: user.id,
      action: "record.file.view",
      entityType: "HealthRecord",
      entityId: record.id,
      meta: { profileId: record.profileId },
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": record.mimeType ?? "application/octet-stream",
        "Content-Length": String(buffer.byteLength),
        "Content-Disposition": `inline; filename="${encodeURIComponent(record.fileName ?? "record")}"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "FILE_UNAVAILABLE" }, { status: 404 });
  }
}
