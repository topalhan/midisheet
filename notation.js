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
      ...options
    };

    // Active held notes: Map of midiNote -> { midi, velocity, startTime, releasedTime, active }
    this.activeNotes = new Map();
    // History of played notes for scrolling timeline mode
    this.noteHistory = []; // { midi, velocity, startTime, endTime, active }

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

    // Limit history memory
    if (this.noteHistory.length > 500) {
      this.noteHistory.shift();
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
  }

  clearNotes() {
    this.activeNotes.clear();
    this.fadingNotes.clear();
  }

  startRenderLoop() {
    const loop = (timestamp) => {
      this.render(timestamp);
      this.animationFrameId = requestAnimationFrame(loop);
    };
    this.animationFrameId = requestAnimationFrame(loop);
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
  renderLiveMode(ctx, staffX, staffWidth, trebleBottomY, bassBottomY, lineSpacing, timestamp) {
    const preferFlats = this.options.preferFlats;

    // Only render currently active, held notes for zero-latency Note Off response
    if (this.activeNotes.size === 0) {
      // Draw empty measure note rest placeholder or subtle hint
      this.drawIdleStaffGuide(ctx, staffX, staffWidth, trebleBottomY, bassBottomY, lineSpacing);
      return;
    }

    // Sort notes by pitch ascending
    const sorted = Array.from(this.activeNotes.values()).sort((a, b) => a.midi - b.midi);

    // Group notes by staff (treble vs bass)
    const trebleNotes = [];
    const bassNotes = [];

    sorted.forEach(noteData => {
      const info = MusicTheory.getNoteInfo(noteData.midi, preferFlats);
      const clef = noteData.midi >= this.options.splitPoint ? 'treble' : 'bass';
      const staffPos = MusicTheory.getStaffPosition(info.diatonicStep, clef);

      const item = {
        ...noteData,
        info,
        clef,
        staffPos
      };

      if (clef === 'treble') {
        trebleNotes.push(item);
      } else {
        bassNotes.push(item);
      }
    });

    const noteCenterX = staffX + staffWidth * 0.52;

    // Render Treble notes
    this.renderStaffChord(ctx, trebleNotes, noteCenterX, trebleBottomY, 'treble', lineSpacing, timestamp);

    // Render Bass notes
    this.renderStaffChord(ctx, bassNotes, noteCenterX, bassBottomY, 'bass', lineSpacing, timestamp);
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
   * Draw elliptical notehead with velocity glow and animation
   */
  drawNotehead(ctx, note, spacing, alpha, timestamp) {
    ctx.save();
    ctx.globalAlpha = alpha;

    const rx = spacing * 0.62;
    const ry = spacing * 0.44;
    const rot = -0.32; // ~-18 degrees

    // Velocity-based glow
    if (note.active) {
      const velNorm = note.velocity / 127;
      const glowColor = note.clef === 'treble' ? this.options.activeGlowColor : this.options.bassActiveColor;

      // Outer radial pulse on note strike
      const elapsed = timestamp - note.startTime;
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
      ctx.shadowBlur = 14 + 10 * velNorm;
    }

    // Main notehead body
    ctx.beginPath();
    ctx.ellipse(note.x, note.y, rx, ry, rot, 0, Math.PI * 2);

    if (note.active) {
      ctx.fillStyle = note.clef === 'treble' ? '#38bdf8' : '#c084fc';
    } else {
      ctx.fillStyle = this.options.theme === 'dark' ? '#f8fafc' : '#0f172a';
    }
    ctx.fill();

    // Subtle inner 3D highlight
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.ellipse(note.x - rx * 0.2, note.y - ry * 0.2, rx * 0.55, ry * 0.35, rot, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.fill();

    ctx.restore();
  }

  /**
   * Draw musical accidental (# or b)
   */
  drawAccidental(ctx, note, spacing, alpha) {
    if (!note.info.accidental) return;

    ctx.save();
    ctx.globalAlpha = alpha;
    const accX = note.x - spacing * 1.5;
    const accY = note.y;

    ctx.fillStyle = note.active ? (note.clef === 'treble' ? '#38bdf8' : '#c084fc') : (this.options.theme === 'dark' ? '#f8fafc' : '#0f172a');
    ctx.strokeStyle = ctx.fillStyle;

    if (note.info.accidental === '#') {
      // Crisp vector Sharp symbol
      ctx.lineWidth = 1.3;
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
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(accX - w * 0.6, accY - spacing * 0.2 + 2);
      ctx.lineTo(accX + w * 0.6, accY - spacing * 0.2 - 2);
      ctx.moveTo(accX - w * 0.6, accY + spacing * 0.2 + 2);
      ctx.lineTo(accX + w * 0.6, accY + spacing * 0.2 - 2);
      ctx.stroke();
    } else if (note.info.accidental === 'b') {
      // Crisp vector Flat symbol
      ctx.lineWidth = 1.6;
      const h = spacing * 1.1;
      const w = spacing * 0.5;

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(accX - w * 0.3, accY - h * 0.6);
      ctx.lineTo(accX - w * 0.3, accY + h * 0.35);
      ctx.stroke();

      // Curved loop
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(accX - w * 0.3, accY + h * 0.35);
      ctx.bezierCurveTo(accX + w * 0.9, accY + h * 0.2, accX + w * 0.7, accY - h * 0.2, accX - w * 0.3, accY - h * 0.05);
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

    // Draw Scrolling notes
    for (let i = this.noteHistory.length - 1; i >= 0; i--) {
      const item = this.noteHistory[i];
      const timeSinceStart = (timestamp - item.startTime) / 1000;
      const durationSec = item.active ? (timestamp - item.startTime) / 1000 : (item.endTime - item.startTime) / 1000;

      // X coordinate: note moves left as time advances
      // Right edge of note bar is at: playheadX + (item.startTime - now) * speed
      // When active, right edge sits exactly on playheadX!
      const startX = playheadX + (item.active ? 0 : (item.endTime - timestamp) / 1000 * speed);
      const noteWidth = Math.max(lineSpacing * 1.2, durationSec * speed);
      const x = startX - (item.active ? 0 : 0);

      // Stop if scrolled off screen to left
      if (startX + noteWidth < staffX) {
        continue;
      }

      const info = MusicTheory.getNoteInfo(item.midi, preferFlats);
      const clef = item.midi >= this.options.splitPoint ? 'treble' : 'bass';
      const staffPos = MusicTheory.getStaffPosition(info.diatonicStep, clef);
      const bottomY = clef === 'treble' ? trebleBottomY : bassBottomY;
      const y = bottomY - staffPos * (lineSpacing / 2);

      // Draw horizontal note bar (duration ribbon)
      const barX = playheadX - timeSinceStart * speed;
      const barW = Math.max(16, durationSec * speed);

      // Draw ledger lines if needed
      this.drawLedgerLines(ctx, barX + barW, staffPos, bottomY, lineSpacing);

      // Draw ribbon
      ctx.beginPath();
      const radius = 5;
      const rx = barX;
      const rw = barW;
      const ry = y - lineSpacing * 0.35;
      const rh = lineSpacing * 0.7;

      ctx.fillStyle = clef === 'treble' ? 'rgba(56, 189, 248, 0.85)' : 'rgba(192, 132, 252, 0.85)';
      if (item.active) {
        ctx.shadowColor = clef === 'treble' ? '#38bdf8' : '#a855f7';
        ctx.shadowBlur = 10;
      } else {
        ctx.shadowBlur = 0;
      }

      if (ctx.roundRect) {
        ctx.roundRect(rx, ry, rw, rh, radius);
      } else {
        ctx.rect(rx, ry, rw, rh);
      }
      ctx.fill();
      ctx.shadowBlur = 0;

      // Note label
      ctx.font = '600 10px "Inter", sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      if (rw > 28) {
        ctx.fillText(info.fullName, rx + 6, y);
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
    }

    if (melodyChanged) {
      this.activeReviewMistakeIndex = -1;
      this.manualScrollOffset = 0;
    }

    if (becameFinished) {
      this.manualScrollOffset = 0;
      const mistakes = this.getMistakeNoteIndices();
      if (mistakes.length > 0) {
        this.activeReviewMistakeIndex = mistakes[0];
        this.notifyReviewNoteChanged();
      }
    }
  }

  triggerMistakeFlash() {
    this.flashMistakeTimestamp = performance.now();
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
        this.drawAccidental(ctx, { x: noteX, y: noteY, info, active: true, clef }, lineSpacing, 1.0);
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

    if (totalMelodyWidth > availableWidth) {
      if (isFinished && this.activeReviewMistakeIndex >= 0 && this.activeReviewMistakeIndex < totalNotes) {
        const mistakeX = noteXPositions[this.activeReviewMistakeIndex];
        const focusX = notesStartX + availableWidth * 0.38;
        scrollX = Math.max(0, mistakeX - focusX);
      } else {
        const activeX = (currentIdx >= 0 && currentIdx < totalNotes) ? noteXPositions[currentIdx] : notesStartX;
        const focusX = notesStartX + availableWidth * 0.28;
        scrollX = Math.max(0, activeX - focusX);
      }
      const maxScroll = Math.max(0, totalMelodyWidth - availableWidth + 40);
      scrollX = Math.min(scrollX, maxScroll);
    }

    // Apply manual drag / wheel offset
    const maxScrollLimit = Math.max(0, totalMelodyWidth - availableWidth + 40);
    scrollX = Math.max(0, Math.min(maxScrollLimit, scrollX + this.manualScrollOffset));

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
        this.drawAccidental(ctx, { x: noteX, y: noteY, info, active: isTarget || isReviewActive, clef }, lineSpacing, 1.0);
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

