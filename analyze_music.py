#!/usr/bin/env python3
"""
Music Beat Analyzer for Just Shapes and Kiro
Analyzes an MP3 file and generates a JSON timeline of beat events.

Requirements:
    pip install librosa numpy

Usage:
    python analyze_music.py music.mp3
"""

import sys
import json
import numpy as np

try:
    import librosa
except ImportError:
    print("Error: librosa not installed. Run: pip install librosa numpy")
    sys.exit(1)


def analyze_music(filepath):
    """Analyze music file and extract beat information."""
    print(f"Loading {filepath}...")
    
    # Load the audio file
    y, sr = librosa.load(filepath)
    duration = librosa.get_duration(y=y, sr=sr)
    print(f"Duration: {duration:.2f} seconds")
    print(f"Sample rate: {sr} Hz")
    
    # Get tempo and beat frames
    print("Detecting beats...")
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
    beat_times = librosa.frames_to_time(beat_frames, sr=sr)
    # Handle tempo being an array in newer librosa versions
    if isinstance(tempo, np.ndarray):
        tempo = float(tempo[0]) if len(tempo) > 0 else 120.0
    else:
        tempo = float(tempo)
    print(f"Detected tempo: {tempo:.1f} BPM")
    print(f"Found {len(beat_times)} beats")
    
    # Get onset strength (for intensity)
    print("Analyzing onset strength...")
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    onset_times = librosa.times_like(onset_env, sr=sr)
    
    # Normalize onset strength
    onset_env = onset_env / np.max(onset_env)
    
    # Separate frequency bands for bass, mid, high
    print("Analyzing frequency bands...")
    
    # Compute spectrogram
    S = np.abs(librosa.stft(y))
    freqs = librosa.fft_frequencies(sr=sr)
    
    # Define frequency bands
    bass_mask = freqs < 250  # Bass: 0-250 Hz
    mid_mask = (freqs >= 250) & (freqs < 2000)  # Mid: 250-2000 Hz
    high_mask = freqs >= 2000  # High: 2000+ Hz
    
    # Calculate energy in each band over time
    bass_energy = np.mean(S[bass_mask, :], axis=0)
    mid_energy = np.mean(S[mid_mask, :], axis=0)
    high_energy = np.mean(S[high_mask, :], axis=0)
    
    # Normalize
    bass_energy = bass_energy / np.max(bass_energy) if np.max(bass_energy) > 0 else bass_energy
    mid_energy = mid_energy / np.max(mid_energy) if np.max(mid_energy) > 0 else mid_energy
    high_energy = high_energy / np.max(high_energy) if np.max(high_energy) > 0 else high_energy
    
    spec_times = librosa.frames_to_time(np.arange(S.shape[1]), sr=sr)
    
    # Detect drops (sudden increases in bass energy)
    print("Detecting drops...")
    drops = []
    bass_threshold = np.percentile(bass_energy, 85)  # Top 15% bass moments
    min_drop_gap = 2.0  # Minimum 2 seconds between drops
    last_drop_time = -min_drop_gap
    
    for i in range(1, len(bass_energy)):
        t = spec_times[i]
        # Look for sudden bass increase that exceeds threshold
        if i > 5:
            recent_avg = np.mean(bass_energy[i-5:i])
            current = bass_energy[i]
            # Drop = current bass is high AND significantly higher than recent average
            if current > bass_threshold and current > recent_avg * 1.5 and (t - last_drop_time) > min_drop_gap:
                drops.append(round(float(t), 3))
                last_drop_time = t
    
    print(f"Found {len(drops)} drops")
    
    # Detect BIG DROPS - when bass goes from quiet to sustained loud
    # This detects when a bass line "starts" rather than just momentary hits
    print("Detecting big drops (bass line starts)...")
    big_drops = []
    window_before = 40  # ~2 seconds before
    window_after = 20   # ~1 second after
    min_big_drop_gap = 10.0  # At least 10 seconds between big drops
    last_big_drop_time = -min_big_drop_gap
    
    for i in range(window_before, len(bass_energy) - window_after):
        t = spec_times[i]
        
        # Calculate average bass before and after this point
        bass_before = np.mean(bass_energy[i-window_before:i])
        bass_after = np.mean(bass_energy[i:i+window_after])
        
        # Big drop = bass was quiet before, loud after (sustained change)
        # The ratio should be significant (at least 3x increase)
        if bass_before < 0.15 and bass_after > 0.3 and bass_after > bass_before * 3:
            if (t - last_big_drop_time) > min_big_drop_gap:
                big_drops.append({
                    "time": round(float(t), 3),
                    "percent": round(float(t / duration * 100), 1),
                    "intensity": round(float(bass_after / bass_before), 2) if bass_before > 0 else 10.0
                })
                last_big_drop_time = t
                print(f"  Big drop at {t:.1f}s ({t/duration*100:.1f}%) - bass ratio: {bass_after/bass_before:.1f}x")
    
    print(f"Found {len(big_drops)} big drops")
    
    sample_interval = 0.05  # 50ms = 20 samples per second
    timeline = []
    
    for t in np.arange(0, duration, sample_interval):
        # Find closest indices
        onset_idx = np.argmin(np.abs(onset_times - t))
        spec_idx = np.argmin(np.abs(spec_times - t))
        
        # Check if this is a beat
        is_beat = any(abs(bt - t) < sample_interval / 2 for bt in beat_times)
        
        # Check if this is near a drop (within 100ms)
        is_drop = any(abs(d - t) < 0.1 for d in drops)
        
        entry = {
            "t": round(t, 3),
            "bass": round(float(bass_energy[spec_idx]), 3),
            "mid": round(float(mid_energy[spec_idx]), 3),
            "high": round(float(high_energy[spec_idx]), 3),
            "onset": round(float(onset_env[onset_idx]), 3),
            "beat": is_beat,
            "drop": is_drop
        }
        timeline.append(entry)
    
    # Create output data
    output = {
        "duration": round(duration, 2),
        "tempo": round(float(tempo), 1),
        "beatCount": len(beat_times),
        "beats": [round(float(bt), 3) for bt in beat_times],
        "drops": drops,
        "bigDrops": big_drops,
        "timeline": timeline
    }
    
    return output


def main():
    if len(sys.argv) < 2:
        print("Usage: python analyze_music.py <music_file.mp3>")
        print("Example: python analyze_music.py music.mp3")
        sys.exit(1)
    
    filepath = sys.argv[1]
    
    try:
        data = analyze_music(filepath)
        
        # Save to JSON
        output_file = "music_timeline.json"
        with open(output_file, 'w') as f:
            json.dump(data, f)
        
        print(f"\nSuccess! Timeline saved to {output_file}")
        print(f"  - Duration: {data['duration']}s")
        print(f"  - Tempo: {data['tempo']} BPM")
        print(f"  - Beats: {data['beatCount']}")
        print(f"  - Timeline entries: {len(data['timeline'])}")
        
    except Exception as e:
        print(f"Error analyzing file: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
