#!/bin/bash

# BGM 최적화 스크립트
# 186kbps/48kHz → 96kbps/44.1kHz 변환으로 용량 50% 절감

echo "🎵 Starting BGM optimization..."

# 원본 백업 디렉토리 생성 (이미지와 동일)
BACKUP_DIR="public/assets_backup/bgms"
if [ ! -d "$BACKUP_DIR" ]; then
  echo "📦 Creating backup directory..."
  mkdir -p "$BACKUP_DIR"
  cp public/assets/bgms/*.mp3 "$BACKUP_DIR/"
  echo "✅ Original BGM files backed up to $BACKUP_DIR"
fi

# MP3 파일 압축 (비트레이트 96kbps, 샘플레이트 44.1kHz)
echo "🔄 Compressing MP3 files..."
echo ""

for file in public/assets/bgms/*.mp3; do
  filename=$(basename "$file")
  temp_file="${file%.mp3}_temp.mp3"

  echo "   Processing: $filename"

  # 원본 파일 크기
  original_size=$(du -h "$file" | cut -f1)

  # ffmpeg로 재인코딩 (96kbps, 44.1kHz, 스테레오 유지)
  ffmpeg -i "$file" \
    -codec:a libmp3lame \
    -b:a 96k \
    -ar 44100 \
    -ac 2 \
    "$temp_file" \
    -y -v error -stats

  if [ $? -eq 0 ]; then
    # 압축된 파일 크기
    compressed_size=$(du -h "$temp_file" | cut -f1)

    # 원본 파일 교체
    mv "$temp_file" "$file"

    echo "   ✅ $original_size → $compressed_size"
  else
    echo "   ❌ Failed to compress $filename"
    rm -f "$temp_file"
  fi

  echo ""
done

echo "✨ BGM optimization complete!"
echo "📊 New total size:"
du -sh public/assets/bgms
echo ""
echo "📊 Comparison:"
echo "   Before: $(du -sh public/assets_backup/bgms | cut -f1)"
echo "   After:  $(du -sh public/assets/bgms | cut -f1)"
