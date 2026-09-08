/**
 * Zero-dependency Standard MIDI File (SMF Format 0 & Format 1) Parser
 * Converts binary .MID/.MIDI files into structured Melody objects
 * for real-time Grand Staff notation and practice accuracy scoring.
 * Supports multi-channel inspection and per-channel practice scoring.
 */

import { MusicTheory } from './chords.js';

const KEY_SIGNATURES = {
  '0:0': 'C Major', '1:0': 'G Major', '2:0': 'D Major', '3:0': 'A Major',
  '4:0': 'E Major', '5:0': 'B Major', '6:0': 'F# Major', '7:0': 'C# Major',
  '-1:0': 'F Major', '-2:0': 'Bb Major', '-3:0': 'Eb Major', '-4:0': 'Ab Major',
  '-5:0': 'Db Major', '-6:0': 'Gb Major', '-7:0': 'Cb Major',
  '0:1': 'A Minor', '1:1': 'E Minor', '2:1': 'B Minor', '3:1': 'F# Minor',
  '4:1': 'C# Minor', '5:1': 'G# Minor', '6:1': 'D# Minor', '7:1': 'A# Minor',
  '-1:1': 'D Minor', '-2:1': 'G Minor', '-3:1': 'C Minor', '-4:1': 'F Minor',
  '-5:1': 'Bb Minor', '-6:1': 'Eb Minor', '-7:1': 'Ab Minor'
};

const GM_INSTRUMENTS = [
  // 0-7 Piano
  'Acoustic Grand Piano', 'Bright Acoustic Piano', 'Electric Grand Piano', 'Honky-tonk Piano',
  'Electric Piano 1', 'Electric Piano 2', 'Harpsichord', 'Clavinet',
  // 8-15 Chromatic Percussion
  'Celesta', 'Glockenspiel', 'Music Box', 'Vibraphone', 'Marimba', 'Xylophone', 'Tubular Bells', 'Dulcimer',
  // 16-23 Organ
  'Drawbar Organ', 'Percussive Organ', 'Rock Organ', 'Church Organ', 'Reed Organ', 'Accordion', 'Harmonica', 'Tango Accordion',
  // 24-31 Guitar
  'Acoustic Guitar (nylon)', 'Acoustic Guitar (steel)', 'Electric Guitar (jazz)', 'Electric Guitar (clean)',
  'Electric Guitar (muted)', 'Overdriven Guitar', 'Distortion Guitar', 'Guitar Harmonics',
  // 32-39 Bass
  'Acoustic Bass', 'Electric Bass (finger)', 'Electric Bass (pick)', 'Fretless Bass',
  'Slap Bass 1', 'Slap Bass 2', 'Synth Bass 1', 'Synth Bass 2',
  // 40-47 Strings
  'Violin', 'Viola', 'Cello', 'Contrabass', 'Tremolo Strings', 'Pizzicato Strings', 'Orchestral Harp', 'Timpani',
  // 48-55 Ensemble
  'String Ensemble 1', 'String Ensemble 2', 'Synth Strings 1', 'Synth Strings 2',
  'Choir Aahs', 'Voice Oohs', 'Synth Choir', 'Orchestra Hit',
  // 56-63 Brass
  'Trumpet', 'Trombone', 'Tuba', 'Muted Trumpet', 'French Horn', 'Brass Section', 'Synth Brass 1', 'Synth Brass 2',
  // 64-71 Reed
  'Soprano Sax', 'Alto Sax', 'Tenor Sax', 'Baritone Sax', 'Oboe', 'English Horn', 'Bassoon', 'Clarinet',
  // 72-79 Pipe
  'Piccolo', 'Flute', 'Recorder', 'Pan Flute', 'Blown Bottle', 'Shakuhachi', 'Whistle', 'Ocarina',
  // 80-87 Synth Lead
  'Lead 1 (square)', 'Lead 2 (sawtooth)', 'Lead 3 (calliope)', 'Lead 4 (chiff)',
  'Lead 5 (charang)', 'Lead 6 (voice)', 'Lead 7 (fifths)', 'Lead 8 (bass + lead)',
  // 88-95 Synth Pad
  'Pad 1 (new age)', 'Pad 2 (warm)', 'Pad 3 (polysynth)', 'Pad 4 (choir)',
  'Pad 5 (bowed)', 'Pad 6 (metallic)', 'Pad 7 (halo)', 'Pad 8 (sweep)'
];

