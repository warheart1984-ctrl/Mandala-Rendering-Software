/**
 * Unity FourDTesseractRenderer publish-toggle cleanup gate (Node mirror).
 * Mirrors FourDTesseractRenderer.ShouldReleaseShadingLiveLinkOnToggle.
 * Status: enforced in Node unit tests; Unity Play Mode verification remains partial.
 */

/**
 * @param {boolean} publishEnabled
 * @param {boolean} wasPublishing
 * @param {boolean} connectionHeld
 * @returns {boolean}
 */
export function shouldReleaseShadingLiveLinkOnToggle(
  publishEnabled,
  wasPublishing,
  connectionHeld,
) {
  return !publishEnabled && (wasPublishing || connectionHeld);
}

/**
 * Advance one LateUpdate-style frame for the publish toggle state machine.
 * @param {{ publishEnabled: boolean, wasPublishing: boolean, connectionHeld: boolean }} state
 * @returns {{ wasPublishing: boolean, connectionHeld: boolean, released: boolean, shouldPublish: boolean }}
 */
export function advancePublishToggleLifecycle(state) {
  const publishEnabled = Boolean(state.publishEnabled);
  const wasPublishing = Boolean(state.wasPublishing);
  let connectionHeld = Boolean(state.connectionHeld);
  let released = false;
  let shouldPublish = false;

  if (publishEnabled) {
    shouldPublish = true;
    connectionHeld = true;
  } else if (
    shouldReleaseShadingLiveLinkOnToggle(publishEnabled, wasPublishing, connectionHeld)
  ) {
    released = true;
    connectionHeld = false;
  }

  return {
    wasPublishing: publishEnabled,
    connectionHeld,
    released,
    shouldPublish,
  };
}
