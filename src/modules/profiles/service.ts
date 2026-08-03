export function payoutQrKey(instructorId: string, fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const rawExt = dot > 0 ? fileName.slice(dot + 1) : "";
  const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  const suffix = ext ? `.${ext}` : "";
  return `payout-qr/${instructorId}/${Date.now()}${suffix}`;
}