class BinaryReader {
  constructor(arrayBuffer) {
    this.view = new DataView(arrayBuffer);
    this.offset = 0;
    this.byteLength = arrayBuffer.byteLength;
  }

  hasMore() {
    return this.offset < this.byteLength;
  }

  readUint8() {
    if (this.offset >= this.byteLength) return 0;
    return this.view.getUint8(this.offset++);
  }

  readUint16() {
    if (this.offset + 2 > this.byteLength) return 0;
    const val = this.view.getUint16(this.offset, false);
    this.offset += 2;
    return val;
  }

  readUint32() {
    if (this.offset + 4 > this.byteLength) return 0;
    const val = this.view.getUint32(this.offset, false);
    this.offset += 4;
    return val;
  }

  readString(length) {
    let str = '';
    for (let i = 0; i < length; i++) {
      str += String.fromCharCode(this.readUint8());
    }
    return str;
  }

  readBytes(length) {
    const bytes = new Uint8Array(this.view.buffer, this.offset, Math.min(length, this.byteLength - this.offset));
    this.offset += length;
    return bytes;
  }

  readVarInt() {
    let result = 0;
    let byte = 0;
    do {
      byte = this.readUint8();
      result = (result << 7) | (byte & 0x7F);
    } while ((byte & 0x80) && this.offset < this.byteLength);
    return result;
  }
}

/**
 * Quantize beat duration to standard musical note values
 */
function quantizeDuration(beats) {
  const standardValues = [0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 4.0, 6.0, 8.0];
  if (beats <= 0.3) return 0.25;

  let closest = standardValues[0];
  let minDiff = Math.abs(beats - closest);

  for (let i = 1; i < standardValues.length; i++) {
    const diff = Math.abs(beats - standardValues[i]);
    if (diff < minDiff) {
      minDiff = diff;
      closest = standardValues[i];
    }
  }

  if (minDiff < 0.2) return closest;
  return Math.max(0.25, Math.round(beats * 4) / 4);
}

/**
 * Estimate difficulty rating from notes
 */
function estimateDifficulty(notes, bpm) {
  if (notes.length < 18 && bpm <= 110) return 'Easy';
  
  let accidentals = 0;
  let wideLeaps = 0;
  for (let i = 0; i < notes.length; i++) {
    const semitone = notes[i].midi % 12;
    if ([1, 3, 6, 8, 10].includes(semitone)) accidentals++;
    if (i > 0 && Math.abs(notes[i].midi - notes[i - 1].midi) >= 7) wideLeaps++;
  }

  if (accidentals >= 5 || wideLeaps >= 4 || notes.length > 55 || bpm >= 135) {
    return 'Advanced';
  }
  if (accidentals >= 2 || notes.length > 25 || bpm >= 115) {
    return 'Medium';
  }
  return 'Easy';
}

/**
 * Low-level SMF parser that decodes all events, metadata, and channel stats.
 */
