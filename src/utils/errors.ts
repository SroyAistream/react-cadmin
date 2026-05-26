export function errorMessage(error: unknown, fallback = 'Service is not available') {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'object' && error && 'status' in error) {
    const status = (error as {status?: {message?: string}}).status;
    return status?.message ?? fallback;
  }
  return fallback;
}
