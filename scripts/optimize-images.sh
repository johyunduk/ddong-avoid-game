#!/bin/bash

# 이미지 최적화 스크립트
# PNG -> WebP 변환으로 용량 70-90% 절감

echo "🖼️  Starting image optimization..."

# WebP 변환 품질 설정 (80 = 고품질, 낮은 용량)
QUALITY=80

# 원본 백업 디렉토리 생성
BACKUP_DIR="public/assets_backup"
if [ ! -d "$BACKUP_DIR" ]; then
  echo "📦 Creating backup directory..."
  mkdir -p "$BACKUP_DIR"
  cp -r public/assets/* "$BACKUP_DIR/"
  echo "✅ Original files backed up to $BACKUP_DIR"
fi

# PNG 파일 찾아서 WebP로 변환
echo "🔄 Converting PNG to WebP..."
find public/assets -name "*.png" -type f | while read -r file; do
  # 파일명에서 .png 제거하고 .webp 추가
  webp_file="${file%.png}.webp"

  echo "   Converting: $file"
  cwebp -q $QUALITY "$file" -o "$webp_file"

  if [ $? -eq 0 ]; then
    # 원본 파일 크기와 WebP 파일 크기 비교
    original_size=$(du -h "$file" | cut -f1)
    webp_size=$(du -h "$webp_file" | cut -f1)
    echo "   ✅ $original_size -> $webp_size"

    # 원본 PNG 삭제 (백업 있으니 안전)
    rm "$file"
  else
    echo "   ❌ Failed to convert $file"
  fi
done

echo ""
echo "🎵 Compressing MP3 files..."
# MP3는 이미 압축 포맷이므로 스킵 (필요시 ffmpeg로 재인코딩 가능)
echo "   MP3 files are already compressed format (skipping)"

echo ""
echo "✨ Optimization complete!"
echo "📊 New total size:"
du -sh public/assets
