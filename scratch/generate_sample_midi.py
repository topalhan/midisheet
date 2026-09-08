import struct
import os

def write_varint(val):
    res = bytearray()
    res.append(val & 0x7F)
    val >>= 7
    while val > 0:
        res.append((val & 0x7F) | 0x80)
        val >>= 7
    res.reverse()
    return bytes(res)

def create_midi(filename, title, bpm, time_sig, notes):
    division = 480
    
    # Track events
    trk = bytearray()
    
    # Delta 0: Track Name
    name_bytes = title.encode('ascii', 'ignore')
    trk.extend(write_varint(0))
    trk.extend(bytes([0xFF, 0x03, len(name_bytes)]))
    trk.extend(name_bytes)
    
    # Delta 0: Set Tempo (microseconds per quarter)
    us_per_beat = int(round(60000000 / bpm))
    trk.extend(write_varint(0))
    trk.extend(bytes([0xFF, 0x51, 0x03, (us_per_beat >> 16) & 0xFF, (us_per_beat >> 8) & 0xFF, us_per_beat & 0xFF]))
    
    # Delta 0: Time Sig (num, den as power of 2)
    den_pow = 2 if time_sig[1] == 4 else (3 if time_sig[1] == 8 else 2)
    trk.extend(write_varint(0))
    trk.extend(bytes([0xFF, 0x58, 0x04, time_sig[0], den_pow, 0x18, 0x08]))
    
    # Add notes: list of (midi_pitch, duration_beats)
    for pitch, dur_beats in notes:
        dur_ticks = int(round(dur_beats * division))
        # Note on
        trk.extend(write_varint(0))
        trk.extend(bytes([0x90, pitch, 90]))
        # Note off
        trk.extend(write_varint(dur_ticks))
        trk.extend(bytes([0x80, pitch, 0]))
        
    # End of track
    trk.extend(write_varint(0))
    trk.extend(bytes([0xFF, 0x2F, 0x00]))
    
    # Header
    out = bytearray()
    out.extend(b'MThd')
    out.extend(struct.pack('>IHHH', 6, 0, 1, division))
    out.extend(b'MTrk')
    out.extend(struct.pack('>I', len(trk)))
    out.extend(trk)
    
    with open(filename, 'wb') as f:
        f.write(out)
    print(f"Generated {filename} ({len(notes)} notes, {bpm} BPM)")

os.makedirs('sample_midis', exist_ok=True)

# 1. Greensleeves snippet (A Minor, 6/8 -> represented in quarter beats: dotted quarter = 1.5)
# A4(69), C5(72), D5(74), E5(76), F5(77), E5(76), D5(74), B4(71), G4(67), A4(69), B4(71), C5(72), A4(69)
greensleeves = [
    (69, 1.0), (72, 2.0), (74, 1.0), (76, 1.5), (77, 0.5), (76, 1.0),
    (74, 2.0), (71, 1.0), (67, 1.5), (69, 0.5), (71, 1.0), (72, 2.0),
    (69, 1.0), (69, 1.5), (68, 0.5), (69, 1.0), (71, 2.0), (68, 1.0),
    (64, 3.0)
]
create_midi('sample_midis/greensleeves.mid', 'Greensleeves', 116, (3, 4), greensleeves)

# 2. Brahms Lullaby snippet
# E4, E4, G4, E4, E4, G4, E4, G4, C5, B4, A4, A4, G4, D4, E4, F4, D4, E4, F4...
brahms = [
    (64, 0.75), (64, 0.25), (67, 2.0),
    (64, 0.75), (64, 0.25), (67, 2.0),
    (64, 0.5), (67, 0.5), (72, 1.0), (71, 1.0), (69, 1.0), (69, 1.0), (67, 2.0),
    (62, 0.75), (64, 0.25), (65, 2.0),
    (62, 0.75), (64, 0.25), (65, 2.0),
    (62, 0.5), (65, 0.5), (71, 1.0), (69, 1.0), (67, 1.0), (71, 1.0), (72, 2.0)
]
create_midi('sample_midis/brahms_lullaby.mid', "Brahms' Lullaby", 100, (3, 4), brahms)
