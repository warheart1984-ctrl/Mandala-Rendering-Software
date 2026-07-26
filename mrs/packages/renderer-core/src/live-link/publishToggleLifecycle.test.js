import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldReleaseShadingLiveLinkOnToggle,
  advancePublishToggleLifecycle,
} from './publishToggleLifecycle.js';

describe('Unity LiveLink publish-toggle lifecycle (Node mirror)', () => {
  it('releases on falling edge when connection is held', () => {
    assert.equal(shouldReleaseShadingLiveLinkOnToggle(false, true, true), true);
  });

  it('releases when publish is off but an idle connection remains', () => {
    assert.equal(shouldReleaseShadingLiveLinkOnToggle(false, false, true), true);
  });

  it('does not release while publish is enabled', () => {
    assert.equal(shouldReleaseShadingLiveLinkOnToggle(true, false, false), false);
    assert.equal(shouldReleaseShadingLiveLinkOnToggle(true, true, true), false);
  });

  it('is a no-op when already released and publish stays off', () => {
    assert.equal(shouldReleaseShadingLiveLinkOnToggle(false, false, false), false);
  });

  it('off→on reconnects; on→off releases; second off is idempotent', () => {
    let state = { publishEnabled: false, wasPublishing: false, connectionHeld: false };

    state = { ...state, publishEnabled: true };
    let next = advancePublishToggleLifecycle(state);
    assert.equal(next.shouldPublish, true);
    assert.equal(next.connectionHeld, true);
    assert.equal(next.released, false);

    state = {
      publishEnabled: false,
      wasPublishing: next.wasPublishing,
      connectionHeld: next.connectionHeld,
    };
    next = advancePublishToggleLifecycle(state);
    assert.equal(next.released, true);
    assert.equal(next.connectionHeld, false);
    assert.equal(next.shouldPublish, false);

    state = {
      publishEnabled: false,
      wasPublishing: next.wasPublishing,
      connectionHeld: next.connectionHeld,
    };
    next = advancePublishToggleLifecycle(state);
    assert.equal(next.released, false);
    assert.equal(next.connectionHeld, false);
  });
});
