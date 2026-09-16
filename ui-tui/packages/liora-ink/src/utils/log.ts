export function logError(error: unknown): void {
  if (!process.env.LIORA_INK_DEBUG_ERRORS) {
    return
  }

  console.error(error)
}
