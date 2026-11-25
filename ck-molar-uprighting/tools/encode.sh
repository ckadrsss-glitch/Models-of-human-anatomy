#!/usr/bin/env bash
# Encode rendered frames + final mix into the Instagram Reels MP4: 1080×1920, 30 fps, H.264 High + AAC, ≤ 25 MB.
# usage: bash tools/encode.sh [framesDir=build/frames] [out=export/CK_BIOMECHANICS_Molar_Uprighting_FINAL.mp4] [audio=assets/audio/mix.m4a]
# double-cantilever edit: T=63.3 VB=2800k bash tools/encode.sh build/frames_dc export/CK_BIOMECHANICS_Molar_Uprighting_Double_Cantilever_FINAL.mp4 assets/audio/mix_dc.m4a
set -euo pipefail
cd "$(dirname "$0")/.."
FR=${1:-build/frames}; OUT=${2:-export/CK_BIOMECHANICS_Molar_Uprighting_FINAL.mp4}; AU=${3:-assets/audio/mix.m4a}
VB=${VB:-2950k}     # two-pass video bitrate: 2.95 Mbit/s + 160 kbit/s audio ≈ 23.4 MB for 60 s
mkdir -p "$(dirname "$OUT")" build
ffmpeg -y -v error -framerate 30 -i "$FR/%05d.jpg" -c:v libx264 -preset slow -b:v $VB -profile:v high -level 4.1 -pix_fmt yuv420p \
  -x264-params "aq-mode=3" -pass 1 -passlogfile build/x264 -an -f mp4 /dev/null
ffmpeg -y -v error -framerate 30 -i "$FR/%05d.jpg" -i "$AU" -map 0:v -map 1:a -c:v libx264 -preset slow -b:v $VB -maxrate 4800k -bufsize 9600k \
  -profile:v high -level 4.1 -pix_fmt yuv420p -x264-params "aq-mode=3" -pass 2 -passlogfile build/x264 \
  -c:a aac -b:a 160k -ar 48000 -t ${T:-60} -r 30 -movflags +faststart "$OUT"
ffprobe -v error -show_entries stream=codec_name,profile,width,height,r_frame_rate,pix_fmt:format=duration,size,bit_rate -of default=nw=1 "$OUT"
SZ=$(stat -c %s "$OUT"); echo "size: $SZ bytes"; [ "$SZ" -le 25000000 ] || { echo "⚠ larger than 25 MB"; exit 1; }