function readMidiRaw(arrayBuffer) {
  if (!arrayBuffer || arrayBuffer.byteLength < 14) {
    throw new Error('File is too small to be a valid MIDI file.');
  }

  const reader = new BinaryReader(arrayBuffer);

  // 1. Header Chunk
  const headerId = reader.readString(4);
  if (headerId !== 'MThd') {
    throw new Error(`Invalid MIDI header: Expected "MThd", got "${headerId}"`);
  }

  const headerLen = reader.readUint32();
  const format = reader.readUint16();
  const ntracks = reader.readUint16();
  const division = reader.readUint16();

  let ticksPerQuarter = division & 0x7FFF;
  if ((division & 0x8000) !== 0) {
    const framesPerSec = 256 - (division >> 8);
    const ticksPerFrame = division & 0xFF;
    ticksPerQuarter = framesPerSec * ticksPerFrame;
  }
  if (ticksPerQuarter <= 0) ticksPerQuarter = 480;

  if (headerLen > 6) {
    reader.readBytes(headerLen - 6);
  }

  let tempoBpm = 120;
  let timeSignature = [4, 4];
  let detectedKey = 'C Major';
  const trackNames = [];
  const rawTracks = [];

  // Channel statistics tracking (channels 0-15)
  const channelStats = Array.from({ length: 16 }, (_, idx) => ({
    channel: idx,
    channelNumber: idx + 1,
    noteCount: 0,
    trackNames: new Set(),
    program: null,
    minMidi: 127,
    maxMidi: 0,
    isDrum: idx === 9 // Channel 10 is standard GM percussion
  }));

  // 2. Track Chunks
  for (let t = 0; t < ntracks && reader.hasMore(); t++) {
    const trackId = reader.readString(4);
    if (trackId !== 'MTrk') {
      const chunkLen = reader.readUint32();
      reader.readBytes(chunkLen);
      continue;
    }

    const trackLen = reader.readUint32();
    const trackEnd = reader.offset + trackLen;
    const trackEvents = [];

    let currentTick = 0;
    let runningStatus = 0;
    let trackName = '';

    while (reader.offset < trackEnd && reader.hasMore()) {
      const delta = reader.readVarInt();
      currentTick += delta;

      let status = reader.readUint8();

      // Running status check
      if ((status & 0x80) === 0) {
        if (!runningStatus) break;
        reader.offset--;
        status = runningStatus;
      } else {
        runningStatus = status;
      }

      const eventType = status & 0xF0;
      const channel = status & 0x0F;

      if (status === 0xFF) {
        // Meta Event
        runningStatus = 0;
        const metaType = reader.readUint8();
        const metaLen = reader.readVarInt();
        const metaData = reader.readBytes(metaLen);

        if (metaType === 0x03) {
          trackName = String.fromCharCode(...metaData).trim();
        } else if (metaType === 0x51 && metaLen === 3) {
          const microseconds = (metaData[0] << 16) | (metaData[1] << 8) | metaData[2];
          if (microseconds > 0) {
            tempoBpm = Math.max(40, Math.min(240, Math.round(60000000 / microseconds)));
          }
        } else if (metaType === 0x58 && metaLen >= 2) {
          const num = metaData[0] || 4;
          const den = Math.pow(2, metaData[1]) || 4;
          timeSignature = [num, den];
        } else if (metaType === 0x59 && metaLen >= 2) {
          let sf = metaData[0];
          if (sf > 127) sf -= 256;
          const mi = metaData[1] || 0;
          const keyLookup = `${sf}:${mi}`;
          if (KEY_SIGNATURES[keyLookup]) {
            detectedKey = KEY_SIGNATURES[keyLookup];
          }
        } else if (metaType === 0x2F) {
          break;
        }
      } else if (status === 0xF0 || status === 0xF7) {
        runningStatus = 0;
        const sysexLen = reader.readVarInt();
        reader.readBytes(sysexLen);
      } else if (eventType === 0x90 || eventType === 0x80) {
        const midi = reader.readUint8();
        const velocity = reader.readUint8();
        const isNoteOn = eventType === 0x90 && velocity > 0;

        if (isNoteOn) {
          channelStats[channel].noteCount++;
          if (midi < channelStats[channel].minMidi) channelStats[channel].minMidi = midi;
          if (midi > channelStats[channel].maxMidi) channelStats[channel].maxMidi = midi;
          if (trackName) channelStats[channel].trackNames.add(trackName);
        }

        trackEvents.push({
          tick: currentTick,
          type: isNoteOn ? 'noteOn' : 'noteOff',
          midi,
          velocity,
          channel
        });
      } else if (eventType === 0xC0) {
        // Program Change (Instrument patch)
        const prog = reader.readUint8();
        channelStats[channel].program = prog;
        if (trackName) channelStats[channel].trackNames.add(trackName);
      } else if (eventType === 0xD0) {
        // Channel Pressure
        reader.readUint8();
      } else {
        // Control Change, Pitch Bend, Poly Pressure
        reader.readUint8();
        reader.readUint8();
      }
    }

    if (reader.offset < trackEnd) {
      reader.offset = trackEnd;
    }

    if (trackName) trackNames.push(trackName);
    rawTracks.push({
      index: t,
      name: trackName,
      events: trackEvents
    });
  }

  return {
    format,
    ntracks,
    ticksPerQuarter,
    tempoBpm,
    timeSignature,
    detectedKey,
    trackNames,
    rawTracks,
    channelStats
  };
}

