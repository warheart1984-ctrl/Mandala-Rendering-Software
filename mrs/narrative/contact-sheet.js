// mrs/narrative/contact-sheet.js
// Contact Sheet UI - Beat-level take selection with continuity weighting
// This is a client-side module for the Mandala Electron app

export class ContactSheetUI {
  constructor(options = {}) {
    this.container = options.container;
    this.onSelection = options.onSelection; // callback(selectedTake, beatIndex, continuityWeight)
    this.onPreview = options.onPreview; // callback(renderId)
    this.continuityWeight = options.continuityWeight || 0.7;
    
    // State
    this.currentBeat = 0;
    this.takes = new Map(); // beatIndex -> Take[]
    this.selectedTake = new Map(); // beatIndex -> Take
    this.continuityWeights = new Map(); // beatIndex -> weight
    
    // UI elements
    this.elements = {};
    
    if (this.container) {
      this.render();
      this.bindEvents();
    }
  }

  /**
   * Set takes for a beat
   */
  setTakes(beatIndex, takes) {
    this.takes.set(beatIndex, takes);
    if (this.currentBeat === beatIndex) {
      this.renderTakes();
    }
    this.updateBeatNavigator();
  }

  /**
   * Set current beat
   */
  setBeat(beatIndex) {
    this.currentBeat = beatIndex;
    this.renderTakes();
    this.updateBeatNavigator();
    this.updateContinuityIndicator();
  }

  /**
   * Render the contact sheet UI
   */
  render() {
    this.container.innerHTML = `
      <div class="contact-sheet" style="${this.getStyles()}">
        <!-- Header -->
        <header class="cs-header">
          <div class="cs-title">📋 Contact Sheet</div>
          <div class="cs-beat-navigator" id="csBeatNavigator"></div>
          <div class="cs-continuity-indicator" id="csContinuityIndicator">
            <label>Continuity Weight: <input type="range" id="csContinuityWeight" min="0" max="1" step="0.1" value="${this.continuityWeight}"></label>
            <span id="csWeightValue">${this.continuityWeight}</span>
          </div>
        </header>
        
        <!-- Takes Grid -->
        <main class="cs-main">
          <div class="cs-takes-grid" id="csTakesGrid">
            <div class="cs-empty-state" id="csEmptyState">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M9 12l2 2 4-4"/>
              </svg>
              <p>No takes for this beat</p>
              <small>Run evolution to generate takes</small>
            </div>
          </div>
        </main>
        
        <!-- Footer Actions -->
        <footer class="cs-footer">
          <div class="cs-stats" id="csStats"></div>
          <div class="cs-actions">
            <button class="mrs-btn mrs-btn--secondary mrs-btn--sm" id="csPrevBeat">← Prev Beat</button>
            <button class="mrs-btn mrs-btn--secondary mrs-btn--sm" id="csNextBeat">Next Beat →</button>
            <button class="mrs-btn mrs-btn--primary mrs-btn--sm" id="csConfirmSelection">Confirm Selection</button>
          </div>
        </footer>
        
        <!-- Preview Modal -->
        <div class="cs-modal" id="csPreviewModal" style="display: none;">
          <div class="cs-modal-backdrop" id="csModalBackdrop"></div>
          <div class="cs-modal-content">
            <div class="cs-modal-header">
              <h3>Preview Take</h3>
              <button class="cs-modal-close" id="csModalClose">×</button>
            </div>
            <div class="cs-modal-body" id="csModalBody"></div>
          </div>
        </div>
        
        <!-- Take Detail Panel -->
        <aside class="cs-detail-panel" id="csDetailPanel" style="display: none;">
          <div class="cs-detail-header">
            <h4>Take Details</h4>
            <button class="cs-detail-close" id="csDetailClose">×</button>
          </div>
          <div class="cs-detail-body" id="csDetailBody"></div>
        </aside>
      </div>
    `;
    
    this.cacheElements();
  }

