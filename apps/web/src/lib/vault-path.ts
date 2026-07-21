export function vaultPathKey(path: string) {
  return path.normalize("NFC").toLowerCase();
}