/**
 * Inspect available MIDI channels and metadata without full melody transcription.
 * @param {ArrayBuffer} arrayBuffer - Raw bytes of .mid file
 * @param {string} fileName - Original filename
 * @returns {object} { fileName, tempoBpm, timeSignature, detectedKey, channels: [...] }
 */
export function inspectMidiChannels(arrayBuffer, fileName = 'custom_melody.mid') {
  const raw = readMidiRaw(arrayBuffer);

  const activeChannels = raw.channelStats
    .filter(ch => ch.noteCount > 0)
    .map(ch => {
      let instrumentName = ch.isDrum ? 'Drums & Percussion' : 'Instrument';
      if (ch.program !== null && GM_INSTRUMENTS[ch.program]) {
        instrumentName = GM_INSTRUMENTS[ch.program];
      }

      const trackNameStr = Array.from(ch.trackNames).join(', ');
      const minNoteInfo = MusicTheory.getNoteInfo(ch.minMidi, false);
      const maxNoteInfo = MusicTheory.getNoteInfo(ch.maxMidi, false);
      const pitchRange = (minNoteInfo && maxNoteInfo)
        ? `${minNoteInfo.name} – ${maxNoteInfo.name}`
        : `${ch.minMidi} – ${ch.maxMidi}`;

      return {
        channel: ch.channel,             // 0-15
        channelNumber: ch.channelNumber, // 1-16
        noteCount: ch.noteCount,
        trackName: trackNameStr || null,
        instrumentName,
        pitchRange,
        isDrum: ch.isDrum
      };
    });

  return {
    fileName,
    tempoBpm: raw.tempoBpm,
    timeSignature: raw.timeSignature,
    detectedKey: raw.detectedKey,
    channels: activeChannels
  };
}

/**
 * Parse an ArrayBuffer of a Standard MIDI File into a Melody object
 * @param {ArrayBuffer} arrayBuffer - Raw bytes of .mid file
 * @param {string} fileName - Original filename (e.g. "my_song.mid")
 * @param {number|null} targetChannel - Optional 1-based channel number (1-16) to filter, or null for all
 * @returns {object} Parsed melody formatted for MelodyTrainer
 */
