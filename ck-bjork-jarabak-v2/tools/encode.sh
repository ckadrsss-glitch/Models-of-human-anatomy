#!/usr/bin/env bash
# Encode rendered frames + final mix into the two deliverables (1080×1920, 30 fps, H.264 High + AAC):
#   MASTER    — maximum quality (CRF 12, preset slow, AAC 320 kbit/s)
#   INSTAGRAM — two-pass, bitrate chosen from the duration so the file stays ≤ 25 MB, AAC 160 kbit/s
# usage: bash tools/encode.sh [framesDir=build/frames] [audio=assets/audio/mix.m4a] [name=CK_BIOMECHANICS_BJORK_JARABAK_V2]
#   English: bash tools/encode.sh build/frames_en assets/audio/mix_en.m4a CK_BIOMECHANICS_BJORK_JARABAK_V2_EN
set -euo pipefail
cd "$(dirname "$0")/.."
FR=${1:-build/frames}; AU=${2:-assets/audio/mix.m4a}; NAME=${3:-CK_BIOMECHANICS_BJORK_JARABAK_V2}; OUT=export; mkdir -p "$OUT" build
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$AU")
VB=$(python3 -c "print(int((24.3*8*1024*1024/float('$DUR') - 160000 - 30000)/1000))")   # kbit/s, ~24.3 MB target incl. container
M="$OUT/${NAME}_MASTER.mp4"; I="$OUT/${NAME}_INSTAGRAM.mp4"
echo "duration $DUR s · Instagram video ${VB}k"
ffmpeg -y -v error -framerate 30 -i "$FR/%05d.jpg" -i "$AU" -map 0:v -map 1:a -c:v libx264 -preset slow -crf 12 -profile:v high \
  -pix_fmt yuv420p -x264-params "aq-mode=3" -c:a aac -b:a 320k -t "$DUR" -movflags +faststart "$M"
ffmpeg -y -v error -framerate 30 -i "$FR/%05d.jpg" -c:v libx264 -preset slow -b:v ${VB}k -profile:v high -pix_fmt yuv420p \
  -x264-params "aq-mode=3" -pass 1 -passlogfile build/x264 -an -f mp4 /dev/null
ffmpeg -y -v error -framerate 30 -i "$FR/%05d.jpg" -i "$AU" -map 0:v -map 1:a -c:v libx264 -preset slow -b:v ${VB}k -maxrate $((VB*18/10))k -bufsize $((VB*36/10))k \
  -profile:v high -pix_fmt yuv420p -x264-params "aq-mode=3" -pass 2 -passlogfile build/x264 -c:a aac -b:a 160k -t "$DUR" -movflags +faststart "$I"
for f in "$M" "$I"; do echo "== $f"; ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate:format=duration,size,bit_rate -of default=nw=1 "$f"; done
