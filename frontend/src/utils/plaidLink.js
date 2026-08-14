/** Opens Plaid Link given a server-created link_token. Pass a token created in "update mode"
 * (the backend sets this when /api/plaid/link-token is called with an item_id) to repair an
 * existing item instead of linking a new institution. */
export function openPlaidLink({ linkToken, onSuccess, onExit = () => {} } = {}) {
  if (!window.Plaid) {
    throw new Error('Plaid Link failed to load.');
  }
  const handler = window.Plaid.create({
    token: linkToken,
    onSuccess: (public_token, metadata) => onSuccess({ public_token, metadata }),
    onExit,
  });
  handler.open();
}
