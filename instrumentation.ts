/**
 * Runs once when the server starts. Loading lib/env here makes its production
 * checks - a real SMS gateway, real payments, a separate encryption key, the
 * public URL - stop the server at startup with a clear message, instead of
 * surfacing as an error on the first request.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./lib/env');
  }
}
