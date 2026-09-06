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

    this.initCanvas();
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

    // Layout dimensions
    const lineSpacing = this.options.lineSpacing;
    const staffHeight = lineSpacing * 4;
    const staffGap = lineSpacing * 4.5; // Gap between treble bottom line & bass top line
    const totalGrandStaffHeight = staffHeight * 2 + staffGap;

    const startY = Math.max(25, (h - totalGrandStaffHeight) / 2);
    const trebleTopY = startY;
    const trebleBottomY = trebleTopY + staffHeight;
    const bassTopY = trebleBottomY + staffGap;
    const bassBottomY = bassTopY + staffHeight;

    const marginX = 70;
    const staffWidth = w - marginX * 2;

    // Draw Grand Staff infrastructure
    this.drawGrandStaffLines(ctx, marginX, staffWidth, trebleTopY, bassTopY, lineSpacing, staffLineColor, staffBarColor);
    this.drawClefs(ctx, marginX + 16, trebleTopY, bassTopY, lineSpacing, clefColor);

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
    this.practiceData = data;
    if (data) {
      this.options.mode = 'practice';
    }
  }

  triggerMistakeFlash() {
    this.flashMistakeTimestamp = performance.now();
  }

  /**
   * Render Interactive Melody Practice Sheet Music Mode
   */
  renderPracticeMode(ctx, staffX, staffWidth, trebleBottomY, bassBottomY, lineSpacing, timestamp) {
    if (!this.practiceData || !this.practiceData.melody) {
      this.drawIdleStaffGuide(ctx, staffX, staffWidth, trebleBottomY, bassBottomY, lineSpacing);
      return;
    }

    const melody = this.practiceData.melody;
    const currentIdx = this.practiceData.noteIndex;
    const results = this.practiceData.noteResults || [];
    const preferFlats = this.options.preferFlats;
    const isDark = this.options.theme === 'dark';

    // 1. Draw Time Signature after Clefs
    const timeSigX = staffX + 54;
    this.drawTimeSignature(ctx, timeSigX, trebleBottomY, bassBottomY, lineSpacing, melody.timeSignature);

    // 2. Calculate Layout Metrics
    const notesStartX = staffX + 90;
    const availableWidth = staffWidth - 110;
    const totalNotes = melody.notes.length;

    const baseNoteSpacing = Math.max(46, Math.min(76, availableWidth / (totalNotes + 0.5)));
    const totalMelodyWidth = (totalNotes + 1) * baseNoteSpacing;

    // Smooth scroll if melody is wider than available viewport
    let scrollX = 0;
    if (totalMelodyWidth > availableWidth) {
      const activeX = notesStartX + currentIdx * baseNoteSpacing;
      const targetFocusX = notesStartX + availableWidth * 0.4;
      scrollX = Math.max(0, activeX - targetFocusX);
    }

    // Clip rendering area to prevent drawing over clefs or outside staff
    ctx.save();
    ctx.beginPath();
    ctx.rect(staffX + 80, 0, availableWidth + 30, this.height);
    ctx.clip();

    // 3. Draw Measure Barlines
    let currentBeats = 0;
    const beatsPerMeasure = melody.timeSignature[0];

    melody.notes.forEach((note, i) => {
      currentBeats += note.duration;
      if (currentBeats >= beatsPerMeasure && i < totalNotes - 1) {
        currentBeats = currentBeats % beatsPerMeasure;
        const barX = notesStartX + (i + 0.55) * baseNoteSpacing - scrollX;

        ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.28)' : 'rgba(15, 23, 42, 0.35)';
        ctx.lineWidth = 1.2;

        // Draw barline across treble
        ctx.beginPath();
        ctx.moveTo(barX, trebleBottomY - lineSpacing * 4);
        ctx.lineTo(barX, trebleBottomY);
        ctx.stroke();

        // Draw barline across bass
        ctx.beginPath();
        ctx.moveTo(barX, bassBottomY - lineSpacing * 4);
        ctx.lineTo(barX, bassBottomY);
        ctx.stroke();
      }
    });

    // 4. Render Melody Notes
    melody.notes.forEach((note, i) => {
      const noteX = notesStartX + i * baseNoteSpacing - scrollX;

      // Skip notes off-screen
      if (noteX < staffX + 50 || noteX > staffX + staffWidth + 50) return;

      const info = MusicTheory.getNoteInfo(note.midi, preferFlats);
      const clef = note.midi >= this.options.splitPoint ? 'treble' : 'bass';
      const staffPos = MusicTheory.getStaffPosition(info.diatonicStep, clef);
      const bottomY = clef === 'treble' ? trebleBottomY : bassBottomY;
      const noteY = bottomY - staffPos * (lineSpacing / 2);

      const isTarget = i === currentIdx && !this.practiceData.isFinished;
      const isPast = i < currentIdx;
      const result = results[i];

      // Draw Ledger Lines
      this.drawLedgerLines(ctx, noteX, staffPos, bottomY, lineSpacing);

      // Determine colors & styling
      let noteColor;
      let isHollow = note.duration >= 2; // Half/Whole notes are hollow
      let isWhole = note.duration >= 4;

      if (isPast) {
        if (result && result.mistakes === 0) {
          noteColor = '#22c55e'; // Clean Green
        } else {
          noteColor = '#f59e0b'; // Amber
        }
      } else if (isTarget) {
        noteColor = '#38bdf8'; // Electric Sky
      } else {
        noteColor = isDark ? '#94a3b8' : '#475569'; // Upcoming neutral ink
      }

      // Target note glow & cursor
      if (isTarget) {
        const isFlashingRed = this.flashMistakeTimestamp && (timestamp - this.flashMistakeTimestamp < 420);
        const glowColor = isFlashingRed ? '#ef4444' : '#38bdf8';

        // Animated pulsing halo
        const pulse = 0.5 + 0.5 * Math.sin(timestamp / 140);
        ctx.beginPath();
        ctx.arc(noteX, noteY, (lineSpacing * 0.95) + pulse * 5, 0, Math.PI * 2);
        ctx.fillStyle = glowColor;
        ctx.globalAlpha = 0.25 + pulse * 0.2;
        ctx.fill();
        ctx.globalAlpha = 1.0;

        // Target Caret Cursor (pointing down to note)
        const caretY = (clef === 'treble' ? trebleBottomY - lineSpacing * 5.2 : bassBottomY - lineSpacing * 5.2);
        ctx.fillStyle = glowColor;
        ctx.beginPath();
        ctx.moveTo(noteX, caretY + 8);
        ctx.lineTo(noteX - 6, caretY);
        ctx.lineTo(noteX + 6, caretY);
        ctx.closePath();
        ctx.fill();

        // Target Pitch Tag
        ctx.font = '700 11px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(info.fullName, noteX, caretY - 2);
      }

      // Draw Note Stem (unless whole note)
      if (!isWhole) {
        const stemDir = staffPos >= 4 ? 'down' : 'up';
        const rx = lineSpacing * 0.62;
        const stemLen = lineSpacing * 3.4;

        ctx.save();
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = noteColor;
        ctx.beginPath();
        if (stemDir === 'up') {
          ctx.moveTo(noteX + rx * 0.88, noteY);
          ctx.lineTo(noteX + rx * 0.88, noteY - stemLen);
        } else {
          ctx.moveTo(noteX - rx * 0.88, noteY);
          ctx.lineTo(noteX - rx * 0.88, noteY + stemLen);
        }
        ctx.stroke();
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

      // Draw Accidental if present
      if (info.accidental) {
        this.drawAccidental(ctx, { x: noteX, y: noteY, info, active: isTarget, clef }, lineSpacing, 1.0);
      }

      // Pitch Name Label below/above
      if (this.options.showNoteNames) {
        ctx.save();
        ctx.font = `600 ${Math.round(lineSpacing * 0.65)}px "Inter", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = isTarget ? '#38bdf8' : (isPast ? noteColor : (isDark ? '#64748b' : '#94a3b8'));

        const labelY = staffPos >= 4 ? noteY + lineSpacing * 1.5 : noteY - lineSpacing * 1.5;
        ctx.fillText(info.fullName, noteX, labelY);
        ctx.restore();
      }
    });

    ctx.restore(); // end clip

    // 5. Render Ghost Notes of Currently Held Keys
    if (this.activeNotes.size > 0) {
      for (const [midi, noteData] of this.activeNotes.entries()) {
        const info = MusicTheory.getNoteInfo(midi, preferFlats);
        const clef = midi >= this.options.splitPoint ? 'treble' : 'bass';
        const staffPos = MusicTheory.getStaffPosition(info.diatonicStep, clef);
        const bottomY = clef === 'treble' ? trebleBottomY : bassBottomY;
        const y = bottomY - staffPos * (lineSpacing / 2);
        const ghostX = notesStartX + currentIdx * baseNoteSpacing - scrollX;

        ctx.save();
        ctx.fillStyle = 'rgba(56, 189, 248, 0.4)';
        ctx.beginPath();
        ctx.arc(ghostX, y, lineSpacing * 0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  /**
   * Draw classic musical Time Signature (e.g. 4/4, 3/4, 3/8)
   */
  drawTimeSignature(ctx, x, trebleBottomY, bassBottomY, spacing, sig) {
    const topNum = sig[0];
    const botNum = sig[1];
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

