#!/usr/bin/env bash
# Encode rendered frames + final mix into the 1080×1920 30 fps MP4 (H.264 High + AAC) for Instagram Reels.
# usage: bash tools/encode.sh [framesDir=build/frames] [out=export/CK_BIOMECHANICS_Space_Creation_Anterior_Retraction.mp4] [audio=assets/audio/mix.m4a]
set -euo pipefail
cd "$(dirname "$0")/.."
FR=${1:-build/frames}; OUT=${2:-export/CK_BIOMECHANICS_Space_Creation_Anterior_Retraction.mp4}; AU=${3:-assets/audio/mix.m4a}
mkdir -p "$(dirname "$OUT")" build
# two-pass 4.2 Mbit/s video + 160 kbit/s audio ≈ 30 MB for 55 s (Reels re-encodes anyway; keep detail)
ffmpeg -y -v error -framerate 30 -i "$FR/%05d.jpg" -c:v libx264 -preset slow -b:v 4200k -profile:v high -pix_fmt yuv420p \
  -x264-params "aq-mode=3" -pass 1 -passlogfile build/x264 -an -f mp4 /dev/null
ffmpeg -y -v error -framerate 30 -i "$FR/%05d.jpg" -i "$AU" -map 0:v -map 1:a -c:v libx264 -preset slow -b:v 4200k -maxrate 6500k -bufsize 13000k \
  -profile:v high -pix_fmt yuv420p -x264-params "aq-mode=3" -pass 2 -passlogfile build/x264 \
  -c:a aac -b:a 160k -t 55 -movflags +faststart "$OUT"
ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate:format=duration,size -of default=nw=1 "$OUT"