export function parseMidiFile(arrayBuffer, fileName = 'custom_melody.mid', targetChannel = null) {
  const raw = readMidiRaw(arrayBuffer);
  const { ticksPerQuarter, tempoBpm, timeSignature, detectedKey, trackNames, rawTracks } = raw;

  let targetEvents = [];
  let channelInfoSuffix = '';

  // Determine if specific channel filtering was requested
  const isSpecificChannel = typeof targetChannel === 'number' && targetChannel >= 1 && targetChannel <= 16;
  const targetChannelZeroBased = isSpecificChannel ? targetChannel - 1 : null;

  if (isSpecificChannel) {
    // Gather all events matching this specific channel across all tracks
    for (const trk of rawTracks) {
      for (const ev of trk.events) {
        if (ev.channel === targetChannelZeroBased) {
          targetEvents.push(ev);
        }
      }
    }
    targetEvents.sort((a, b) => a.tick - b.tick);

    const chStat = raw.channelStats[targetChannelZeroBased];
    const trackNameStr = Array.from(chStat.trackNames)[0] || '';
    channelInfoSuffix = ` (Ch ${targetChannel}${trackNameStr ? ': ' + trackNameStr : ''})`;
  } else {
    // Standard extraction: pick best melody track or merge all
    let bestTrack = null;
    let maxNoteCount = 0;

    for (const trk of rawTracks) {
      const noteOnCount = trk.events.filter(e => e.type === 'noteOn').length;
      const isLeadNamed = /melody|vocal|lead|solo|soprano|theme|right/i.test(trk.name);
      const score = noteOnCount * (isLeadNamed ? 2.5 : 1.0);
      if (score > maxNoteCount) {
        maxNoteCount = score;
        bestTrack = trk;
      }
    }

    if (bestTrack && maxNoteCount > 0) {
      targetEvents = bestTrack.events;
    } else {
      for (const trk of rawTracks) {
        targetEvents.push(...trk.events);
      }
      targetEvents.sort((a, b) => a.tick - b.tick);
    }
  }

  if (targetEvents.length === 0) {
    throw new Error(isSpecificChannel 
      ? `No notes found on Channel ${targetChannel}.` 
      : 'No musical notes found in this MIDI file.');
  }

  // Pair Note-On with Note-Off events to calculate durations
  const activeNotes = new Map(); // key: channel_midi -> { startTick, velocity }
  const noteSpans = [];

  targetEvents.forEach(evt => {
    const key = `${evt.channel}_${evt.midi}`;
    if (evt.type === 'noteOn') {
      if (activeNotes.has(key)) {
        const prev = activeNotes.get(key);
        const durationTicks = Math.max(ticksPerQuarter / 4, evt.tick - prev.startTick);
        noteSpans.push({
          midi: evt.midi,
          startTick: prev.startTick,
          durationTicks,
          velocity: prev.velocity
        });
      }
      activeNotes.set(key, { startTick: evt.tick, velocity: evt.velocity });
    } else if (evt.type === 'noteOff') {
      if (activeNotes.has(key)) {
        const prev = activeNotes.get(key);
        const durationTicks = Math.max(ticksPerQuarter / 4, evt.tick - prev.startTick);
        noteSpans.push({
          midi: evt.midi,
          startTick: prev.startTick,
          durationTicks,
          velocity: prev.velocity
        });
        activeNotes.delete(key);
      }
    }
  });

  // Flush lingering active notes
  activeNotes.forEach((val, key) => {
    const midi = parseInt(key.split('_')[1], 10);
    noteSpans.push({
      midi,
      startTick: val.startTick,
      durationTicks: ticksPerQuarter,
      velocity: val.velocity
    });
  });

  if (noteSpans.length === 0) {
    throw new Error('No playable notes could be extracted from this MIDI file.');
  }

  // Sort notes chronologically
  noteSpans.sort((a, b) => a.startTick - b.startTick || b.midi - a.midi);

  // Extract top note (soprano / melody line) when notes overlap
  const melodyNotes = [];
  const startToleranceTicks = Math.round(ticksPerQuarter / 8);

  for (let i = 0; i < noteSpans.length; i++) {
    const current = noteSpans[i];
    
    if (melodyNotes.length > 0) {
      const prev = melodyNotes[melodyNotes.length - 1];
      if (Math.abs(current.startTick - prev.startTick) <= startToleranceTicks) {
        if (current.midi > prev.midi) {
          melodyNotes[melodyNotes.length - 1] = current;
        }
        continue;
      }
    }

    melodyNotes.push(current);
  }

  // Convert note spans into structured melody notes with beat durations
  const cleanNotes = melodyNotes.map(n => {
    const rawBeats = n.durationTicks / ticksPerQuarter;
    const duration = quantizeDuration(rawBeats);
    const noteInfo = MusicTheory.getNoteInfo(n.midi, false);

    return {
      midi: n.midi,
      duration,
      name: noteInfo ? noteInfo.name : `Note ${n.midi}`
    };
  });

  // Limit to reasonable practice snippet length (80 notes max)
  const finalNotes = cleanNotes.slice(0, 80);

  // Derive song title
  const cleanFileName = fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
  let title = cleanFileName;
  if (!isSpecificChannel) {
    if (rawTracks.length > 0 && rawTracks[0].name && rawTracks[0].name.length > 1) {
      title = rawTracks[0].name;
    } else if (trackNames.length > 0 && trackNames[0].length > 1) {
      title = trackNames[0];
    }
  }

  title = (title.charAt(0).toUpperCase() + title.slice(1)) + channelInfoSuffix;
  const difficulty = estimateDifficulty(finalNotes, tempoBpm);

  return {
    id: 'custom-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
    title,
    composer: 'Custom Import',
    difficulty,
    bpm: tempoBpm,
    timeSignature,
    key: detectedKey,
    description: `Loaded from ${fileName}${channelInfoSuffix} (${finalNotes.length} notes)`,
    notes: finalNotes,
    isCustom: true
  };
}