  /**
   * Get CSS styles
   */
  getStyles() {
    return `
      --cs-bg: var(--bg-deep, #05070a);
      --cs-surface: var(--bg-surface, #10141b);
      --cs-elevated: var(--bg-elevated, #151b24);
      --cs-border: var(--border-subtle, #2a3444);
      --cs-accent: var(--accent-primary, #22e0c4);
      --cs-accent-dim: var(--accent-primary-dim, rgba(34,224,196,0.25));
      --cs-text: var(--text-primary, #f5f7fb);
      --cs-text-muted: var(--text-muted, #6b7485);
      --cs-radius: var(--radius-md, 10px);
      --cs-shadow: var(--shadow-md, 0 8px 24px rgba(0,0,0,0.55));
    `;
  }

  /**
   * Cache DOM elements
   */
  cacheElements() {
    this.elements = {
      beatNavigator: document.getElementById('csBeatNavigator'),
      takesGrid: document.getElementById('csTakesGrid'),
      emptyState: document.getElementById('csEmptyState'),
      stats: document.getElementById('csStats'),
      prevBeat: document.getElementById('csPrevBeat'),
      nextBeat: document.getElementById('csNextBeat'),
      confirmSelection: document.getElementById('csConfirmSelection'),
      continuityWeight: document.getElementById('csContinuityWeight'),
      weightValue: document.getElementById('csWeightValue'),
      continuityIndicator: document.getElementById('csContinuityIndicator'),
      previewModal: document.getElementById('csPreviewModal'),
      modalBackdrop: document.getElementById('csModalBackdrop'),
      modalBody: document.getElementById('csModalBody'),
      modalClose: document.getElementById('csModalClose'),
      detailPanel: document.getElementById('csDetailPanel'),
      detailClose: document.getElementById('csDetailClose'),
      detailBody: document.getElementById('csDetailBody'),
    };
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    // Continuity weight
    this.elements.continuityWeight.addEventListener('input', (e) => {
      this.continuityWeight = parseFloat(e.target.value);
      this.elements.weightValue.textContent = this.continuityWeight.toFixed(1);
      this.continuityWeights.set(this.currentBeat, this.continuityWeight);
      this.updateContinuityIndicator();
    });

    // Navigation
    this.elements.prevBeat.addEventListener('click', () => this.navigateBeat(-1));
    this.elements.nextBeat.addEventListener('click', () => this.navigateBeat(1));
    
    // Confirm selection
    this.elements.confirmSelection.addEventListener('click', () => this.confirmSelection());

    // Modal
    this.elements.modalBackdrop.addEventListener('click', () => this.closeModal());
    this.elements.modalClose.addEventListener('click', () => this.closeModal());
    this.elements.detailClose.addEventListener('click', () => this.closeDetailPanel());

    // Keyboard
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeModal();
        this.closeDetailPanel();
      }
      if (e.key === 'ArrowLeft') this.navigateBeat(-1);
      if (e.key === 'ArrowRight') this.navigateBeat(1);
    });
  }

  /**
   * Navigate to adjacent beat
   */
  navigateBeat(delta) {
    const beatIndices = Array.from(this.takes.keys()).sort((a, b) => a - b);
    if (!beatIndices.length) return;
    
    const currentIdx = beatIndices.indexOf(this.currentBeat);
    const newIdx = Math.max(0, Math.min(beatIndices.length - 1, currentIdx + delta));
    this.setBeat(beatIndices[newIdx]);
  }

  /**
   * Render takes grid for current beat
   */
  renderTakes() {
    const takes = this.takes.get(this.currentBeat) || [];
    const grid = this.elements.takesGrid;
    const emptyState = this.elements.emptyState;
    const selectedTake = this.selectedTake.get(this.currentBeat);

    if (!takes.length) {
      grid.innerHTML = '';
      grid.appendChild(emptyState);
      emptyState.style.display = 'flex';
      this.updateStats(0, 0);
      return;
    }

    emptyState.style.display = 'none';
    
    grid.innerHTML = takes.map((take, index) => this.renderTakeCard(take, index, take.id === selectedTake?.id)).join('');
    
    // Bind click events
    grid.querySelectorAll('.cs-take-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.cs-take-action')) return;
        this.selectTake(card.dataset.takeId);
      });
      
      card.querySelectorAll('.cs-take-action').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const action = btn.dataset.action;
          const takeId = btn.closest('.cs-take-card').dataset.takeId;
          this.handleTakeAction(action, takeId);
        });
      });
    });

    this.updateStats(takes.length, selectedTake ? 1 : 0);
  }

  /**
   * Render a single take card
   */
  renderTakeCard(take, index, isSelected) {
    const scores = take.scores || {};
    const overallScore = this.computeOverallScore(scores);
    const genotype = take.genotype || {};
    
    return `
      <article class="cs-take-card ${isSelected ? 'selected' : ''}" data-take-id="${take.id}" style="${this.getCardStyles(isSelected)}">
        <!-- Thumbnail -->
        <div class="cs-take-thumbnail" style="${this.getThumbnailStyles(take)}">
          ${take.thumbnail ? `<img src="${take.thumbnail}" alt="Take ${index + 1}" loading="lazy">` : this.getPlaceholderThumbnail(take)}
          <div class="cs-take-badge">${index + 1}</div>
          <div class="cs-score-badge">${(overallScore * 100).toFixed(0)}%</div>
          ${isSelected ? '<div class="cs-selected-indicator">✓ Selected</div>' : ''}
        </div>
        
        <!-- Info -->
        <div class="cs-take-info">
          <div class="cs-take-meta">
            <span class="cs-meta-item">
              <span class="cs-meta-label">Geometry</span>
              <span class="cs-meta-value">${genotype.visual?.geometry || '—'}</span>
            </span>
            <span class="cs-meta-item">
              <span class="cs-meta-label">Material</span>
              <span class="cs-meta-value">${genotype.visual?.material || '—'}</span>
            </span>
            <span class="cs-meta-item">
              <span class="cs-meta-label">Camera</span>
              <span class="cs-meta-value">${genotype.visual?.cameraPath || '—'}</span>
            </span>
            <span class="cs-meta-item">
              <span class="cs-meta-label">Arena</span>
              <span class="cs-meta-value">${genotype.arenaSelection?.primary || '—'}</span>
            </span>
          </div>
          
          <!-- Scores -->
          <div class="cs-take-scores">
            ${this.renderScoreBars(scores)}
          </div>
          
          <!-- Actions -->
          <div class="cs-take-actions">
            <button class="cs-take-action cs-take-action--preview" data-action="preview" title="Preview">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
            </button>
            <button class="cs-take-action cs-take-action--detail" data-action="detail" title="Details">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            </button>
            ${!isSelected ? `
              <button class="cs-take-action cs-take-action--select cs-take-action--primary" data-action="select" title="Select this take">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
              </button>
            ` : ''}
          </div>
        </div>
      </article>
    `;
  }

  /**
   * Render score bars
   */
  renderScoreBars(scores) {
    const scoreMap = [
      { key: 'semanticResonance', label: 'Semantic', color: '#22e0c4' },
      { key: 'emotionalAlignment', label: 'Emotional', color: '#4b7cff' },
      { key: 'motifFidelity', label: 'Motif', color: '#f5b45b' },
      { key: 'pacingCoherence', label: 'Pacing', color: '#ff5c7a' },
    ];

    return scoreMap.map(({ key, label, color }) => {
      const score = scores[key] || 0;
      return `
        <div class="cs-score-bar">
          <div class="cs-score-label">
            <span>${label}</span>
            <span>${(score * 100).toFixed(0)}%</span>
          </div>
          <div class="cs-score-track" style="background: ${color}22;">
            <div class="cs-score-fill" style="width: ${score * 100}%; background: ${color};"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Compute overall score
   */
  computeOverallScore(scores) {
    if (!scores || !Object.keys(scores).length) return 0;
    const values = Object.values(scores).filter(v => typeof v === 'number');
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  }

  /**
   * Get card styles
   */
  getCardStyles(isSelected) {
    return `
      background: ${isSelected ? 'var(--cs-accent-dim)' : 'var(--cs-elevated)'};
      border: 1px solid ${isSelected ? 'var(--cs-accent)' : 'var(--cs-border)'};
      border-radius: var(--cs-radius);
      overflow: hidden;
      transition: all 0.2s ease;
      cursor: pointer;
    `;
  }

  /**
   * Get thumbnail styles
   */
  getThumbnailStyles(take) {
    return `
      position: relative;
      aspect-ratio: 16/9;
      background: var(--cs-surface);
      overflow: hidden;
    `;
  }

  /**
   * Get placeholder thumbnail
   */
  getPlaceholderThumbnail(take) {
    const genotype = take.genotype || {};
    const geometry = genotype.visual?.geometry || 'tesseract';
    const palette = genotype.visual?.palette || ['#0a0a0a', '#22e0c4'];
    
    return `
      <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,${palette[0]},${palette[1]});">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5" opacity="0.6">
          ${this.getGeometryIcon(geometry)}
        </svg>
      </div>
    `;
  }

  /**
   * Get geometry icon SVG
   */
  getGeometryIcon(type) {
    const icons = {
      'tesseract': '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 12l2 2 4-4"/><rect x="6" y="6" width="12" height="12" rx="1" opacity="0.5"/>',
      'clifford-torus': '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/>',
      'hopf-fibration': '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18"/>',
      'gyroid': '<path d="M12 3c3 0 5 2 5 5s-2 5-5 5-5-2-5-5 2-5 5-5zm0 2c-1.7 0-3 1.3-3 3s1.3 3 3 3 3-1.3 3-3-1.3-3-3-3z"/>',
      'default': '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 12l2 2 4-4"/>',
    };
    return icons[type] || icons.default;
  }

  /**
   * Handle take actions
   */
  handleTakeAction(action, takeId) {
    const take = this.findTakeById(takeId);
    if (!take) return;

    switch (action) {
      case 'preview':
        this.openPreview(take);
        break;
      case 'detail':
        this.openDetail(take);
        break;
      case 'select':
        this.selectTake(takeId);
        break;
    }
  }

  /**
   * Find take by ID across all beats
   */
  findTakeById(takeId) {
    for (const takes of this.takes.values()) {
      const found = takes.find(t => t.id === takeId);
      if (found) return found;
    }
    return null;
  }

  /**
   * Select a take
   */
  selectTake(takeId) {
    const take = this.findTakeById(takeId);
    if (!take) return;

    const beatIndex = take.beatIndex || this.currentBeat;
    this.selectedTake.set(beatIndex, take);
    
    // Update UI
    this.elements.takesGrid.querySelectorAll('.cs-take-card').forEach(card => {
      card.classList.toggle('selected', card.dataset.takeId === takeId);
      const indicator = card.querySelector('.cs-selected-indicator');
      if (indicator) indicator.style.display = card.dataset.takeId === takeId ? 'block' : 'none';
    });

    this.updateStats(this.takes.get(beatIndex)?.length || 0, 1);
  }

  /**
   * Open preview modal
   */
  openPreview(take) {
    this.elements.modalBody.innerHTML = `
      <div class="cs-preview-header">
        <h4>Take ${take.id.slice(-8)}</h4>
        <div class="cs-preview-meta">
          <span>${take.genotype?.visual?.geometry}</span>
          <span>${take.genotype?.visual?.material}</span>
          <span>${take.genotype?.arenaSelection?.primary}</span>
        </div>
      </div>
      <div class="cs-preview-content">
        ${take.thumbnail ? `<img src="${take.thumbnail}" alt="Preview" style="max-width:100%;border-radius:8px;">` : this.getPlaceholderThumbnail(take)}
      </div>
      <div class="cs-preview-scores">
        ${this.renderScoreBars(take.scores || {})}
      </div>
    `;
    this.elements.previewModal.style.display = 'flex';
  }

  /**
   * Open detail panel
   */
  openDetail(take) {
    const genotype = take.genotype || {};
    this.elements.detailBody.innerHTML = `
      <div class="cs-detail-section">
        <h5>Genotype</h5>
        <pre>${JSON.stringify(genotype, null, 2)}</pre>
      </div>
      <div class="cs-detail-section">
        <h5>Scores</h5>
        <pre>${JSON.stringify(take.scores, null, 2)}</pre>
      </div>
      <div class="cs-detail-section">
        <h5>Metadata</h5>
        <ul>
          <li>ID: ${take.id}</li>
          <li>Beat: ${take.beatIndex}</li>
          <li>Timestamp: ${take.timestamp}</li>
        </ul>
      </div>
    `;
    this.elements.detailPanel.style.display = 'block';
  }

  /**
   * Close modal
   */
  closeModal() {
    this.elements.previewModal.style.display = 'none';
  }

  /**
   * Close detail panel
   */
  closeDetailPanel() {
    this.elements.detailPanel.style.display = 'none';
  }

  /**
   * Confirm selection and callback
   */
  confirmSelection() {
    const selected = this.selectedTake.get(this.currentBeat);
    if (!selected) {
      alert('Please select a take first');
      return;
    }

    if (this.onSelection) {
      this.onSelection(
        selected,
        this.currentBeat,
        this.continuityWeights.get(this.currentBeat) || this.continuityWeight
      );
    }
  }

  /**
   * Update beat navigator
   */
  updateBeatNavigator() {
    const beatIndices = Array.from(this.takes.keys()).sort((a, b) => a - b);
    if (!beatIndices.length) {
      this.elements.beatNavigator.innerHTML = '<span class="cs-nav-empty">No beats loaded</span>';
      return;
    }

    this.elements.beatNavigator.innerHTML = beatIndices.map(idx => `
      <button class="cs-nav-btn ${idx === this.currentBeat ? 'active' : ''}" data-beat="${idx}">
        Beat ${idx + 1}
        ${this.selectedTake.has(idx) ? '✓' : ''}
        ${this.takes.get(idx)?.length || 0} takes
      </button>
    `).join('');

    this.elements.beatNavigator.querySelectorAll('.cs-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => this.setBeat(parseInt(btn.dataset.beat)));
    });
  }

  /**
   * Update continuity indicator
   */
  updateContinuityIndicator() {
    this.elements.continuityIndicator.innerHTML = `
      <label>Continuity Weight: 
        <input type="range" id="csContinuityWeight" min="0" max="1" step="0.1" value="${this.continuityWeight}">
      </label>
      <span id="csWeightValue">${this.continuityWeight.toFixed(1)}</span>
      <div class="cs-continuity-tooltip">
        ${this.continuityWeight > 0.7 ? 'High - Strong visual continuity with previous beat' : 
          this.continuityWeight > 0.4 ? 'Medium - Moderate continuity' : 
          'Low - Allow creative departure'}
      </div>
    `;
    
    // Re-bind
    document.getElementById('csContinuityWeight').addEventListener('input', (e) => {
      this.continuityWeight = parseFloat(e.target.value);
      document.getElementById('csWeightValue').textContent = this.continuityWeight.toFixed(1);
      this.continuityWeights.set(this.currentBeat, this.continuityWeight);
      this.updateContinuityIndicator();
    });
  }

  /**
   * Update stats
   */
  updateStats(totalTakes, selectedCount) {
    this.elements.stats.innerHTML = `
      <span>${totalTakes} takes</span>
      <span>${selectedCount} selected</span>
      <span>Beat ${this.currentBeat + 1}</span>
    `;
  }

  /**
   * Get current selection state
   */
  getState() {
    const selections = {};
    for (const [beatIndex, take] of this.selectedTake.entries()) {
      selections[beatIndex] = {
        takeId: take.id,
        genotypeId: take.genotype?.id,
        scores: take.scores,
        continuityWeight: this.continuityWeights.get(beatIndex) || this.continuityWeight,
      };
    }
    return selections;
  }
}

export default ContactSheetUI;