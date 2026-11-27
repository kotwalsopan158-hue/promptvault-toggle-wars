"""Render recorded browser footage with local narration and synchronized captions."""
import json
import math
import subprocess
import textwrap
import wave
from pathlib import Path

film = Path("lab-output/film").resolve()
out = Path("lab-output/movie").resolve()
out.mkdir(exist_ok=True)
story = json.loads(Path("demo/narration.json").read_text())
capture = json.loads((film / "shots.json").read_text())
shots = {item["key"]: item for item in capture["shots"]}
model = film / "en_US-ljspeech-medium.onnx"
voice = None
if model.exists():
    from piper import PiperVoice, SynthesisConfig
    voice = PiperVoice.load(str(model), use_cuda=False)

def run(*args):
    subprocess.run(args, check=True)

def duration(path):
    return float(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=nw=1:nk=1", str(path),
    ], text=True).strip())

def clock(seconds, ass=False):
    precision = 100 if ass else 1000
    total = round(seconds * precision)
    whole, frac = divmod(total, precision)
    minutes, secs = divmod(whole, 60)
    hours, mins = divmod(minutes, 60)
    return (f"{hours}:{mins:02}:{secs:02}.{frac:02}" if ass
            else f"{hours:02}:{mins:02}:{secs:02}.{frac:03}")

ass_header = """[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720
WrapStyle: 0
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,DejaVu Sans,25,&H00FFFFFF,&H00FFFFFF,&H001B1426,&H001B1426,0,0,0,0,100,100,0,0,1,0,0,2,42,42,11,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
clips, vtt = [], ["WEBVTT", ""]
elapsed = 0.0
for entry in story:
    key = entry["key"]
    segments = []
    cues = []
    for i, line in enumerate(entry["lines"]):
        wav = film / f"{key}-{i}.wav"
        spoken = line.replace("PromptVault", "Prompt Vault").replace("Flagsmith", "Flag Smith")
        if voice:
            with wave.open(str(wav), "wb") as handle:
                voice.synthesize_wav(spoken, handle, syn_config=SynthesisConfig(length_scale=1.06))
        else:
            run("espeak-ng", "-v", "en-us", "-s", "149", "-w", str(wav), spoken)
        with wave.open(str(wav), "rb") as audio:
            assert audio.getsampwidth() == 2 and audio.getnchannels() == 1
            sample_rate = audio.getframerate()
            segments.append((line, audio.readframes(audio.getnframes())))
    wav = film / f"{key}.wav"
    with wave.open(str(wav), "wb") as audio:
        audio.setparams((1, 2, sample_rate, 0, "NONE", "not compressed"))
        head = round(0.18 * sample_rate)
        audio.writeframes(bytes(2 * head))
        offset = head / sample_rate
        for line, samples in segments:
            length = len(samples) / (2 * sample_rate)
            cues.append((offset, offset + length, line))
            audio.writeframes(samples)
            gap = round(.22 * sample_rate)
            audio.writeframes(bytes(2 * gap))
            offset += length + gap / sample_rate
        audio.writeframes(bytes(2 * round(.25 * sample_rate)))
    # Round every edit to a whole video frame so the chapter captions stay aligned.
    length = math.ceil(duration(wav) * 25) / 25
    shot = shots[key]
    source = Path(shot["file"])
    original = duration(source)
    offset = max(0, original - shot["seconds"])
    take = min(original - offset, length)
    stretch = min(3.3, length / take)
    ass = film / f"{key}.ass"
    events = []
    for begin, end, line in cues:
        wrapped = r"\N".join(textwrap.wrap(line, width=85))
        events.append(f"Dialogue: 0,{clock(begin, True)},{clock(end, True)},Caption,,0,0,0,,{wrapped}")
        vtt.extend([f"{clock(elapsed+begin)} --> {clock(elapsed+end)}", line, ""])
    ass.write_text(ass_header + "\n".join(events) + "\n", encoding="utf8")
    target = film / f"{key}.mp4"
    vf = (f"setpts={stretch:.8f}*(PTS-STARTPTS),fps=25,scale=1280:640:flags=lanczos,"
          f"pad=1280:720:0:0:color=0x1b1629,tpad=stop_mode=clone:stop_duration={length},"
          f"drawbox=x=0:y=640:w=iw:h=2:color=0x9f86e5:t=fill,ass={ass.name},format=yuv420p")
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", str(offset), "-i", str(source),
           "-i", str(wav), "-vf", vf, "-af", "apad", "-t", f"{length:.3f}", "-r", "25",
           "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-threads", "2",
           "-c:a", "aac", "-ar", "48000", "-b:a", "112k", str(target)]
    subprocess.run(cmd, cwd=film, check=True)
    clips.append("file '" + target.name + "'")
    elapsed += length

playlist = film / "concat.txt"
playlist.write_text("\n".join(clips) + "\n")
movie = out / "PromptVault-demo.mp4"
run("ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0",
    "-i", str(playlist), "-c", "copy", "-movflags", "+faststart", str(movie))
(out / "PromptVault-captions.vtt").write_text("\n".join(vtt), encoding="utf8")
streams = json.loads(subprocess.check_output([
    "ffprobe", "-v", "error", "-show_streams", "-of", "json", str(movie)], text=True))["streams"]
assert any(s["codec_name"] == "h264" and s["width"] == 1280 and s["height"] == 720 for s in streams)
assert any(s["codec_name"] == "aac" for s in streams)
assert 55 < duration(movie) < 180
run("ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(movie), "-f", "null", "-")
run("ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", "0.7", "-i", str(movie),
    "-frames:v", "1", "-q:v", "3", str(out / "PromptVault-poster.jpg"))
print("VIDEO VERIFIED", json.dumps({"seconds": round(duration(movie), 2), "dashboard": capture["dashboardView"],
    "chapters": list(shots), "narration": "Piper LJ Speech" if voice else "eSpeak NG", "bytes": movie.stat().st_size}))
