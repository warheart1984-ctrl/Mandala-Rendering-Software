/**
 * FundingOS Provenance Recorder — Frame recording for funding + MRS operations.
 */

export class ProvenanceRecorder {
  constructor() {
    this.frames = [];
    this.recording = false;
    this.currentSession = null;
  }

  startSession(sessionId, metadata = {}) {
    this.currentSession = {
      id: sessionId,
      startTime: Date.now(),
      metadata,
      frames: []
    };
    this.recording = true;
  }

  stopSession() {
    if (this.currentSession) {
      this.currentSession.endTime = Date.now();
      this.frames.push(...this.currentSession.frames);
      this.currentSession = null;
    }
    this.recording = false;
  }

  record(frame) {
    const enrichedFrame = {
      ...frame,
      id: frame.id || `frame-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: frame.timestamp || Date.now(),
      sessionId: this.currentSession?.id
    };

    if (this.recording && this.currentSession) {
      this.currentSession.frames.push(enrichedFrame);
    }

    this.frames.push(enrichedFrame);
    return enrichedFrame;
  }

  getFrames(filter = {}) {
    let result = this.frames;

    if (filter.sessionId) {
      result = result.filter(f => f.sessionId === filter.sessionId);
    }
    if (filter.actorId) {
      result = result.filter(f => f.actorId === filter.actorId);
    }
    if (filter.intentId) {
      result = result.filter(f => f.intentId === filter.intentId);
    }
    if (filter.since) {
      result = result.filter(f => f.timestamp >= filter.since);
    }

    return result;
  }

  clear() {
    this.frames = [];
    this.currentSession = null;
    this.recording = false;
  }

  getStats() {
    return {
      totalFrames: this.frames.length,
      sessions: [...new Set(this.frames.map(f => f.sessionId).filter(Boolean))].length,
      actors: [...new Set(this.frames.map(f => f.actorId).filter(Boolean))].length,
      recording: this.recording
    };
  }
}

export function createProvenanceRecorder() {
  return new ProvenanceRecorder();
}