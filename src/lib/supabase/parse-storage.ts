import { createClient } from "@/lib/supabase/client";
import { parseFile, type ParsedFile } from "@/lib/parsers";

export async function parseStoredUpload(
  storagePath: string,
  fileName: string
): Promise<ParsedFile> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from("uploads")
    .download(storagePath);
  if (error || !data) throw new Error(error?.message ?? "Download failed");
  const file = new File([data], fileName);
  return parseFile(file);
}
