export function isCancelledRequestError(
  error: unknown,
  signal?: AbortSignal
): boolean {
  if (signal?.aborted) {
    return true;
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }

  return false;
}
