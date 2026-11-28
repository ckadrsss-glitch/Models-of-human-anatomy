#!/usr/bin/env bash
# Encode rendered frames + final mix into the two deliverables (1080×1920, 30 fps, H.264 High + AAC):
#   MASTER    — maximum quality (CRF 12, preset slow, AAC 320 kbit/s)
#   INSTAGRAM — two-pass 2.25 Mbit/s video + AAC 160 kbit/s → ≤ 25 MB for 80 s
# usage: bash tools/encode.sh [framesDir=build/frames] [audio=assets/audio/mix.m4a]
set -euo pipefail
cd "$(dirname "$0")/.."
FR=${1:-build/frames}; AU=${2:-assets/audio/mix.m4a}; OUT=export; mkdir -p "$OUT" build
M="$OUT/CK_BIOMECHANICS_BJORK_JARABAK_V2_MASTER.mp4"; I="$OUT/CK_BIOMECHANICS_BJORK_JARABAK_V2_INSTAGRAM.mp4"
ffmpeg -y -v error -framerate 30 -i "$FR/%05d.jpg" -i "$AU" -map 0:v -map 1:a -c:v libx264 -preset slow -crf 12 -profile:v high \
  -pix_fmt yuv420p -x264-params "aq-mode=3" -c:a aac -b:a 320k -t 80 -movflags +faststart "$M"
ffmpeg -y -v error -framerate 30 -i "$FR/%05d.jpg" -c:v libx264 -preset slow -b:v 2250k -profile:v high -pix_fmt yuv420p \
  -x264-params "aq-mode=3" -pass 1 -passlogfile build/x264 -an -f mp4 /dev/null
ffmpeg -y -v error -framerate 30 -i "$FR/%05d.jpg" -i "$AU" -map 0:v -map 1:a -c:v libx264 -preset slow -b:v 2250k -maxrate 4000k -bufsize 8000k \
  -profile:v high -pix_fmt yuv420p -x264-params "aq-mode=3" -pass 2 -passlogfile build/x264 -c:a aac -b:a 160k -t 80 -movflags +faststart "$I"
for f in "$M" "$I"; do echo "== $f"; ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate:format=duration,size,bit_rate -of default=nw=1 "$f"; done
