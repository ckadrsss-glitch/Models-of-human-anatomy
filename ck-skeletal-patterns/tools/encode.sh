#!/usr/bin/env bash
# Encode rendered frames (+ ambient audio) into the final 1080×1920 30 fps MP4 (H.264 High + AAC).
# usage: bash tools/encode.sh [framesDir=build/frames] [out=export/CK_BIOMECHANICS_9_skeletal_patterns.mp4]
set -euo pipefail
cd "$(dirname "$0")/.."
FR=${1:-build/frames}; OUT=${2:-export/CK_BIOMECHANICS_9_skeletal_patterns.mp4}
mkdir -p "$(dirname "$OUT")"
ffmpeg -y -v error -framerate 30 -i "$FR/%05d.jpg" -i assets/audio/ambient.m4a \
  -map 0:v -map 1:a -c:v libx264 -preset slow -crf 17 -profile:v high -pix_fmt yuv420p \
  -x264-params "aq-mode=3" -c:a aac -b:a 160k -shortest -movflags +faststart "$OUT"
ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate:format=duration,size -of default=nw=1 "$OUT"
