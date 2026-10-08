"""녹음 샘플의 중앙 음높이를 비교한다. 사용법: analyze_voice_pitch.py <MP3 ...>"""
import sys, subprocess, numpy as np
def f0(path, sr=16000):
    raw = subprocess.run(["ffmpeg","-v","error","-i",path,"-ac","1","-ar",str(sr),"-f","s16le","-"],capture_output=True).stdout
    x = np.frombuffer(raw, np.int16).astype(float)/32768
    fr, hop = 1024, 256; out=[]
    for i in range(0, len(x)-fr, hop):
        w = x[i:i+fr]
        if np.sqrt((w**2).mean()) < 0.02: continue
        w = w - w.mean(); ac = np.correlate(w, w, "full")[fr-1:]
        lo, hi = sr//300, sr//60
        k = lo + np.argmax(ac[lo:hi])
        if ac[k] > 0.4*ac[0]: out.append(sr/k)
    return np.median(out)

def main():
    for p in sys.argv[1:]:
        print(p.split("/")[-1], round(f0(p)), "Hz")


if __name__ == "__main__":
    main()
