#!/usr/bin/env bash
# Encode rendered frames + audio into the final Instagram Reels MP4 (≤ 25 MB).
# usage: bash tools/encode.sh [framesDir=build/frames] [out=export/CK_BIOMECHANICS_occlusion_breathing.mp4]
set -euo pipefail
FR=${1:-build/frames}; OUT=${2:-export/CK_BIOMECHANICS_occlusion_breathing.mp4}
mkdir -p "$(dirname "$OUT")" build
DUR=69; AUDIO_KBPS=128; MAX_MB=24.5
VKBPS=$(python3 -c "print(int(($MAX_MB*8*1024*1024/$DUR - $AUDIO_KBPS*1000)/1000*0.97))")
echo "video bitrate: ${VKBPS}k"
COMMON=(-framerate 30 -i "$FR/%05d.jpg" -c:v libx264 -preset slow -profile:v high -pix_fmt yuv420p -b:v ${VKBPS}k -maxrate $((VKBPS*2))k -bufsize $((VKBPS*4))k -g 60 -x264-params "aq-mode=3" -vf "scale=1080:1920:flags=lanczos")
ffmpeg -y -v error "${COMMON[@]}" -pass 1 -passlogfile build/x264 -an -f mp4 /dev/null
ffmpeg -y -v error "${COMMON[@]}" -i build/audio.m4a -pass 2 -passlogfile build/x264 -c:a copy -map 0:v -map 1:a -shortest -movflags +faststart "$OUT"
ls -l "$OUT"; ffprobe -v error -show_entries format=duration,size,bit_rate -of default=nw=1 "$OUT"
