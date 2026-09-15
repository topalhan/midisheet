/**
 * High-Performance Real-Time Sheet Music & Grand Staff Canvas Visualizer
 * Supports Live Chord View & Continuous Scrolling Timeline View.
 */

import { MusicTheory } from './chords.js';

export class NotationRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} options
   */
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    this.options = {
      theme: 'dark',           // 'dark' or 'light'
      preferFlats: false,       // true for flats, false for sharps
      showNoteNames: true,      // show letter name near note
      mode: 'live',             // 'live' or 'scrolling'
      lineSpacing: 16,          // distance between staff lines in px
      activeGlowColor: '#38bdf8',// vibrant sky-blue glow
      bassActiveColor: '#a855f7',// vibrant purple glow for bass
      scrollSpeed: 120,         // pixels per second in scrolling mode
      splitPoint: 60,           // Middle C split point for treble/bass
      showIntervalContour: true,// Color-coded interval ribbons (Step=Green, Skip=Orange, Leap=Purple)
      accidentalAlert: true,    // Accidental Alert flash for notes deviating from key signature
      keySignature: 'C Major',  // Active key signature for diatonic vs deviation reference
      disrupterMode: 'none',     // 'none', 'vanishing_bar', 'advance_curtain'
      decoupledEyeCursor: false, // true = display decoupled eye cursor 1 measure ahead
      ...options
    };

    // Active held notes: Map of midiNote -> { midi, velocity, startTime, releasedTime, active }
    this.activeNotes = new Map();
    // History of played notes for scrolling timeline mode
    this.noteHistory = []; // { midi, velocity, startTime, endTime, active }
    // Melodic phrase buffer for live Free Play contour & broken thirds
    this.recentPhrase = [];

    // Fading notes cache for smooth visual release
    this.fadingNotes = new Map();

    // HiDPI metrics
    this.dpr = window.devicePixelRatio || 1;
    this.width = 0;
    this.height = 0;

    // Time tracking
    this.lastFrameTime = performance.now();
    this.animationFrameId = null;

    // Mistake Review & Interactive Navigation
    this.activeReviewMistakeIndex = -1;
    this.prevMistakeBtnBounds = null;
    this.nextMistakeBtnBounds = null;
    this.reviewPillBounds = null;
    this.noteHitboxes = [];
    this.onReviewNoteChanged = null;

    // Manual horizontal score dragging & scrolling
    this.manualScrollOffset = 0;
    this.isUserDragging = false;
    this.dragStartX = 0;
    this.dragStartScroll = 0;

    // Strict Sight-Reading playhead & Recovery tracking
    this.playheadBeats = 0;
    this.flashRecoveryTimestamp = 0;

    this.initCanvas();
    this.setupInteractionEvents();
    this.startRenderLoop();
  }

  initCanvas() {
    this.dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width || this.canvas.clientWidth || 800;
    this.height = rect.height || this.canvas.clientHeight || 380;

    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);

    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(this.dpr, this.dpr);
  }

  resize() {
    this.initCanvas();
  }

  setOption(key, value) {
    this.options[key] = value;
  }

  setKeySignature(key) {
    this.setOption('keySignature', key);
  }

  setDisrupterMode(mode) {
    this.options.disrupterMode = mode;
  }

  setDecoupledEyeCursor(enabled) {
    this.options.decoupledEyeCursor = !!enabled;
  }

  /**
   * Set up pointer and touch interaction for mistake review and score panning
   */
  setupInteractionEvents() {
    const getPos = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    };

    const isInside = (pos, b) => b && pos.x >= b.x && pos.x <= b.x + b.width && pos.y >= b.y && pos.y <= b.y + b.height;

    this.canvas.addEventListener('pointerdown', (e) => {
      const pos = getPos(e);

      // 1. Check Prev Mistake Button click
      if (this.prevMistakeBtnBounds && isInside(pos, this.prevMistakeBtnBounds)) {
        e.preventDefault();
        this.previousMistake();
        return;
      }

      // 2. Check Next Mistake Button click
      if (this.nextMistakeBtnBounds && isInside(pos, this.nextMistakeBtnBounds)) {
        e.preventDefault();
        this.nextMistake();
        return;
      }

      // 3. Direct click on mistake notes on staff when finished
      if (this.practiceData && this.practiceData.isFinished) {
        for (const hb of this.noteHitboxes) {
          if (isInside(pos, hb.bounds)) {
            const results = this.practiceData.noteResults || [];
            const res = results[hb.index];
            if (res && (res.mistakes > 0 || res.status === 'mistake' || res.status === 'missed')) {
              e.preventDefault();
              this.jumpToMistake(hb.index);
              return;
            }
          }
        }
      }

      // 4. Score horizontal drag panning
      if (this.options.mode === 'practice') {
        this.isUserDragging = true;
        this.dragStartX = pos.x;
        this.dragStartScroll = this.manualScrollOffset;
        try { this.canvas.setPointerCapture?.(e.pointerId); } catch (_) {}
      }
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.isUserDragging) return;
      const pos = getPos(e);
      const deltaX = pos.x - this.dragStartX;
      this.manualScrollOffset = this.dragStartScroll - deltaX;
    });

    const endDrag = (e) => {
      this.isUserDragging = false;
      try { this.canvas.releasePointerCapture?.(e.pointerId); } catch (_) {}
    };

    this.canvas.addEventListener('pointerup', endDrag);
    this.canvas.addEventListener('pointercancel', endDrag);

    this.canvas.addEventListener('wheel', (e) => {
      if (this.options.mode === 'practice') {
        e.preventDefault();
        const delta = (Math.abs(e.deltaX) > 0.001 ? e.deltaX : e.deltaY) * 0.8;
        this.manualScrollOffset += delta;
      }
    }, { passive: false });
  }

  getMistakeNoteIndices() {
    if (!this.practiceData || !this.practiceData.melody || !this.practiceData.noteResults) return [];
    const indices = [];
    const results = this.practiceData.noteResults;
    for (let i = 0; i < results.length && i < this.practiceData.melody.notes.length; i++) {
      if (results[i].mistakes > 0 || results[i].status === 'mistake' || results[i].status === 'missed') {
        indices.push(i);
      }
    }
    return indices;
  }

  jumpToMistake(mistakeIndex) {
    this.activeReviewMistakeIndex = mistakeIndex;
    this.manualScrollOffset = 0;
    this.notifyReviewNoteChanged();
  }

  nextMistake() {
    const mistakes = this.getMistakeNoteIndices();
    if (mistakes.length === 0) return;
    const next = mistakes.find(idx => idx > this.activeReviewMistakeIndex);
    this.activeReviewMistakeIndex = (next !== undefined) ? next : mistakes[0];
    this.manualScrollOffset = 0;
    this.notifyReviewNoteChanged();
  }

  previousMistake() {
    const mistakes = this.getMistakeNoteIndices();
    if (mistakes.length === 0) return;
    const prev = [...mistakes].reverse().find(idx => idx < this.activeReviewMistakeIndex);
    this.activeReviewMistakeIndex = (prev !== undefined) ? prev : mistakes[mistakes.length - 1];
    this.manualScrollOffset = 0;
    this.notifyReviewNoteChanged();
  }

  notifyReviewNoteChanged() {
    if (this.onReviewNoteChanged && this.practiceData && this.practiceData.melody && this.activeReviewMistakeIndex >= 0) {
      const melody = this.practiceData.melody;
      if (this.activeReviewMistakeIndex < melody.notes.length) {
        const targetNote = melody.notes[this.activeReviewMistakeIndex];
        const res = (this.practiceData.noteResults && this.practiceData.noteResults[this.activeReviewMistakeIndex]) || null;
        this.onReviewNoteChanged({
          index: this.activeReviewMistakeIndex,
          targetMidi: targetNote.midi,
          targetNote,
          wrongMidi: res ? res.lastWrongMidi : null,
          mistakes: res ? res.mistakes : 0,
          timing: res ? res.timing : null
        });
      }
    }
  }

  /**
   * Handle note strike (Note On)
   */
  noteOn(midi, velocity = 100) {
    const now = performance.now();
    const noteData = {
      midi,
      velocity: Math.max(20, Math.min(127, velocity)),
      startTime: now,
      releasedTime: null,
      active: true
    };

    this.activeNotes.set(midi, noteData);
    this.fadingNotes.delete(midi);

    // In scrolling mode, add to history
    this.noteHistory.push({
      midi,
      velocity: noteData.velocity,
      startTime: now,
      endTime: null,
      active: true
    });

    // In live mode, add to recent melodic phrase
    this.recentPhrase.push({
      midi,
      velocity: noteData.velocity,
      startTime: now,
      endTime: null,
      active: true
    });

    // Limit history memory
    if (this.noteHistory.length > 500) {
      this.noteHistory.shift();
    }
    if (this.recentPhrase.length > 12) {
      this.recentPhrase.shift();
    }
  }

  /**
   * Handle note release (Note Off)
   */
  noteOff(midi) {
    const now = performance.now();
    const existing = this.activeNotes.get(midi);
    if (existing) {
      existing.active = false;
      existing.releasedTime = now;
      this.fadingNotes.set(midi, { ...existing });
      this.activeNotes.delete(midi);
    }

    // Update history note end time
    for (let i = this.noteHistory.length - 1; i >= 0; i--) {
      if (this.noteHistory[i].midi === midi && this.noteHistory[i].active) {
        this.noteHistory[i].active = false;
        this.noteHistory[i].endTime = now;
        break;
      }
    }

    // Update phrase note end time
    for (let i = this.recentPhrase.length - 1; i >= 0; i--) {
      if (this.recentPhrase[i].midi === midi && this.recentPhrase[i].active) {
        this.recentPhrase[i].active = false;
        this.recentPhrase[i].endTime = now;
        break;
      }
    }
  }

  clearNotes() {
    this.activeNotes.clear();
    this.fadingNotes.clear();
    this.recentPhrase = [];
  }

  startRenderLoop() {
    const loop = (timestamp) => {
      try {
        this.render(timestamp);
      } catch (err) {
        console.error('Error in notation render frame:', err);
      } finally {
        this.animationFrameId = requestAnimationFrame(loop);
      }
    };
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.animationFrameId = requestAnimationFrame(loop);
  }

  ensureRenderLoop() {
    if (!this.animationFrameId) {
      this.startRenderLoop();
    }
  }

  destroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  /**
   * Main Render Frame
   */
  render(timestamp) {
    const dt = (timestamp - this.lastFrameTime) / 1000;
    this.lastFrameTime = timestamp;

    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // Clean canvas
    ctx.clearRect(0, 0, w, h);

    // Colors according to theme
    const isDark = this.options.theme === 'dark';
    const staffLineColor = isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(15, 23, 42, 0.3)';
    const staffBarColor  = isDark ? 'rgba(255, 255, 255, 0.45)' : 'rgba(15, 23, 42, 0.55)';
    const clefColor      = isDark ? '#e2e8f0' : '#1e293b';

    // Layout dimensions: dynamically scales with canvas height and width
    const isMobile = w < 640;
    const lineSpacing = Math.max(11, Math.min(16, Math.round(h * 0.040)));
    const staffHeight = lineSpacing * 4;
    const staffGap = lineSpacing * 4.5; // Gap between treble bottom line & bass top line
    const totalGrandStaffHeight = staffHeight * 2 + staffGap;

    const startY = Math.max(isMobile ? 32 : 36, (h - totalGrandStaffHeight) / 2);
    const trebleTopY = startY;
    const trebleBottomY = trebleTopY + staffHeight;
    const bassTopY = trebleBottomY + staffGap;
    const bassBottomY = bassTopY + staffHeight;

    const marginX = isMobile ? 18 : 50;
    const staffWidth = w - marginX * 2;

    // Draw Grand Staff infrastructure
    this.drawGrandStaffLines(ctx, marginX, staffWidth, trebleTopY, bassTopY, lineSpacing, staffLineColor, staffBarColor);

    if (this.options.mode !== 'practice') {
      this.drawClefs(ctx, marginX + (isMobile ? 14 : 20), trebleTopY, bassTopY, lineSpacing, clefColor);
    }

    // Clean up faded notes older than 450ms
    for (const [midi, note] of this.fadingNotes.entries()) {
      if (timestamp - note.releasedTime > 450) {
        this.fadingNotes.delete(midi);
      }
    }

    if (this.options.mode === 'practice') {
      this.renderPracticeMode(ctx, marginX, staffWidth, trebleBottomY, bassBottomY, lineSpacing, timestamp);
    } else if (this.options.mode === 'live') {
      this.renderLiveMode(ctx, marginX, staffWidth, trebleBottomY, bassBottomY, lineSpacing, timestamp);
    } else {
      this.renderScrollingMode(ctx, marginX, staffWidth, trebleBottomY, bassBottomY, lineSpacing, timestamp);
    }
  }

  /**
   * Draw the 5 lines of Treble & Bass staves plus connecting brackets
   */
  drawGrandStaffLines(ctx, x, width, trebleTopY, bassTopY, spacing, lineColor, barColor) {
    ctx.save();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = lineColor;

    // Treble staff (5 lines)
    for (let i = 0; i < 5; i++) {
      const y = trebleTopY + i * spacing;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + width, y);
      ctx.stroke();
    }

    // Bass staff (5 lines)
    for (let i = 0; i < 5; i++) {
      const y = bassTopY + i * spacing;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + width, y);
      ctx.stroke();
    }

    // Left Bar Line (connecting top of treble to bottom of bass)
    ctx.lineWidth = 2;
    ctx.strokeStyle = barColor;
    const trebleTop = trebleTopY;
    const bassBottom = bassTopY + spacing * 4;

    ctx.beginPath();
    ctx.moveTo(x, trebleTop);
    ctx.lineTo(x, bassBottom);
    ctx.stroke();

    // Right Bar Line (measure end)
    ctx.beginPath();
    ctx.moveTo(x + width, trebleTop);
    ctx.lineTo(x + width, bassBottom);
    ctx.stroke();

    // Curly Grand Staff Brace on left
    this.drawStaffBrace(ctx, x - 18, trebleTop - 6, bassBottom + 6);

    ctx.restore();
  }

  /**
   * Draw classic grand staff bracket/brace
   */
  drawStaffBrace(ctx, x, topY, bottomY) {
    const midY = (topY + bottomY) / 2;
    const height = bottomY - topY;
    const depth = 14;

    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = this.options.theme === 'dark' ? '#94a3b8' : '#475569';
    ctx.fillStyle = this.options.theme === 'dark' ? '#94a3b8' : '#475569';
    ctx.lineWidth = 2.5;

    // Vertical curve with central point
    ctx.moveTo(x + 4, topY);
    ctx.bezierCurveTo(x - depth * 0.4, topY + height * 0.15, x - depth, midY - height * 0.1, x - depth, midY);
    ctx.bezierCurveTo(x - depth, midY + height * 0.1, x - depth * 0.4, bottomY - height * 0.15, x + 4, bottomY);

    // Inner contour
    ctx.bezierCurveTo(x - depth * 0.2, bottomY - height * 0.15, x - depth * 0.6, midY + height * 0.08, x - depth * 0.6, midY);
    ctx.bezierCurveTo(x - depth * 0.6, midY - height * 0.08, x - depth * 0.2, topY + height * 0.15, x + 4, topY);

    ctx.fill();
    ctx.restore();
  }

  /**
   * Vector rendering of Treble and Bass clefs
   */
  drawClefs(ctx, x, trebleTopY, bassTopY, spacing, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;

    // --- TREBLE CLEF ---
    // Scaled to fit 5 lines (4 * spacing)
    ctx.save();
    const gLineY = trebleTopY + 3 * spacing; // G4 line (2nd from bottom = 4th line from top)
    const scaleT = (spacing * 4) / 60;
    ctx.translate(x + 8, gLineY);
    ctx.scale(scaleT, scaleT);

    // Beautiful stylized Treble Clef path
    ctx.beginPath();
    ctx.lineWidth = 2.8;
    ctx.moveTo(1, 35);
    // Bottom hook / dot
    ctx.arc(1, 37, 3.8, 0, Math.PI * 2);
    ctx.fill();

    // Central spiral around G4
    ctx.beginPath();
    ctx.lineWidth = 3;
    ctx.moveTo(1, 34);
    ctx.lineTo(1, -38);
    // Top loop
    ctx.bezierCurveTo(2, -50, 15, -45, 14, -30);
    ctx.bezierCurveTo(13, -15, -4, 5, -4, 15);
    // Lower curl around line
    ctx.bezierCurveTo(-4, 25, 12, 28, 14, 15);
    ctx.bezierCurveTo(15, 4, 3, 2, 0, 7);
    ctx.stroke();
    ctx.restore();

    // --- BASS CLEF ---
    ctx.save();
    const fLineY = bassTopY + 1 * spacing; // F3 line (2nd from top = 4th from bottom)
    const scaleB = (spacing * 4) / 48;
    ctx.translate(x + 8, fLineY);
    ctx.scale(scaleB, scaleB);

    // F-clef main curve
    ctx.beginPath();
    ctx.lineWidth = 3.2;
    ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.lineWidth = 3.4;
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(0, -14, 20, -14, 20, 2);
    ctx.bezierCurveTo(20, 14, 10, 24, 0, 28);
    ctx.stroke();

    // The two F-clef dots in spaces 3 and 4
    ctx.beginPath();
    ctx.arc(26, -5, 3.2, 0, Math.PI * 2);
    ctx.arc(26, 7, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  /**
   * Render Live Mode: Active held chord/notes displayed centrally on Grand Staff
   */
  /**
   * Render Live Mode: Active held chord/notes and melodic contour ribbons displayed on Grand Staff
   */
  renderLiveMode(ctx, staffX, staffWidth, trebleBottomY, bassBottomY, lineSpacing, timestamp) {
    const preferFlats = this.options.preferFlats;
    const now = performance.now();

    // Prune phrase notes older than 3500ms if inactive
    this.recentPhrase = this.recentPhrase.filter(n => n.active || (now - (n.endTime || n.startTime) < 3500));

    // If no active held notes and no recent phrase:
    if (this.activeNotes.size === 0 && this.recentPhrase.length === 0) {
      this.drawIdleStaffGuide(ctx, staffX, staffWidth, trebleBottomY, bassBottomY, lineSpacing);
      return;
    }

    // Cluster phrase notes into chord columns by start time (within 65ms = struck together)
    const columns = [];
    const sortedPhrase = [...this.recentPhrase].sort((a, b) => a.startTime - b.startTime);

    sortedPhrase.forEach(item => {
      let col = columns.find(c => Math.abs(c.startTime - item.startTime) < 65);
      if (!col) {
        col = {
          startTime: item.startTime,
          endTime: item.endTime,
          notes: []
        };
        columns.push(col);
      }
      if (!col.notes.some(n => n.midi === item.midi)) {
        col.notes.push(item);
      }
      if (item.active) col.hasActive = true;
    });

    // Fallback: ensure active notes are present
    if (this.activeNotes.size > 0 && columns.length === 0) {
      columns.push({
        startTime: now,
        endTime: null,
        hasActive: true,
        notes: Array.from(this.activeNotes.values())
      });
    }

    // Position columns horizontally across the staff
    const numCols = columns.length;
    let startX = staffX + staffWidth * 0.52;
    let colSpacing = 0;

    if (numCols > 1) {
      colSpacing = Math.min(84, Math.max(48, (staffWidth * 0.65) / (numCols - 1)));
      const totalSpan = (numCols - 1) * colSpacing;
      startX = staffX + staffWidth * 0.5 - totalSpan / 2;
    }

    // 1. Compute positions and render note items for each column
    columns.forEach((col, cIdx) => {
      const colX = numCols === 1 ? startX : (startX + cIdx * colSpacing);
      col.x = colX;

      // Group into treble & bass
      col.notes.forEach(noteData => {
        const info = MusicTheory.getNoteInfo(noteData.midi, preferFlats);
        const clef = noteData.midi >= this.options.splitPoint ? 'treble' : 'bass';
        const staffPos = MusicTheory.getStaffPosition(info.diatonicStep, clef);
        const bottomY = clef === 'treble' ? trebleBottomY : bassBottomY;
        const noteY = bottomY - staffPos * (lineSpacing / 2);

        noteData.info = info;
        noteData.clef = clef;
        noteData.staffPos = staffPos;
        noteData.x = colX;
        noteData.y = noteY;

        let alpha = 1.0;
        if (!noteData.active && (noteData.endTime || noteData.releasedTime)) {
          const rel = noteData.endTime || noteData.releasedTime;
          const elapsed = now - rel;
          alpha = Math.max(0.2, 1.0 - elapsed / 3500);
        }
        noteData.alpha = alpha;
      });

      // Render treble chord / notes in this column
      const trebleNotes = col.notes.filter(n => n.clef === 'treble').sort((a, b) => a.midi - b.midi);
      if (trebleNotes.length > 0) {
        this.renderStaffChord(ctx, trebleNotes, colX, trebleBottomY, 'treble', lineSpacing, timestamp);
      }

      // Render bass chord / notes in this column
      const bassNotes = col.notes.filter(n => n.clef === 'bass').sort((a, b) => a.midi - b.midi);
      if (bassNotes.length > 0) {
        this.renderStaffChord(ctx, bassNotes, colX, bassBottomY, 'bass', lineSpacing, timestamp);
      }

      // Harmonic Interval Ribbons (within same column if 2+ notes)
      if (this.options.showIntervalContour && col.notes.length >= 2) {
        const sortedCol = [...col.notes].sort((a, b) => a.midi - b.midi);
        for (let j = 0; j < sortedCol.length - 1; j++) {
          const a = sortedCol[j];
          const b = sortedCol[j + 1];
          const linkAlpha = Math.min(a.alpha, b.alpha);
          this.drawIntervalRibbon(ctx, a, b, lineSpacing, linkAlpha, true);
        }
      }
    });

    // 2. Melodic Interval Contour Ribbons (between consecutive columns)
    if (this.options.showIntervalContour && columns.length >= 2) {
      for (let k = 0; k < columns.length - 1; k++) {
        const colA = columns[k];
        const colB = columns[k + 1];
        // Connect lead / melody note of column A to column B (highest pitch)
        const leadA = [...colA.notes].sort((a, b) => b.midi - a.midi)[0];
        const leadB = [...colB.notes].sort((a, b) => b.midi - a.midi)[0];
        if (leadA && leadB) {
          const linkAlpha = Math.min(leadA.alpha, leadB.alpha);
          this.drawIntervalRibbon(ctx, leadA, leadB, lineSpacing, linkAlpha, false);
        }
      }
    }
  }

  /**
   * Render a cluster / chord of notes on a single clef
   */
  renderStaffChord(ctx, notes, centerX, bottomLineY, clef, lineSpacing, timestamp) {
    if (notes.length === 0) return;

    // Detect adjacent seconds to shift notehead slightly if needed
    for (let i = 0; i < notes.length; i++) {
      notes[i].shiftX = 0;
      if (i > 0) {
        const prev = notes[i - 1];
        if (Math.abs(notes[i].staffPos - prev.staffPos) === 1) {
          // Second interval: alternate shift
          notes[i].shiftX = prev.shiftX === 0 ? lineSpacing * 1.05 : 0;
        }
      }
    }

    // Determine average stem direction:
    // If highest note is far above middle line (staffPos 4), stem down.
    // Standard rule: if average staffPos >= 4, stems down; else stems up.
    const avgPos = notes.reduce((sum, n) => sum + n.staffPos, 0) / notes.length;
    const stemDirection = avgPos >= 4 ? 'down' : 'up';

    // Calculate Y coordinates
    notes.forEach(note => {
      note.y = bottomLineY - note.staffPos * (lineSpacing / 2);
      note.x = centerX + note.shiftX;
    });

    // 1. Draw Ledger Lines first so they sit cleanly under noteheads
    notes.forEach(note => {
      this.drawLedgerLines(ctx, note.x, note.staffPos, bottomLineY, lineSpacing);
    });

    // 2. Draw Unified Chord Stem
    this.drawChordStem(ctx, notes, stemDirection, lineSpacing);

    // 3. Draw Noteheads, Glows, Accidentals & Labels
    notes.forEach(note => {
      let alpha = 1.0;
      if (note.isFading && note.releasedTime) {
        const elapsed = timestamp - note.releasedTime;
        alpha = Math.max(0, 1 - elapsed / 450);
      }

      this.drawNotehead(ctx, note, lineSpacing, alpha, timestamp);
      this.drawAccidental(ctx, note, lineSpacing, alpha);

      if (this.options.showNoteNames) {
        this.drawNoteLabel(ctx, note, lineSpacing, alpha);
      }
    });
  }

  /**
   * Draw ledger lines for notes outside standard 5 lines (staffPos <= -2 or >= 10)
   * Note: staffPos -1 (space below staff) and 9 (space above staff) do not have ledger lines.
   */
  drawLedgerLines(ctx, x, staffPos, bottomLineY, spacing) {
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = this.options.theme === 'dark' ? 'rgba(255,255,255,0.75)' : 'rgba(15,23,42,0.8)';
    const ledgerWidth = spacing * 1.8;

    // Notes below bottom line (staffPos <= -2)
    if (staffPos <= -2) {
      // If staffPos is even (on a line: -2, -4, -6), lowest line is staffPos.
      // If staffPos is odd (in a space: -3, -5), lowest line is staffPos + 1 (-3 -> -2, -5 -> -4).
      const lowestLine = (staffPos % 2 === 0) ? staffPos : staffPos + 1;
      for (let pos = -2; pos >= lowestLine; pos -= 2) {
        const y = bottomLineY - pos * (spacing / 2);
        ctx.beginPath();
        ctx.moveTo(x - ledgerWidth / 2, y);
        ctx.lineTo(x + ledgerWidth / 2, y);
        ctx.stroke();
      }
    }

    // Notes above top line (staffPos >= 10)
    if (staffPos >= 10) {
      // If staffPos is even (on a line: 10, 12, 14), highest line is staffPos.
      // If staffPos is odd (in a space: 11, 13), highest line is staffPos - 1 (11 -> 10, 13 -> 12).
      const highestLine = (staffPos % 2 === 0) ? staffPos : staffPos - 1;
      for (let pos = 10; pos <= highestLine; pos += 2) {
        const y = bottomLineY - pos * (spacing / 2);
        ctx.beginPath();
        ctx.moveTo(x - ledgerWidth / 2, y);
        ctx.lineTo(x + ledgerWidth / 2, y);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  /**
   * Draw note stem connecting chord notes
   */
  drawChordStem(ctx, notes, direction, spacing) {
    if (notes.length === 0) return;

    ctx.save();
    ctx.lineWidth = 2.0;
    ctx.strokeStyle = this.options.theme === 'dark' ? '#f8fafc' : '#0f172a';

    const rx = spacing * 0.62;
    const ry = spacing * 0.44;

    const minY = Math.min(...notes.map(n => n.y));
    const maxY = Math.max(...notes.map(n => n.y));
    const stemLength = spacing * 3.4;

    if (direction === 'up') {
      // Stem on right edge of notehead
      const stemX = notes[0].x + rx * 0.88;
      const startY = maxY;
      const endY = minY - stemLength;

      ctx.beginPath();
      ctx.moveTo(stemX, startY);
      ctx.lineTo(stemX, endY);
      ctx.stroke();
    } else {
      // Stem on left edge of notehead
      const stemX = notes[0].x - rx * 0.88;
      const startY = minY;
      const endY = maxY + stemLength;

      ctx.beginPath();
      ctx.moveTo(stemX, startY);
      ctx.lineTo(stemX, endY);
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Draw color-coded connecting ribbon or line between two noteheads
   * Green for steps (2nd), Orange for skips (3rd), Purple for leaps (4th+)
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} n1 - starting note { x, y, midi }
   * @param {object} n2 - ending note { x, y, midi }
   * @param {number} lineSpacing
   * @param {number} alpha
   * @param {boolean} isHarmonic - true if simultaneous chord notes (vertical), false if melodic (horizontal)
   */
  drawIntervalRibbon(ctx, n1, n2, lineSpacing, alpha = 1.0, isHarmonic = false) {
    if (!n1 || !n2 || n1.x === undefined || n1.y === undefined || n2.x === undefined || n2.y === undefined) return;

    const interval = MusicTheory.classifyInterval(n1.midi, n2.midi, this.options.preferFlats);
    if (interval.category === 'unison' && isHarmonic) return;

    ctx.save();
    ctx.globalAlpha = Math.max(0.18, Math.min(1.0, alpha));

    const dx = n2.x - n1.x;
    const dy = n2.y - n1.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 4) {
      ctx.restore();
      return;
    }

    let cp1x, cp1y, cp2x, cp2y;
    if (isHarmonic) {
      // Harmonic chord ribbon: subtle outer arch so it doesn't obscure the stem
      const arch = Math.min(30, Math.abs(dy) * 0.35 + 8);
      cp1x = n1.x + arch;
      cp1y = n1.y + dy * 0.25;
      cp2x = n2.x + arch;
      cp2y = n1.y + dy * 0.75;
    } else {
      // Melodic contour ribbon: smooth horizontal S-curve bezier
      const tension = Math.min(0.48, Math.max(0.32, Math.abs(dx) / 180));
      cp1x = n1.x + dx * tension;
      cp1y = n1.y;
      cp2x = n2.x - dx * tension;
      cp2y = n2.y;
    }

    // 1. Draw glowing ribbon shadow
    ctx.shadowColor = interval.glow;
    ctx.shadowBlur = 10;

    // 2. Draw tapered ribbon stroke
    const ribbonWidth = Math.max(2.5, Math.min(5.5, lineSpacing * 0.32));
    ctx.strokeStyle = interval.rgba;
    ctx.lineWidth = ribbonWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(n1.x, n1.y);
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, n2.x, n2.y);
    ctx.stroke();

    // 3. Draw floating micro interval badge at midpoint
    const t = 0.5;
    const midX = (1 - t) * (1 - t) * (1 - t) * n1.x + 3 * (1 - t) * (1 - t) * t * cp1x + 3 * (1 - t) * t * t * cp2x + t * t * t * n2.x;
    const midY = (1 - t) * (1 - t) * (1 - t) * n1.y + 3 * (1 - t) * (1 - t) * t * cp1y + 3 * (1 - t) * t * t * cp2y + t * t * t * n2.y;

    const badgeText = interval.shortLabel; // e.g. "2nd", "3rd", "5th"
    ctx.font = '700 9.5px "Inter", system-ui, sans-serif';
    const textMetrics = ctx.measureText(badgeText);
    const badgePadX = 4.5;
    const badgeW = textMetrics.width + badgePadX * 2;
    const badgeH = 15;
    const badgeX = midX - badgeW / 2;
    const badgeY = midY - badgeH / 2;

    // Pill background
    ctx.shadowBlur = 6;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.fillStyle = this.options.theme === 'dark' ? '#090d16' : '#ffffff';
    ctx.strokeStyle = interval.color;
    ctx.lineWidth = 1.2;

    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 7);
    } else {
      ctx.rect(badgeX, badgeY, badgeW, badgeH);
    }
    ctx.fill();
    ctx.stroke();

    // Pill text
    ctx.shadowBlur = 0;
    ctx.fillStyle = interval.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, midX, midY + 0.5);

    ctx.restore();
  }

  /**
   * Draw elliptical notehead with velocity glow and animation
   */
  drawNotehead(ctx, note, spacing, alpha, timestamp) {
    ctx.save();
    ctx.globalAlpha = alpha;

    const rx = spacing * 0.62;
    const ry = spacing * 0.44;
    const rot = -0.32; // ~-18 degrees

    // Determine Key Signature and accidental deviation
    const noteMidi = (typeof note.midi === 'number') ? note.midi : ((note.info && typeof note.info.midi === 'number') ? note.info.midi : 60);
    const keySig = (this.practiceData && this.practiceData.melody && this.practiceData.melody.key) || this.options.keySignature || 'C Major';
    const accDev = MusicTheory.isAccidentalDeviation(noteMidi, keySig);
    const isAlert = this.options.accidentalAlert && accDev.isDeviation;

    // Outer warning pulse / glow for Accidental Alert Flash
    if (isAlert) {
      ctx.save();
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(note.x, note.y, (rx + 7) * 1.3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(245, 158, 11, 0.25)';
      ctx.fill();

      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 2]);
      ctx.stroke();
      ctx.restore();
    }

    // Velocity-based glow
    if (note.active) {
      const velNorm = (note.velocity || 100) / 127;
      const glowColor = isAlert 
        ? '#f59e0b' 
        : (note.clef === 'treble' ? this.options.activeGlowColor : this.options.bassActiveColor);

      // Outer radial pulse on note strike
      const elapsed = timestamp - (note.startTime || timestamp);
      if (elapsed < 300) {
        const pulse = (1 - elapsed / 300);
        ctx.beginPath();
        ctx.arc(note.x, note.y, (rx + 8) * (1 + pulse * 0.6), 0, Math.PI * 2);
        ctx.fillStyle = glowColor;
        ctx.globalAlpha = alpha * pulse * 0.4 * velNorm;
        ctx.fill();
        ctx.globalAlpha = alpha;
      }

      // Notehead glow
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = isAlert ? 22 : (14 + 10 * velNorm);
    }

    // Main notehead body
    ctx.beginPath();
    ctx.ellipse(note.x, note.y, rx, ry, rot, 0, Math.PI * 2);

    if (note.active) {
      if (isAlert) {
        ctx.fillStyle = '#fbbf24'; // Luminous Warning Amber
      } else {
        ctx.fillStyle = note.clef === 'treble' ? '#38bdf8' : '#c084fc';
      }
    } else {
      if (isAlert) {
        ctx.fillStyle = this.options.theme === 'dark' ? '#fbbf24' : '#d97706';
      } else {
        // Diatonic notehead remains clean, crisp, neutral
        ctx.fillStyle = this.options.theme === 'dark' ? '#f8fafc' : '#0f172a';
      }
    }
    ctx.fill();

    // Subtle inner 3D highlight
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.ellipse(note.x - rx * 0.2, note.y - ry * 0.2, rx * 0.55, ry * 0.35, rot, 0, Math.PI * 2);
    ctx.fillStyle = isAlert ? 'rgba(255, 255, 255, 0.65)' : 'rgba(255, 255, 255, 0.45)';
    ctx.fill();

    ctx.restore();
  }

  /**
   * Draw musical accidental (# or b or natural)
   */
  drawAccidental(ctx, note, spacing, alpha) {
    if (!note || !note.info || !note.info.accidental) return;

    ctx.save();
    ctx.globalAlpha = alpha;
    const accX = note.x - spacing * 1.5;
    const accY = note.y;

    const noteMidi = (typeof note.midi === 'number') ? note.midi : ((note.info && typeof note.info.midi === 'number') ? note.info.midi : 60);
    const keySig = (this.practiceData && this.practiceData.melody && this.practiceData.melody.key) || this.options.keySignature || 'C Major';
    const accDev = MusicTheory.isAccidentalDeviation(noteMidi, keySig);
    const isAlert = this.options.accidentalAlert && accDev.isDeviation;

    if (isAlert) {
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#f59e0b';
      ctx.strokeStyle = '#f59e0b';
    } else {
      ctx.fillStyle = note.active ? (note.clef === 'treble' ? '#38bdf8' : '#c084fc') : (this.options.theme === 'dark' ? '#f8fafc' : '#0f172a');
      ctx.strokeStyle = ctx.fillStyle;
    }

    if (note.info.accidental === '#' || note.info.accidental === '♯') {
      // Crisp vector Sharp symbol
      ctx.lineWidth = isAlert ? 1.7 : 1.3;
      const w = spacing * 0.48;
      const h = spacing * 0.95;

      // Two vertical parallel lines
      ctx.beginPath();
      ctx.moveTo(accX - w / 3, accY - h / 2);
      ctx.lineTo(accX - w / 3, accY + h / 2);
      ctx.moveTo(accX + w / 3, accY - h / 2 + 2);
      ctx.lineTo(accX + w / 3, accY + h / 2 + 2);
      ctx.stroke();

      // Slanted crossbars
      ctx.lineWidth = isAlert ? 2.8 : 2.4;
      ctx.beginPath();
      ctx.moveTo(accX - w * 0.6, accY - spacing * 0.2 + 2);
      ctx.lineTo(accX + w * 0.6, accY - spacing * 0.2 - 2);
      ctx.moveTo(accX - w * 0.6, accY + spacing * 0.2 + 2);
      ctx.lineTo(accX + w * 0.6, accY + spacing * 0.2 - 2);
      ctx.stroke();
    } else if (note.info.accidental === 'b' || note.info.accidental === '♭') {
      // Crisp vector Flat symbol
      ctx.lineWidth = isAlert ? 2.0 : 1.6;
      const h = spacing * 1.1;
      const w = spacing * 0.5;

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(accX - w * 0.3, accY - h * 0.6);
      ctx.lineTo(accX - w * 0.3, accY + h * 0.35);
      ctx.stroke();

      // Curved loop
      ctx.lineWidth = isAlert ? 2.4 : 2.0;
      ctx.beginPath();
      ctx.moveTo(accX - w * 0.3, accY + h * 0.35);
      ctx.bezierCurveTo(accX + w * 0.9, accY + h * 0.2, accX + w * 0.7, accY - h * 0.2, accX - w * 0.3, accY - h * 0.05);
      ctx.stroke();
    } else if (note.info.accidental === '♮' || note.info.accidental === 'natural') {
      // Crisp vector Natural symbol
      ctx.lineWidth = isAlert ? 1.8 : 1.4;
      const w = spacing * 0.44;
      const h = spacing * 0.95;
      ctx.beginPath();
      ctx.moveTo(accX - w / 2, accY - h / 2);
      ctx.lineTo(accX - w / 2, accY + h * 0.2);
      ctx.moveTo(accX + w / 2, accY - h * 0.2);
      ctx.lineTo(accX + w / 2, accY + h / 2);
      ctx.stroke();
      ctx.lineWidth = isAlert ? 2.4 : 2.0;
      ctx.beginPath();
      ctx.moveTo(accX - w / 2, accY - h * 0.18);
      ctx.lineTo(accX + w / 2, accY - h * 0.18 + 2);
      ctx.moveTo(accX - w / 2, accY + h * 0.18 - 2);
      ctx.lineTo(accX + w / 2, accY + h * 0.18);
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Draw pitch name tag (e.g. "C4", "G#5") near note
   */
  drawNoteLabel(ctx, note, spacing, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha * 0.9;
    ctx.font = `600 ${Math.round(spacing * 0.7)}px "Inter", system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const labelX = note.x + spacing * 1.25;
    const labelY = note.y;

    // Text glow
    ctx.fillStyle = note.active ? (note.clef === 'treble' ? '#7dd3fc' : '#d8b4fe') : (this.options.theme === 'dark' ? '#94a3b8' : '#64748b');
    ctx.fillText(note.info.fullName, labelX, labelY);

    ctx.restore();
  }

  /**
   * Draw idle placeholder guide when no keys are pressed
   */
  drawIdleStaffGuide(ctx, staffX, staffWidth, trebleBottomY, bassBottomY, lineSpacing) {
    ctx.save();
    const isDark = this.options.theme === 'dark';
    ctx.fillStyle = isDark ? 'rgba(148, 163, 184, 0.4)' : 'rgba(100, 116, 139, 0.5)';
    ctx.font = '500 13px "Inter", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const midY = (trebleBottomY + bassBottomY - lineSpacing * 4) / 2;
    ctx.fillText('Play notes on your MIDI keyboard or piano below to see them here', staffX + staffWidth / 2, midY);

    // Draw Middle C ledger guide line lightly
    const middleCY = trebleBottomY + lineSpacing;
    ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(staffX + 50, middleCY);
    ctx.lineTo(staffX + staffWidth - 20, middleCY);
    ctx.stroke();

    ctx.font = '10px "Inter", sans-serif';
    ctx.fillStyle = isDark ? 'rgba(148, 163, 184, 0.3)' : 'rgba(100, 116, 139, 0.35)';
    ctx.fillText('Middle C (C4)', staffX + staffWidth - 60, middleCY - 6);

    // Interval Contour & Accidental Alert visual legend pill
    if (this.options.showIntervalContour || this.options.accidentalAlert) {
      const legendY = trebleBottomY - lineSpacing * 4.6;
      const legendCenterX = staffX + staffWidth / 2;
      ctx.setLineDash([]);
      ctx.font = '600 11px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = isDark ? 'rgba(148, 163, 184, 0.7)' : 'rgba(71, 85, 105, 0.75)';
      ctx.fillText('Intervals:  🟢 Step (2nd)   🟠 Skip (3rd)   🟣 Leap (4th+)   •   Key: ' + (this.options.keySignature || 'C Major') + ' (⚠️ Accidental Alert)', legendCenterX, legendY);
    }

    ctx.restore();
  }

  /**
   * Render Continuous Scrolling Timeline Mode
   * Notes stream horizontally from right to left like a live sheet roll
   */
  renderScrollingMode(ctx, staffX, staffWidth, trebleBottomY, bassBottomY, lineSpacing, timestamp) {
    const playheadX = staffX + 110;
    const speed = this.options.scrollSpeed; // px per second
    const preferFlats = this.options.preferFlats;
    const keySig = this.options.keySignature || 'C Major';

    ctx.save();

    // Draw Playhead Line
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.beginPath();
    ctx.moveTo(playheadX, trebleBottomY - lineSpacing * 6);
    ctx.lineTo(playheadX, bassBottomY + lineSpacing * 3);
    ctx.stroke();
    ctx.setLineDash([]);

    // Visible notes collection for interval contour linking
    const visibleTimelineNotes = [];

    // Draw Scrolling notes
    for (let i = this.noteHistory.length - 1; i >= 0; i--) {
      const item = this.noteHistory[i];
      const timeSinceStart = (timestamp - item.startTime) / 1000;
      const durationSec = item.active ? (timestamp - item.startTime) / 1000 : (item.endTime - item.startTime) / 1000;

      // X coordinate: note moves left as time advances
      const startX = playheadX + (item.active ? 0 : (item.endTime - timestamp) / 1000 * speed);
      const noteWidth = Math.max(lineSpacing * 1.2, durationSec * speed);

      // Stop if scrolled off screen to left
      if (startX + noteWidth < staffX) {
        continue;
      }

      const info = MusicTheory.getNoteInfo(item.midi, preferFlats);
      const clef = item.midi >= this.options.splitPoint ? 'treble' : 'bass';
      const staffPos = MusicTheory.getStaffPosition(info.diatonicStep, clef);
      const bottomY = clef === 'treble' ? trebleBottomY : bassBottomY;
      const y = bottomY - staffPos * (lineSpacing / 2);

      // Accidental Alert check
      const accDev = MusicTheory.isAccidentalDeviation(item.midi, keySig);
      const isAlert = this.options.accidentalAlert && accDev.isDeviation;

      // Draw horizontal note bar (duration ribbon)
      const barX = playheadX - timeSinceStart * speed;
      const barW = Math.max(16, durationSec * speed);

      // Collect note center for contour ribbon
      visibleTimelineNotes.push({
        midi: item.midi,
        x: barX + barW * 0.5,
        y,
        startTime: item.startTime,
        active: item.active
      });

      // Draw ledger lines if needed
      this.drawLedgerLines(ctx, barX + barW, staffPos, bottomY, lineSpacing);

      // Draw ribbon
      ctx.beginPath();
      const radius = 5;
      const rx = barX;
      const rw = barW;
      const ry = y - lineSpacing * 0.35;
      const rh = lineSpacing * 0.7;

      if (isAlert) {
        ctx.fillStyle = item.active ? 'rgba(251, 191, 36, 0.95)' : 'rgba(245, 158, 11, 0.85)';
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = item.active ? 16 : 8;
      } else {
        ctx.fillStyle = clef === 'treble' ? 'rgba(56, 189, 248, 0.85)' : 'rgba(192, 132, 252, 0.85)';
        if (item.active) {
          ctx.shadowColor = clef === 'treble' ? '#38bdf8' : '#a855f7';
          ctx.shadowBlur = 10;
        } else {
          ctx.shadowBlur = 0;
        }
      }

      if (ctx.roundRect) {
        ctx.roundRect(rx, ry, rw, rh, radius);
      } else {
        ctx.rect(rx, ry, rw, rh);
      }
      ctx.fill();
      ctx.shadowBlur = 0;

      // Note label & accidental tag
      ctx.font = '600 10px "Inter", sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      if (rw > 28) {
        const alertPrefix = isAlert ? '⚠️ ' : '';
        ctx.fillText(alertPrefix + info.fullName, rx + 6, y);
      }
    }

    // Interval contour ribbons between consecutive timeline notes
    if (this.options.showIntervalContour && visibleTimelineNotes.length >= 2) {
      const sortedTimeline = [...visibleTimelineNotes].sort((a, b) => a.startTime - b.startTime);
      for (let k = 0; k < sortedTimeline.length - 1; k++) {
        const n1 = sortedTimeline[k];
        const n2 = sortedTimeline[k + 1];
        this.drawIntervalRibbon(ctx, n1, n2, lineSpacing, 0.65, false);
      }
    }

    ctx.restore();
  }

  /**
   * Set active practice state from Trainer
   */
  setPracticeState(data) {
    const melodyChanged = (!this.practiceData && data) || (this.practiceData && data && this.practiceData.melody?.id !== data.melody?.id);
    const becameFinished = (!this.practiceData?.isFinished && data?.isFinished);

    this.practiceData = data;
    if (data) {
      this.options.mode = 'practice';
      if (data.melody && data.melody.key) {
        this.options.keySignature = data.melody.key;
      }
    }

    if (melodyChanged) {
      this.activeReviewMistakeIndex = -1;
      this.manualScrollOffset = 0;
      this.playheadBeats = 0;
      this.smoothScrollX = 0;
      this.clearNotes();
    }

    if (becameFinished) {
      this.manualScrollOffset = 0;
      const mistakes = this.getMistakeNoteIndices();
      if (mistakes.length > 0) {
        this.activeReviewMistakeIndex = mistakes[0];
        this.notifyReviewNoteChanged();
      }
    }

    this.ensureRenderLoop();
  }

  triggerMistakeFlash() {
    this.flashMistakeTimestamp = performance.now();
  }

  setPlayheadBeats(beats) {
    this.playheadBeats = beats;
  }

  triggerRecoveryFlash() {
    this.flashRecoveryTimestamp = performance.now();
  }

  /**
   * Draw active played notes in dedicated Live INPUT column
   */
  drawActivePlayedNotes(ctx, targetX, trebleBottomY, bassBottomY, lineSpacing) {
    if (this.activeNotes.size === 0) return;

    const count = this.activeNotes.size;
    let idx = 0;
    const preferFlats = this.options.preferFlats;
    const stepHeight = lineSpacing * 0.5;

    const targetNote = this.practiceData ? (this.practiceData.melody?.notes[this.practiceData.noteIndex] || null) : null;
    const prevNote = (this.practiceData && this.practiceData.noteIndex > 0)
      ? (this.practiceData.melody?.notes[this.practiceData.noteIndex - 1] || null)
      : null;

    for (const [midi, noteData] of this.activeNotes.entries()) {
      const info = MusicTheory.getNoteInfo(midi, preferFlats);
      const isTreble = midi >= this.options.splitPoint;
      const clef = isTreble ? 'treble' : 'bass';
      const staffPos = MusicTheory.getStaffPosition(info.diatonicStep, clef);
      const bottomY = isTreble ? trebleBottomY : bassBottomY;
      const noteY = bottomY - staffPos * stepHeight;

      const headW = lineSpacing * 1.35;
      const headH = lineSpacing * 0.95;

      const xOffset = (count > 1) ? (idx - (count - 1) * 0.5) * 24 : 0;
      const noteX = targetX + xOffset;

      let color = '#38bdf8'; // Electric Sky 400 default

      if (this.practiceData && !this.practiceData.isFinished) {
        if ((targetNote && midi === targetNote.midi) || (prevNote && midi === prevNote.midi)) {
          color = '#22c55e'; // Emerald 500 (correct note hit)
        } else {
          color = '#f43f5e'; // Rose 500 (wrong note struck)
        }
      }

      // Ledger lines
      this.drawLedgerLines(ctx, noteX, staffPos, bottomY, lineSpacing);

      ctx.save();

      // Radiant pulse glow
      ctx.beginPath();
      ctx.arc(noteX, noteY, headW * 0.9, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.35;
      ctx.fill();
      ctx.globalAlpha = 1.0;

      // Notehead (tilted)
      ctx.beginPath();
      ctx.ellipse(noteX, noteY, headW * 0.5, headH * 0.5, -0.28, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // Stem
      const stemUp = staffPos < 4;
      const stemX = stemUp ? (noteX + headW * 0.40) : (noteX - headW * 0.40);
      const stemLen = lineSpacing * 3.2;
      const stemEndY = stemUp ? (noteY - stemLen) : (noteY + stemLen);
      ctx.lineWidth = 2.0;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(stemX, noteY);
      ctx.lineTo(stemX, stemEndY);
      ctx.stroke();

      // Accidental
      if (info.accidental) {
        this.drawAccidental(ctx, { x: noteX, y: noteY, midi, info, active: true, clef }, lineSpacing, 1.0);
      }

      // Active pitch tag
      ctx.font = '700 11px "Inter", sans-serif';
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const labelY = stemUp ? (noteY + lineSpacing * 1.1) : (noteY - lineSpacing * 1.4);
      ctx.fillText(info.fullName, noteX, labelY);

      ctx.restore();
      idx++;
    }
  }

  /**
   * Render Interactive Melody Practice Sheet Music Mode with VST3 Parity
   */
  renderPracticeMode(ctx, staffX, staffWidth, trebleBottomY, bassBottomY, lineSpacing, timestamp) {
    if (!this.practiceData || !this.practiceData.melody) {
      this.drawIdleStaffGuide(ctx, staffX, staffWidth, trebleBottomY, bassBottomY, lineSpacing);
      return;
    }

    this.noteHitboxes = [];
    const isDark = this.options.theme === 'dark';
    const preferFlats = this.options.preferFlats;
    const isMobile = this.width < 640;

    const melody = this.practiceData.melody;
    const currentIdx = this.practiceData.noteIndex;
    const results = this.practiceData.noteResults || [];
    const isFinished = !!this.practiceData.isFinished;
    const totalNotes = melody.notes.length;
    const timeSig = melody.timeSignature || [4, 4];
    const beatsPerMeasure = timeSig[0] || 4;

    const trebleTopY = trebleBottomY - lineSpacing * 4;
    const bassTopY = bassBottomY - lineSpacing * 4;

    const mistakeIndices = this.getMistakeNoteIndices();
    const hasMistakes = mistakeIndices.length > 0;

    // Auto-focus first mistake upon melody finish if none selected
    if (isFinished && hasMistakes && (this.activeReviewMistakeIndex === -1 || !mistakeIndices.includes(this.activeReviewMistakeIndex))) {
      this.activeReviewMistakeIndex = mistakeIndices[0];
      this.notifyReviewNoteChanged();
    }

    // 1. Staff Header Controls & Banner
    const headerY = Math.max(10, trebleTopY - 26);
    const staffRightX = staffX + staffWidth;

    if (isFinished && hasMistakes) {
      // Header Review Navigation Controls
      const curOrder = mistakeIndices.indexOf(this.activeReviewMistakeIndex) + 1;
      const totalM = mistakeIndices.length;

      const btnW = 28;
      const btnH = 20;
      const pillW = 104;
      const groupW = btnW + 6 + pillW + 6 + btnW;
      const groupX = staffRightX - groupW;

      this.prevMistakeBtnBounds = { x: groupX, y: headerY, width: btnW, height: btnH };
      this.reviewPillBounds = { x: groupX + btnW + 6, y: headerY, width: pillW, height: btnH };
      this.nextMistakeBtnBounds = { x: groupX + btnW + 6 + pillW + 6, y: headerY, width: btnW, height: btnH };

      // Prev Button
      ctx.save();
      ctx.fillStyle = isDark ? '#1e293b' : '#e2e8f0';
      ctx.strokeStyle = isDark ? '#475569' : '#cbd5e1';
      ctx.lineWidth = 1;
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(this.prevMistakeBtnBounds.x, this.prevMistakeBtnBounds.y, btnW, btnH, 4);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect(this.prevMistakeBtnBounds.x, this.prevMistakeBtnBounds.y, btnW, btnH);
      }
      // Left Arrow
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      const pcx = this.prevMistakeBtnBounds.x + btnW / 2;
      const pcy = this.prevMistakeBtnBounds.y + btnH / 2;
      ctx.moveTo(pcx + 3, pcy - 4);
      ctx.lineTo(pcx + 3, pcy + 4);
      ctx.lineTo(pcx - 3, pcy);
      ctx.closePath();
      ctx.fill();

      // Review Pill Badge
      ctx.fillStyle = 'rgba(244, 63, 94, 0.2)';
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 1;
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(this.reviewPillBounds.x, this.reviewPillBounds.y, pillW, btnH, 4);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect(this.reviewPillBounds.x, this.reviewPillBounds.y, pillW, btnH);
      }
      ctx.font = '700 10.5px "Inter", sans-serif';
      ctx.fillStyle = '#fb7185';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`Review ${curOrder || 1} of ${totalM}`, this.reviewPillBounds.x + pillW / 2, this.reviewPillBounds.y + btnH / 2);

      // Next Button
      ctx.fillStyle = isDark ? '#1e293b' : '#e2e8f0';
      ctx.strokeStyle = isDark ? '#475569' : '#cbd5e1';
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(this.nextMistakeBtnBounds.x, this.nextMistakeBtnBounds.y, btnW, btnH, 4);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect(this.nextMistakeBtnBounds.x, this.nextMistakeBtnBounds.y, btnW, btnH);
      }
      // Right Arrow
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      const ncx = this.nextMistakeBtnBounds.x + btnW / 2;
      const ncy = this.nextMistakeBtnBounds.y + btnH / 2;
      ctx.moveTo(ncx - 3, ncy - 4);
      ctx.lineTo(ncx - 3, ncy + 4);
      ctx.lineTo(ncx + 3, ncy);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    } else {
      this.prevMistakeBtnBounds = null;
      this.nextMistakeBtnBounds = null;
      this.reviewPillBounds = null;

      // Regular note progress badge in header
      ctx.save();
      ctx.font = '700 11px "Inter", sans-serif';
      ctx.fillStyle = '#38bdf8';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const progressStr = isFinished ? '🎉 Complete' : `Note ${Math.min(currentIdx + 1, totalNotes)} of ${totalNotes}`;
      ctx.fillText(progressStr, staffRightX, headerY + 8);
      ctx.restore();
    }

    // 2. Clefs, Time Signature, and Section Divider
    const clefX = staffX + (isMobile ? 14 : 20);
    this.drawClefs(ctx, clefX, trebleTopY, bassTopY, lineSpacing, isDark ? '#e2e8f0' : '#1e293b');

    const timeSigX = staffX + (isMobile ? 42 : 54);
    this.drawTimeSignature(ctx, timeSigX, trebleBottomY, bassBottomY, lineSpacing, timeSig);

    // Section barline separating clefs/time sig from the dedicated INPUT column
    const clefDividerX = staffX + (isMobile ? 66 : 82);
    ctx.save();
    ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.4)' : 'rgba(15, 23, 42, 0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(clefDividerX, trebleTopY);
    ctx.lineTo(clefDividerX, trebleBottomY);
    ctx.moveTo(clefDividerX, bassTopY);
    ctx.lineTo(clefDividerX, bassBottomY);
    ctx.stroke();
    ctx.restore();

    // 3. Dedicated Live MIDI INPUT Column
    const inputColumnX = staffX + (isMobile ? 94 : 116);
    const targetMelodyNote = melody.notes[currentIdx] || null;

    let inputColor = isDark ? 'rgba(148, 163, 184, 0.45)' : 'rgba(100, 116, 139, 0.5)';
    if (this.activeNotes.size > 0) {
      if (!isFinished) {
        let anyMatch = false;
        for (const midi of this.activeNotes.keys()) {
          if ((targetMelodyNote && midi === targetMelodyNote.midi) ||
              (currentIdx > 0 && midi === melody.notes[currentIdx - 1]?.midi)) {
            anyMatch = true;
            break;
          }
        }
        inputColor = anyMatch ? '#22c55e' : '#f43f5e';
      } else {
        inputColor = '#38bdf8';
      }
    }

    // INPUT column header label
    ctx.save();
    ctx.font = '800 9.5px "Inter", sans-serif';
    ctx.fillStyle = inputColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('INPUT', inputColumnX, trebleTopY - lineSpacing * 0.4);

    // INPUT column subtle vertical guide line
    ctx.strokeStyle = inputColor;
    ctx.lineWidth = 1.0;
    ctx.globalAlpha = this.activeNotes.size > 0 ? 0.5 : 0.18;
    ctx.beginPath();
    ctx.moveTo(inputColumnX, trebleTopY - lineSpacing * 0.2);
    ctx.lineTo(inputColumnX, bassBottomY + lineSpacing * 0.2);
    ctx.stroke();
    ctx.globalAlpha = 1.0;
    ctx.restore();

    // Draw active played MIDI notes in this dedicated Live Input column
    this.drawActivePlayedNotes(ctx, inputColumnX, trebleBottomY, bassBottomY, lineSpacing);

    // Section barline separating Live Input column from Scrolling Melody Score
    const scoreDividerX = staffX + (isMobile ? 122 : 148);
    ctx.save();
    ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.55)' : 'rgba(15, 23, 42, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(scoreDividerX, trebleTopY);
    ctx.lineTo(scoreDividerX, trebleBottomY);
    ctx.moveTo(scoreDividerX, bassTopY);
    ctx.lineTo(scoreDividerX, bassBottomY);
    ctx.stroke();
    ctx.restore();

    // 4. Precompute Generous Non-Linear Duration Spacing & Measure Barlines
    const notesStartX = scoreDividerX + (isMobile ? 18 : 26);
    const availableWidth = staffRightX - notesStartX - 12;

    const noteXPositions = [];
    const barlineXPositions = [];
    let curX = notesStartX + 20;
    let currentMeasureBeats = 0;

    melody.notes.forEach((note, i) => {
      const info = MusicTheory.getNoteInfo(note.midi, preferFlats);

      if (i > 0) {
        const prevNote = melody.notes[i - 1];
        let spacing = Math.max(isMobile ? 58 : 72, (isMobile ? 74 : 90) * Math.pow(Math.max(0.25, prevNote.duration), 0.55));
        if (info.accidental) spacing += 16;

        if (currentMeasureBeats + prevNote.duration >= beatsPerMeasure - 0.01) {
          const barX = curX + spacing * 0.5;
          barlineXPositions.push(barX);
          spacing += 28;
          currentMeasureBeats = (currentMeasureBeats + prevNote.duration) % beatsPerMeasure;
        } else {
          currentMeasureBeats += prevNote.duration;
        }

        curX += spacing;
      } else {
        if (info.accidental) curX += 14;
      }

      noteXPositions.push(curX);
    });

    if (noteXPositions.length > 0) {
      const lastNote = melody.notes[melody.notes.length - 1];
      const lastSpacing = Math.max(65, 85 * Math.pow(Math.max(0.25, lastNote.duration), 0.55));
      barlineXPositions.push(noteXPositions[noteXPositions.length - 1] + lastSpacing * 0.75);
    }

    // Dynamic focal scrolling & drag offset
    const totalMelodyWidth = noteXPositions.length > 0 ? (noteXPositions[noteXPositions.length - 1] - notesStartX + 120) : availableWidth;
    let scrollX = 0;

    const isTimeDriven = (this.practiceData.mode === 'tempo' || this.practiceData.mode === 'strict' || this.practiceData.mode === 'first_read');
    const playheadBeats = (this.playheadBeats !== undefined && this.playheadBeats !== null)
      ? this.playheadBeats
      : (this.practiceData.playheadBeats || 0);

    // Interpolate raw X position for any musical beat along score timeline
    const getXForBeat = (targetBeats) => {
      if (noteXPositions.length === 0) return notesStartX + 20;
      let beatAcc = 0;
      for (let i = 0; i < melody.notes.length; i++) {
        const n = melody.notes[i];
        const nStart = beatAcc;
        const nEnd = beatAcc + (n.duration || 1);
        if (targetBeats >= nStart && targetBeats <= nEnd) {
          const frac = (targetBeats - nStart) / Math.max(0.01, n.duration || 1);
          const curX = noteXPositions[i];
          const nextX = (i + 1 < noteXPositions.length) ? noteXPositions[i + 1] : (curX + 80);
          return curX + frac * (nextX - curX);
        }
        beatAcc = nEnd;
      }
      if (targetBeats > beatAcc) {
        return noteXPositions[noteXPositions.length - 1] + (targetBeats - beatAcc) * 60;
      }
      return noteXPositions[0];
    };

    const playheadXRaw = getXForBeat(playheadBeats);
    const activeTargetX = (currentIdx >= 0 && currentIdx < totalNotes) ? noteXPositions[currentIdx] : notesStartX;

    // Anchor focal point close to the start of the music stave (after clefs/key signature)
    // so notes begin shifting to the left as soon as the first note is struck!
    const focusX = notesStartX + (isMobile ? 32 : 56);
    const lastNoteX = (noteXPositions.length > 0) ? noteXPositions[noteXPositions.length - 1] : notesStartX;
    const maxScroll = Math.max(0, lastNoteX - focusX + 60);

    let targetScrollX = 0;
    if (isTimeDriven && !isFinished && !this.practiceData.isCountingIn && !this.practiceData.isAnalyzing) {
      // Continuous smooth auto-scrolling locked to whichever is further ahead: playhead or active note
      const leadX = Math.max(playheadXRaw, activeTargetX);
      targetScrollX = Math.max(0, leadX - focusX);
    } else if (isFinished && this.activeReviewMistakeIndex >= 0 && this.activeReviewMistakeIndex < totalNotes) {
      const mistakeX = noteXPositions[this.activeReviewMistakeIndex];
      const reviewFocusX = notesStartX + (isMobile ? 40 : 80);
      targetScrollX = Math.max(0, mistakeX - reviewFocusX);
    } else if (isFinished) {
      // Hold completed melody comfortably in view at final note position instead of jarringly resetting to 0
      targetScrollX = Math.max(0, lastNoteX - focusX);
    } else {
      targetScrollX = Math.max(0, activeTargetX - focusX);
    }
    targetScrollX = Math.min(targetScrollX, maxScroll);

    // Smooth interpolation to prevent abrupt visual jumps
    if (this.smoothScrollX === undefined || isNaN(this.smoothScrollX) || Math.abs(this.smoothScrollX - targetScrollX) > 600) {
      this.smoothScrollX = targetScrollX;
    } else {
      this.smoothScrollX += (targetScrollX - this.smoothScrollX) * 0.18;
    }

    // Apply manual drag / wheel offset
    if (isNaN(this.manualScrollOffset)) {
      this.manualScrollOffset = 0;
    }
    const maxScrollLimit = Math.max(maxScroll, totalMelodyWidth - availableWidth + 40);
    scrollX = Math.max(0, Math.min(maxScrollLimit, this.smoothScrollX + this.manualScrollOffset));
    if (isNaN(scrollX)) {
      scrollX = 0;
    }
    this.scrollX = scrollX;

    const labelBaselineY = bassBottomY + lineSpacing * 1.05;

    // Clip rendering area to prevent drawing over clefs or INPUT column
    ctx.save();
    ctx.beginPath();
    ctx.rect(notesStartX - 6, 0, availableWidth + 22, this.height);
    ctx.clip();

    // 5. Draw Measure Barlines with Measure Numbers
    barlineXPositions.forEach((barXRaw, m) => {
      const barX = barXRaw - scrollX;
      if (barX < notesStartX - 40 || barX > staffRightX + 40) return;

      const isLast = (m === barlineXPositions.length - 1);
      ctx.save();
      if (isLast) {
        // Double barline
        ctx.strokeStyle = isDark ? 'rgba(203, 213, 225, 0.75)' : 'rgba(15, 23, 42, 0.75)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(barX - 5, trebleTopY);
        ctx.lineTo(barX - 5, trebleBottomY);
        ctx.moveTo(barX - 5, bassTopY);
        ctx.lineTo(barX - 5, bassBottomY);
        ctx.stroke();

        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(barX, trebleTopY);
        ctx.lineTo(barX, trebleBottomY);
        ctx.moveTo(barX, bassTopY);
        ctx.lineTo(barX, bassBottomY);
        ctx.stroke();
      } else {
        ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.45)' : 'rgba(15, 23, 42, 0.35)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(barX, trebleTopY);
        ctx.lineTo(barX, trebleBottomY);
        ctx.moveTo(barX, bassTopY);
        ctx.lineTo(barX, bassBottomY);
        ctx.stroke();

        // Measure Number Pill
        ctx.font = '700 9px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = isDark ? '#1e293b' : '#e2e8f0';
        const numW = 18;
        const numH = 13;
        const pillY = trebleTopY - 15;
        if (ctx.roundRect) {
          ctx.beginPath();
          ctx.roundRect(barX - numW / 2, pillY, numW, numH, 3);
          ctx.fill();
        } else {
          ctx.fillRect(barX - numW / 2, pillY, numW, numH);
        }
        ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
        ctx.fillText(String(m + 2), barX, pillY + numH / 2);
      }
      ctx.restore();
    });

    // 5.5 Optional Interval Contour Ribbons across practice score
    if (this.options.showIntervalContour && melody.notes.length >= 2) {
      for (let i = 0; i < melody.notes.length - 1; i++) {
        const n1 = melody.notes[i];
        const n2 = melody.notes[i + 1];
        const x1 = noteXPositions[i] - scrollX;
        const x2 = noteXPositions[i + 1] - scrollX;

        // Only draw for visible notes on screen
        if (x2 >= notesStartX - 40 && x1 <= staffRightX + 40) {
          const info1 = MusicTheory.getNoteInfo(n1.midi, preferFlats);
          const clef1 = n1.midi >= this.options.splitPoint ? 'treble' : 'bass';
          const pos1 = MusicTheory.getStaffPosition(info1.diatonicStep, clef1);
          const y1 = (clef1 === 'treble' ? trebleBottomY : bassBottomY) - pos1 * (lineSpacing / 2);

          const info2 = MusicTheory.getNoteInfo(n2.midi, preferFlats);
          const clef2 = n2.midi >= this.options.splitPoint ? 'treble' : 'bass';
          const pos2 = MusicTheory.getStaffPosition(info2.diatonicStep, clef2);
          const y2 = (clef2 === 'treble' ? trebleBottomY : bassBottomY) - pos2 * (lineSpacing / 2);

          this.drawIntervalRibbon(ctx, { x: x1, y: y1, midi: n1.midi }, { x: x2, y: y2, midi: n2.midi }, lineSpacing, 0.45, false);
        }
      }
    }

    // 6. Render Melody Notes & Mistake Feedback
    melody.notes.forEach((note, i) => {
      const noteX = noteXPositions[i] - scrollX;

      // Record note hitbox for direct clicking
      this.noteHitboxes.push({
        bounds: {
          x: noteX - 16,
          y: trebleTopY - 24,
          width: 32,
          height: (bassBottomY - trebleTopY) + 48
        },
        index: i
      });

      // Skip notes far off screen
      if (noteX < notesStartX - 60 || noteX > staffRightX + 60) return;

      const info = MusicTheory.getNoteInfo(note.midi, preferFlats);
      const clef = note.midi >= this.options.splitPoint ? 'treble' : 'bass';
      const staffPos = MusicTheory.getStaffPosition(info.diatonicStep, clef);
      const bottomY = clef === 'treble' ? trebleBottomY : bassBottomY;
      const noteY = bottomY - staffPos * (lineSpacing / 2);

      const isTarget = i === currentIdx && !isFinished;
      const isPast = i < currentIdx;
      const isReviewActive = isFinished && i === this.activeReviewMistakeIndex;

      const res = results[i] || null;
      const hadMistakes = res && (res.mistakes > 0 || res.status === 'mistake' || res.status === 'missed');
      const wrongMidi = res ? res.lastWrongMidi : null;
      const wrongInfo = wrongMidi !== null ? MusicTheory.getNoteInfo(wrongMidi, preferFlats) : null;
      const wrongName = wrongInfo ? wrongInfo.fullName : '?';

      // Draw Ledger Lines
      this.drawLedgerLines(ctx, noteX, staffPos, bottomY, lineSpacing);

      // Determine note color
      let noteColor;
      const isHollow = note.duration >= 2;
      const isWhole = note.duration >= 4;

      if (isReviewActive) {
        noteColor = '#f43f5e'; // Vibrant Rose for active mistake review
      } else if (isTarget) {
        noteColor = '#38bdf8'; // Electric Sky for target
      } else if (isPast) {
        if (hadMistakes) {
          noteColor = '#f43f5e'; // Rose if mistake was made
        } else if (res && res.timing && Math.abs(res.timing.offsetMs) > 100) {
          noteColor = '#f59e0b'; // Amber for loose timing
        } else {
          noteColor = '#22c55e'; // Clean Green
        }
      } else {
        noteColor = isDark ? '#e2e8f0' : '#1e293b'; // Slate readable
      }

      // Review Active Beacon Pulse
      if (isReviewActive) {
        const pulse = 0.5 + 0.5 * Math.sin(timestamp / 130);
        ctx.save();
        ctx.beginPath();
        ctx.arc(noteX, noteY, (lineSpacing * 1.1) + pulse * 6, 0, Math.PI * 2);
        ctx.fillStyle = '#f43f5e';
        ctx.globalAlpha = 0.22 + pulse * 0.18;
        ctx.fill();
        ctx.lineWidth = 2.0;
        ctx.strokeStyle = '#fb7185';
        ctx.stroke();
        ctx.restore();
      }

      // Target note pulse halo & caret
      if (isTarget) {
        const isFlashingRed = this.flashMistakeTimestamp && (timestamp - this.flashMistakeTimestamp < 420);
        const glowColor = isFlashingRed ? '#ef4444' : '#38bdf8';

        const pulse = 0.5 + 0.5 * Math.sin(timestamp / 140);
        ctx.save();
        ctx.beginPath();
        ctx.arc(noteX, noteY, (lineSpacing * 0.95) + pulse * 5, 0, Math.PI * 2);
        ctx.fillStyle = glowColor;
        ctx.globalAlpha = 0.22 + pulse * 0.18;
        ctx.fill();
        ctx.globalAlpha = 1.0;

        // Downward target caret
        const caretY = trebleTopY - lineSpacing * 1.2;
        ctx.fillStyle = glowColor;
        ctx.beginPath();
        ctx.moveTo(noteX, caretY + 7);
        ctx.lineTo(noteX - 5, caretY);
        ctx.lineTo(noteX + 5, caretY);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // Draw Note Stem
      if (!isWhole) {
        const stemDir = staffPos >= 4 ? 'down' : 'up';
        const rx = lineSpacing * 0.62;
        const stemLen = lineSpacing * 3.4;
        const stemX = stemDir === 'up' ? (noteX + rx * 0.88) : (noteX - rx * 0.88);
        const stemEndY = stemDir === 'up' ? (noteY - stemLen) : (noteY + stemLen);

        ctx.save();
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = noteColor;
        ctx.beginPath();
        ctx.moveTo(stemX, noteY);
        ctx.lineTo(stemX, stemEndY);
        ctx.stroke();

        // Eighth Note Flag (duration <= 0.55) & 16th Note Double Flag (duration <= 0.28) - VST3 Parity
        if (note.duration <= 0.55) {
          ctx.fillStyle = noteColor;
          ctx.beginPath();
          if (stemDir === 'up') {
            ctx.moveTo(stemX, stemEndY);
            ctx.bezierCurveTo(
              stemX + lineSpacing * 1.1, stemEndY + lineSpacing * 0.8,
              stemX + lineSpacing * 0.9, stemEndY + lineSpacing * 2.0,
              stemX, stemEndY + lineSpacing * 2.2
            );
            ctx.lineTo(stemX, stemEndY + lineSpacing * 1.7);
            ctx.bezierCurveTo(
              stemX + lineSpacing * 0.6, stemEndY + lineSpacing * 1.4,
              stemX + lineSpacing * 0.7, stemEndY + lineSpacing * 0.7,
              stemX, stemEndY + lineSpacing * 0.5
            );
            ctx.closePath();
            ctx.fill();

            if (note.duration <= 0.28) {
              const f2Y = stemEndY + lineSpacing * 0.75;
              ctx.beginPath();
              ctx.moveTo(stemX, f2Y);
              ctx.bezierCurveTo(
                stemX + lineSpacing * 1.1, f2Y + lineSpacing * 0.8,
                stemX + lineSpacing * 0.9, f2Y + lineSpacing * 2.0,
                stemX, f2Y + lineSpacing * 2.2
              );
              ctx.lineTo(stemX, f2Y + lineSpacing * 1.7);
              ctx.bezierCurveTo(
                stemX + lineSpacing * 0.6, f2Y + lineSpacing * 1.4,
                stemX + lineSpacing * 0.7, f2Y + lineSpacing * 0.7,
                stemX, f2Y + lineSpacing * 0.5
              );
              ctx.closePath();
              ctx.fill();
            }
          } else {
            ctx.moveTo(stemX, stemEndY);
            ctx.bezierCurveTo(
              stemX + lineSpacing * 1.1, stemEndY - lineSpacing * 0.8,
              stemX + lineSpacing * 0.9, stemEndY - lineSpacing * 2.0,
              stemX, stemEndY - lineSpacing * 2.2
            );
            ctx.lineTo(stemX, stemEndY - lineSpacing * 1.7);
            ctx.bezierCurveTo(
              stemX + lineSpacing * 0.6, stemEndY - lineSpacing * 1.4,
              stemX + lineSpacing * 0.7, stemEndY - lineSpacing * 0.7,
              stemX, stemEndY - lineSpacing * 0.5
            );
            ctx.closePath();
            ctx.fill();

            if (note.duration <= 0.28) {
              const f2Y = stemEndY - lineSpacing * 0.75;
              ctx.beginPath();
              ctx.moveTo(stemX, f2Y);
              ctx.bezierCurveTo(
                stemX + lineSpacing * 1.1, f2Y - lineSpacing * 0.8,
                stemX + lineSpacing * 0.9, f2Y - lineSpacing * 2.0,
                stemX, f2Y - lineSpacing * 2.2
              );
              ctx.lineTo(stemX, f2Y - lineSpacing * 1.7);
              ctx.bezierCurveTo(
                stemX + lineSpacing * 0.6, f2Y - lineSpacing * 1.4,
                stemX + lineSpacing * 0.7, f2Y - lineSpacing * 0.7,
                stemX, f2Y - lineSpacing * 0.5
              );
              ctx.closePath();
              ctx.fill();
            }
          }
        }
        ctx.restore();
      }

      // Draw Notehead
      ctx.save();
      const rx = lineSpacing * 0.62;
      const ry = lineSpacing * 0.44;
      const rot = -0.32;

      ctx.beginPath();
      ctx.ellipse(noteX, noteY, rx, ry, rot, 0, Math.PI * 2);

      if (isHollow) {
        ctx.lineWidth = 2.4;
        ctx.strokeStyle = noteColor;
        ctx.fillStyle = isDark ? '#0b1120' : '#fcfbf9';
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillStyle = noteColor;
        ctx.fill();
      }

      // Subtle 3D shine
      if (!isHollow) {
        ctx.beginPath();
        ctx.ellipse(noteX - rx * 0.2, noteY - ry * 0.2, rx * 0.5, ry * 0.3, rot, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.fill();
      }
      ctx.restore();

      // Augmentation Dot (for 1.5, 0.75, 3.0 durations, etc. - VST3 Parity)
      const isDotted = Math.abs(note.duration - 1.5) < 0.05 ||
                       Math.abs(note.duration - 3.0) < 0.05 ||
                       Math.abs(note.duration - 0.75) < 0.05;
      if (isDotted) {
        ctx.save();
        const dotRadius = lineSpacing * 0.20;
        const dotX = noteX + rx * 1.55;
        // If note is centered on a staff line (staffPos % 2 === 0), place dot in space above
        const onLine = (staffPos % 2 === 0);
        const dotY = onLine ? (noteY - lineSpacing * 0.42) : noteY;

        ctx.fillStyle = noteColor;
        ctx.beginPath();
        ctx.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Accidental
      if (info.accidental) {
        this.drawAccidental(ctx, { x: noteX, y: noteY, midi: note.midi, info, active: isTarget || isReviewActive, clef }, lineSpacing, 1.0);
      }

      // Pitch Name Label Lane
      if (this.options.showNoteNames) {
        ctx.save();
        const pillW = isReviewActive ? 42 : 34;
        const pillH = 18;
        const pillX = noteX - pillW / 2;
        const pillY = labelBaselineY;

        if (isReviewActive) {
          ctx.fillStyle = '#f43f5e'; // Rose 500
          if (ctx.roundRect) {
            ctx.beginPath();
            ctx.roundRect(pillX, pillY, pillW, pillH, 4);
            ctx.fill();
          } else {
            ctx.fillRect(pillX, pillY, pillW, pillH);
          }
          ctx.font = '800 11px "Inter", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#0f172a'; // Deep slate contrast
          ctx.fillText(info.fullName, noteX, pillY + pillH / 2);
        } else if (isTarget) {
          ctx.fillStyle = '#38bdf8';
          if (ctx.roundRect) {
            ctx.beginPath();
            ctx.roundRect(pillX, pillY, pillW, pillH, 4);
            ctx.fill();
          } else {
            ctx.fillRect(pillX, pillY, pillW, pillH);
          }
          ctx.font = '800 11px "Inter", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#0f172a';
          ctx.fillText(info.fullName, noteX, pillY + pillH / 2);
        } else {
          ctx.fillStyle = isDark ? '#0f172a' : '#f1f5f9';
          ctx.strokeStyle = isPast ? (hadMistakes ? 'rgba(244, 63, 94, 0.5)' : 'rgba(34, 197, 94, 0.5)') : (isDark ? '#334155' : '#cbd5e1');
          ctx.lineWidth = 1;
          if (ctx.roundRect) {
            ctx.beginPath();
            ctx.roundRect(pillX, pillY, pillW, pillH, 4);
            ctx.fill();
            ctx.stroke();
          } else {
            ctx.fillRect(pillX, pillY, pillW, pillH);
            ctx.strokeRect(pillX, pillY, pillW, pillH);
          }
          ctx.font = '600 10px "Inter", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = isPast ? (hadMistakes ? '#f87171' : '#4ade80') : (isDark ? '#94a3b8' : '#475569');
          ctx.fillText(info.fullName, noteX, pillY + pillH / 2);
        }
        ctx.restore();
      }

      // 7. Floating Mistake Callout Card & Flags
      if (hadMistakes) {
        if (isReviewActive) {
          // Comprehensive Floating Callout Card above staff
          ctx.save();
          const calloutY = trebleTopY - lineSpacing * 1.8;
          let calloutText = `Played ${wrongName} (Expected ${info.fullName})`;
          if (res.mistakes > 1) {
            calloutText += ` [${res.mistakes} tries]`;
          }
          if (res.timing && res.timing.offsetMs !== null) {
            const ro = res.timing.offsetMs;
            calloutText += ` | ${ro >= 0 ? '+' : ''}${ro}ms`;
          }

          ctx.font = '700 11px "Inter", sans-serif';
          const textW = ctx.measureText(calloutText).width;
          const iconSize = 13;
          const padX = 8;
          const cardW = padX * 2 + iconSize + 6 + textW;
          const cardH = 22;
          const cardX = noteX - cardW / 2;

          // Card Background & Glowing Rose Border
          ctx.fillStyle = '#0f172a'; // Deep slate
          ctx.strokeStyle = '#f43f5e'; // Rose 500
          ctx.lineWidth = 1.5;
          if (ctx.roundRect) {
            ctx.beginPath();
            ctx.roundRect(cardX, calloutY - cardH, cardW, cardH, 5);
            ctx.fill();
            ctx.stroke();
          } else {
            ctx.fillRect(cardX, calloutY - cardH, cardW, cardH);
            ctx.strokeRect(cardX, calloutY - cardH, cardW, cardH);
          }

          // Downward pointer arrow towards notehead
          ctx.fillStyle = '#f43f5e';
          ctx.beginPath();
          ctx.moveTo(noteX - 5, calloutY);
          ctx.lineTo(noteX + 5, calloutY);
          ctx.lineTo(noteX, calloutY + 6);
          ctx.closePath();
          ctx.fill();

          // Red badge circle with white X
          const iconX = cardX + padX;
          const iconY = calloutY - cardH + (cardH - iconSize) / 2;
          ctx.beginPath();
          ctx.arc(iconX + iconSize / 2, iconY + iconSize / 2, iconSize / 2, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.4;
          const ins = 3.2;
          ctx.beginPath();
          ctx.moveTo(iconX + ins, iconY + ins);
          ctx.lineTo(iconX + iconSize - ins, iconY + iconSize - ins);
          ctx.moveTo(iconX + iconSize - ins, iconY + ins);
          ctx.lineTo(iconX + ins, iconY + iconSize - ins);
          ctx.stroke();

          // Callout Text
          ctx.fillStyle = '#fecdd3'; // Rose 200
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(calloutText, iconX + iconSize + 6, calloutY - cardH / 2);
          ctx.restore();
        } else if (isFinished) {
          // Compact mistake flag on other mistaken notes across the piece
          ctx.save();
          const flagY = trebleTopY - lineSpacing * 1.3;
          const flagText = wrongName;
          ctx.font = '700 9.5px "Inter", sans-serif';
          const textW = ctx.measureText(flagText).width;
          const iconSize = 10;
          const padX = 5;
          const flagW = padX * 2 + iconSize + 4 + textW;
          const flagH = 16;
          const flagX = noteX - flagW / 2;

          ctx.fillStyle = '#0f172a';
          ctx.strokeStyle = 'rgba(244, 63, 94, 0.7)';
          ctx.lineWidth = 1;
          if (ctx.roundRect) {
            ctx.beginPath();
            ctx.roundRect(flagX, flagY - flagH, flagW, flagH, 4);
            ctx.fill();
            ctx.stroke();
          } else {
            ctx.fillRect(flagX, flagY - flagH, flagW, flagH);
          }

          // Mini red circle with X
          const iconX = flagX + padX;
          const iconY = flagY - flagH + (flagH - iconSize) / 2;
          ctx.fillStyle = '#f43f5e';
          ctx.beginPath();
          ctx.arc(iconX + iconSize / 2, iconY + iconSize / 2, iconSize / 2, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.2;
          const ins = 2.4;
          ctx.beginPath();
          ctx.moveTo(iconX + ins, iconY + ins);
          ctx.lineTo(iconX + iconSize - ins, iconY + iconSize - ins);
          ctx.moveTo(iconX + iconSize - ins, iconY + ins);
          ctx.lineTo(iconX + ins, iconY + iconSize - ins);
          ctx.stroke();

          ctx.fillStyle = '#fb7185';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(flagText, iconX + iconSize + 4, flagY - flagH / 2);
          ctx.restore();
        }
      }

      // 8. Per-Note Timing Accuracy Badge (Milliseconds Offset)
      if (isPast && !hadMistakes && res && res.timing && res.timing.offsetMs !== undefined) {
        ctx.save();
        const ro = res.timing.offsetMs;
        const offStr = (ro >= 0 ? '+' : '') + ro + 'ms';
        const badgeY = trebleTopY - lineSpacing * 1.1;

        ctx.font = '700 9px "Inter", sans-serif';
        const textW = ctx.measureText(offStr).width;
        const badgeW = textW + 8;
        const badgeH = 13;
        const badgeX = noteX - badgeW / 2;

        const absOff = Math.abs(ro);
        let bgCol, borderCol, textCol;
        if (absOff <= 65) {
          bgCol = 'rgba(34, 197, 94, 0.2)';
          borderCol = 'rgba(34, 197, 94, 0.7)';
          textCol = '#86efac';
        } else if (absOff <= 150) {
          bgCol = 'rgba(245, 158, 11, 0.22)';
          borderCol = 'rgba(245, 158, 11, 0.8)';
          textCol = '#fde047';
        } else {
          bgCol = 'rgba(244, 63, 94, 0.22)';
          borderCol = 'rgba(244, 63, 94, 0.8)';
          textCol = '#fecdd3';
        }

        ctx.fillStyle = '#0f172a';
        ctx.fillRect(badgeX, badgeY - badgeH, badgeW, badgeH);
        ctx.fillStyle = bgCol;
        ctx.strokeStyle = borderCol;
        ctx.lineWidth = 1;
        if (ctx.roundRect) {
          ctx.beginPath();
          ctx.roundRect(badgeX, badgeY - badgeH, badgeW, badgeH, 3);
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillRect(badgeX, badgeY - badgeH, badgeW, badgeH);
          ctx.strokeRect(badgeX, badgeY - badgeH, badgeW, badgeH);
        }

        ctx.fillStyle = textCol;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(offStr, noteX, badgeY - badgeH / 2);
        ctx.restore();
      }
    });

    // 8.5 Render The Vanishing Bar (Working Memory Buffer Drill)
    if (this.options.disrupterMode === 'vanishing_bar' && !isFinished && !this.practiceData.isCountingIn && !this.practiceData.isAnalyzing && barlineXPositions.length > 0) {
      const activeMeasure = Math.floor(Math.max(0, playheadBeats) / beatsPerMeasure);
      const totalMeasures = barlineXPositions.length;

      for (let m = 0; m <= activeMeasure && m < totalMeasures; m++) {
        const mStartRaw = (m === 0) ? (notesStartX - 4) : barlineXPositions[m - 1];
        const mEndRaw = barlineXPositions[m];
        const mStartX = mStartRaw - scrollX;
        const mEndX = mEndRaw - scrollX;
        const mW = mEndX - mStartX;

        if (mEndX < notesStartX - 20 || mStartX > staffRightX + 20) continue;

        ctx.save();
        const maskY = trebleTopY - 14;
        const maskH = (bassBottomY - trebleTopY) + 28;
        const isActiveBar = (m === activeMeasure);

        if (isActiveBar) {
          ctx.fillStyle = isDark ? 'rgba(15, 23, 42, 0.92)' : 'rgba(241, 245, 249, 0.93)';
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 1.6;
          ctx.setLineDash([5, 3]);
        } else {
          ctx.fillStyle = isDark ? 'rgba(15, 23, 42, 0.82)' : 'rgba(241, 245, 249, 0.82)';
          ctx.strokeStyle = isDark ? 'rgba(51, 65, 85, 0.55)' : 'rgba(203, 213, 225, 0.55)';
          ctx.lineWidth = 1.0;
        }

        if (ctx.roundRect) {
          ctx.beginPath();
          ctx.roundRect(mStartX, maskY, mW, maskH, 6);
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillRect(mStartX, maskY, mW, maskH);
          ctx.strokeRect(mStartX, maskY, mW, maskH);
        }
        ctx.setLineDash([]);

        if (isActiveBar && mW > 60) {
          const badgeW = Math.min(mW - 12, 180);
          const badgeH = 20;
          const badgeX = mStartX + (mW - badgeW) / 2;
          const badgeY = trebleTopY - 26;

          ctx.fillStyle = '#0f172a';
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 1.2;
          if (ctx.roundRect) {
            ctx.beginPath();
            ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
            ctx.fill();
            ctx.stroke();
          } else {
            ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
            ctx.strokeRect(badgeX, badgeY, badgeW, badgeH);
          }

          ctx.font = '800 9px "Inter", sans-serif';
          ctx.fillStyle = '#fbbf24';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`🧠 BUFFER BAR ${m + 1} (PLAY FROM MEMORY)`, badgeX + badgeW / 2, badgeY + badgeH / 2);
        }

        ctx.restore();
      }
    }

    // 8.6 Render The Advance Curtain (No-Lingering Shutter)
    if (this.options.disrupterMode === 'advance_curtain' && !isFinished && !this.practiceData.isCountingIn && !this.practiceData.isAnalyzing) {
      const curtainX = playheadXRaw - scrollX;
      if (curtainX > notesStartX) {
        ctx.save();
        const maskY = trebleTopY - 14;
        const maskH = (bassBottomY - trebleTopY) + 28;
        const curtainLeft = notesStartX - 6;
        const curtainWidth = Math.max(0, curtainX - curtainLeft);

        const curtainGrad = ctx.createLinearGradient(curtainLeft, 0, curtainX, 0);
        curtainGrad.addColorStop(0, isDark ? 'rgba(2, 6, 23, 0.96)' : 'rgba(248, 250, 252, 0.96)');
        curtainGrad.addColorStop(0.85, isDark ? 'rgba(15, 23, 42, 0.93)' : 'rgba(241, 245, 249, 0.93)');
        curtainGrad.addColorStop(1.0, isDark ? 'rgba(30, 41, 59, 0.90)' : 'rgba(226, 232, 240, 0.90)');

        ctx.fillStyle = curtainGrad;
        ctx.fillRect(curtainLeft, maskY, curtainWidth, maskH);

        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(curtainX, maskY);
        ctx.lineTo(curtainX, maskY + maskH);
        ctx.stroke();

        const badgeW = 76;
        const badgeH = 18;
        const badgeX = curtainX - badgeW;
        const badgeY = trebleTopY - 24;

        if (badgeX > curtainLeft) {
          ctx.fillStyle = '#0f172a';
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 1.0;
          if (ctx.roundRect) {
            ctx.beginPath();
            ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
            ctx.fill();
            ctx.stroke();
          } else {
            ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
            ctx.strokeRect(badgeX, badgeY, badgeW, badgeH);
          }
          ctx.font = '800 8.5px "Inter", sans-serif';
          ctx.fillStyle = '#fbbf24';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('⛔ NO LINGER', badgeX + badgeW / 2, badgeY + badgeH / 2);
        }

        ctx.restore();
      }
    }

    // 9. Render Decoupled Eye Cursor (Look-Ahead Pacing Guide: 1 Measure Ahead)
    if (this.options.decoupledEyeCursor && !isFinished && !this.practiceData.isCountingIn && !this.practiceData.isAnalyzing) {
      const eyeBeats = playheadBeats + beatsPerMeasure;
      const eyeXRaw = getXForBeat(eyeBeats);
      const eyeX = eyeXRaw - scrollX;

      if (eyeX >= notesStartX - 10 && eyeX <= staffRightX + 10) {
        ctx.save();
        const eyeColor = '#38bdf8'; // Electric Sky 400

        // Wide aura beam
        ctx.beginPath();
        ctx.rect(eyeX - 10, trebleTopY - 14, 20, (bassBottomY - trebleTopY) + 28);
        const grad = ctx.createLinearGradient(eyeX - 10, 0, eyeX + 10, 0);
        grad.addColorStop(0, 'rgba(56, 189, 248, 0)');
        grad.addColorStop(0.5, 'rgba(56, 189, 248, 0.32)');
        grad.addColorStop(1, 'rgba(56, 189, 248, 0)');
        ctx.fillStyle = grad;
        ctx.fill();

        // Eye Cursor dashed vertical guideline
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = eyeColor;
        ctx.setLineDash([5, 3]);
        ctx.beginPath();
        ctx.moveTo(eyeX, trebleTopY - 10);
        ctx.lineTo(eyeX, bassBottomY + 10);
        ctx.stroke();
        ctx.setLineDash([]);

        // Top pointer cap (downward triangle)
        const capY = trebleTopY - 12;
        ctx.fillStyle = eyeColor;
        ctx.beginPath();
        ctx.moveTo(eyeX, capY + 8);
        ctx.lineTo(eyeX - 6, capY);
        ctx.lineTo(eyeX + 6, capY);
        ctx.closePath();
        ctx.fill();

        // Bottom pointer cap (upward triangle)
        const bCapY = bassBottomY + 12;
        ctx.beginPath();
        ctx.moveTo(eyeX, bCapY - 8);
        ctx.lineTo(eyeX - 5, bCapY);
        ctx.lineTo(eyeX + 5, bCapY);
        ctx.closePath();
        ctx.fill();

        // Top Eye Banner Badge
        const eyeBadgeW = 86;
        const eyeBadgeH = 20;
        const eyeBadgeX = eyeX - eyeBadgeW / 2;
        const eyeBadgeY = trebleTopY - 32;

        ctx.fillStyle = '#0f172a';
        ctx.strokeStyle = eyeColor;
        ctx.lineWidth = 1.2;
        if (ctx.roundRect) {
          ctx.beginPath();
          ctx.roundRect(eyeBadgeX, eyeBadgeY, eyeBadgeW, eyeBadgeH, 4);
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillRect(eyeBadgeX, eyeBadgeY, eyeBadgeW, eyeBadgeH);
          ctx.strokeRect(eyeBadgeX, eyeBadgeY, eyeBadgeW, eyeBadgeH);
        }
        ctx.font = '800 10px "Inter", sans-serif';
        ctx.fillStyle = '#7dd3fc';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('👁 LOOK HERE', eyeX, eyeBadgeY + eyeBadgeH / 2);

        ctx.restore();
      }
    }

    // 10. Render Audio Playhead Cursor (Time-Driven Modes: In-Tempo, Strict & First-Read)
    if (isTimeDriven && !isFinished && !this.practiceData.isCountingIn && !this.practiceData.isAnalyzing) {
      const playheadX = playheadXRaw - scrollX;
      if (playheadX >= notesStartX - 10 && playheadX <= staffRightX + 10) {
        ctx.save();

        const isRecoveryActive = this.flashRecoveryTimestamp && (timestamp - this.flashRecoveryTimestamp < 700);
        const isDimmed = this.options.decoupledEyeCursor; // Dim audio playhead if eye cursor is guiding user
        const cursorColor = isRecoveryActive ? '#10b981' : '#38bdf8';

        if (isDimmed) {
          ctx.globalAlpha = 0.38;
        }

        // Wide aura glow beam
        ctx.beginPath();
        ctx.rect(playheadX - 8, trebleTopY - 14, 16, (bassBottomY - trebleTopY) + 28);
        const grad = ctx.createLinearGradient(playheadX - 8, 0, playheadX + 8, 0);
        grad.addColorStop(0, 'rgba(56, 189, 248, 0)');
        grad.addColorStop(0.5, isRecoveryActive ? 'rgba(16, 185, 129, 0.40)' : (isDimmed ? 'rgba(56, 189, 248, 0.15)' : 'rgba(56, 189, 248, 0.28)'));
        grad.addColorStop(1, 'rgba(56, 189, 248, 0)');
        ctx.fillStyle = grad;
        ctx.fill();

        // Sharp playhead line
        ctx.lineWidth = isDimmed ? 1.4 : 2.4;
        ctx.strokeStyle = cursorColor;
        ctx.beginPath();
        ctx.moveTo(playheadX, trebleTopY - 10);
        ctx.lineTo(playheadX, bassBottomY + 10);
        ctx.stroke();

        // Top pointer cap (downward triangle)
        const capY = trebleTopY - 12;
        ctx.fillStyle = cursorColor;
        ctx.beginPath();
        ctx.moveTo(playheadX, capY + 8);
        ctx.lineTo(playheadX - (isDimmed ? 4 : 6), capY);
        ctx.lineTo(playheadX + (isDimmed ? 4 : 6), capY);
        ctx.closePath();
        ctx.fill();

        // Bottom pointer cap (upward triangle)
        const bCapY = bassBottomY + 12;
        ctx.beginPath();
        ctx.moveTo(playheadX, bCapY - 8);
        ctx.lineTo(playheadX - (isDimmed ? 3 : 5), bCapY);
        ctx.lineTo(playheadX + (isDimmed ? 3 : 5), bCapY);
        ctx.closePath();
        ctx.fill();

        // Recovery Flash Banner Badge if triggered
        if (isRecoveryActive) {
          const recY = trebleTopY - 26;
          ctx.font = '800 10.5px "Inter", sans-serif';
          ctx.fillStyle = '#10b981';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('⚡ IN-TEMPO RECOVERY!', playheadX, recY);
        }

        ctx.restore();
      }
    }

    ctx.restore(); // end clip
  }

  /**
   * Draw classic musical Time Signature (e.g. 4/4, 3/4, 3/8)
   */
  drawTimeSignature(ctx, x, trebleBottomY, bassBottomY, spacing, sig) {
    const topNum = sig[0] || 4;
    const botNum = sig[1] || 4;
    const isDark = this.options.theme === 'dark';

    ctx.save();
    ctx.font = `800 ${Math.round(spacing * 1.7)}px "Inter", serif`;
    ctx.fillStyle = isDark ? '#e2e8f0' : '#1e293b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Treble Time Sig
    const tTopY = trebleBottomY - spacing * 3.0;
    const tBotY = trebleBottomY - spacing * 1.0;
    ctx.fillText(String(topNum), x, tTopY);
    ctx.fillText(String(botNum), x, tBotY);

    // Bass Time Sig
    const bTopY = bassBottomY - spacing * 3.0;
    const bBotY = bassBottomY - spacing * 1.0;
    ctx.fillText(String(topNum), x, bTopY);
    ctx.fillText(String(botNum), x, bBotY);

    ctx.restore();
  }
}

