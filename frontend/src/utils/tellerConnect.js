/** Opens Teller Connect. Pass `enrollmentId` to repair an existing enrollment (e.g. after
 * an `enrollment.disconnected.user_action.mfa_required` sync failure) instead of linking a new one —
 * Teller skips the institution picker and takes the user straight to that institution's auth flow,
 * and the existing account_id/access_token continue to work afterward. */
export function openTellerConnect({ enrollmentId, onSuccess, onInit = () => {}, onExit = () => {} } = {}) {
  if (!window.TellerConnect) {
    throw new Error('Teller Connect failed to load.');
  }
  const tc = window.TellerConnect.setup({
    applicationId: import.meta.env.VITE_TELLER_APP_ID,
    environment: import.meta.env.VITE_TELLER_ENV || 'sandbox',
    products: ['transactions'],
    ...(enrollmentId ? { enrollmentId } : {}),
    onInit,
    onSuccess,
    onExit,
  });
  tc.open();
}
