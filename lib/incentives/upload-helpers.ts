import { ValidationError } from "@/lib/auth/errors";
import { getDocumentExtension, MAX_DOCUMENT_BYTES } from "@/lib/documents/file-security";

export async function extractTabularUploadFromFormData(formData: FormData): Promise<{
  filename: string;
  bytes: Uint8Array;
}> {
  const entry = formData.get("file");
  if (
    !entry ||
    typeof entry !== "object" ||
    typeof (entry as Blob).arrayBuffer !== "function" ||
    typeof (entry as { name?: unknown }).name !== "string"
  ) {
    throw new ValidationError("Upload a .csv or .xlsx spreadsheet in the `file` field.");
  }

  const file = entry as Blob & { name: string; size: number };
  if (file.size <= 0) {
    throw new ValidationError("Uploaded file is empty.");
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new ValidationError("Uploaded spreadsheet exceeds the 10 MB limit.");
  }

  const ext = getDocumentExtension(file.name);
  if (ext !== "csv" && ext !== "xlsx" && ext !== "xls") {
    throw new ValidationError("Only .csv, .xlsx, or .xls spreadsheets are supported here.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  return { filename: file.name, bytes };
}
