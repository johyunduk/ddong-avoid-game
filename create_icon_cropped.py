#!/usr/bin/env python3
"""
PNG 이미지를 크롭하고 SVG로 변환하는 스크립트.
실제 콘텐츠 영역만 남기고 여백을 제거합니다.
"""

import base64
from PIL import Image
from pathlib import Path


def crop_to_content(img, padding=20):
    """
    이미지를 실제 콘텐츠 영역에 맞춰 크롭합니다.

    Args:
        img: PIL Image 객체 (RGBA)
        padding: 크롭 후 추가할 패딩 (픽셀)

    Returns:
        크롭된 PIL Image 객체
    """
    width, height = img.size
    pixels = img.load()

    # 투명하지 않은 영역 찾기
    min_x, min_y = width, height
    max_x, max_y = 0, 0

    for y in range(height):
        for x in range(width):
            if pixels[x, y][3] > 0:  # 알파 채널이 0보다 크면
                min_x = min(min_x, x)
                max_x = max(max_x, x)
                min_y = min(min_y, y)
                max_y = max(max_y, y)

    # 패딩 추가 (이미지 경계를 넘지 않도록)
    min_x = max(0, min_x - padding)
    min_y = max(0, min_y - padding)
    max_x = min(width - 1, max_x + padding)
    max_y = min(height - 1, max_y + padding)

    # 크롭
    cropped = img.crop((min_x, min_y, max_x + 1, max_y + 1))

    print(f"  원본 크기: {width}x{height}")
    print(f"  콘텐츠 영역: ({min_x}, {min_y}) - ({max_x}, {max_y})")
    print(f"  크롭 후 크기: {cropped.size[0]}x{cropped.size[1]}")

    return cropped


def create_svg_from_cropped(png_path: str, svg_path: str, padding=20):
    """
    PNG 이미지를 크롭하고 SVG로 변환합니다.

    Args:
        png_path: 입력 PNG 이미지 경로
        svg_path: 출력 SVG 파일 경로
        padding: 크롭 시 추가할 패딩 (픽셀)
    """
    # PNG 파일 읽기 및 크롭
    img = Image.open(png_path).convert('RGBA')
    cropped_img = crop_to_content(img, padding)

    # 크롭된 이미지를 임시로 저장
    temp_path = png_path.replace('.png', '_temp_cropped.png')
    cropped_img.save(temp_path, 'PNG')

    # base64 인코딩
    with open(temp_path, 'rb') as f:
        png_data = f.read()
    base64_data = base64.b64encode(png_data).decode('utf-8')

    # 임시 파일 삭제
    Path(temp_path).unlink()

    # SVG 생성
    width, height = cropped_img.size
    svg_content = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="{width}" height="{height}" viewBox="0 0 {width} {height}">
  <image width="{width}" height="{height}"
         xlink:href="data:image/png;base64,{base64_data}"/>
</svg>'''

    # SVG 파일 저장
    with open(svg_path, 'w', encoding='utf-8') as f:
        f.write(svg_content)

    svg_size = Path(svg_path).stat().st_size
    print(f"  ✅ SVG 생성 완료: {svg_path}")
    print(f"  SVG 크기: {svg_size / 1024:.1f} KB")


def main():
    """메인 함수"""
    png_path = 'public/assets/poops/poop_sunglass.png'
    svg_path = 'public/poop_sunglass_icon.svg'

    print("🎨 여백 제거 및 SVG 아이콘 생성 중...\n")

    if not Path(png_path).exists():
        print(f"❌ 파일을 찾을 수 없습니다: {png_path}")
        return

    create_svg_from_cropped(png_path, svg_path, padding=30)

    print("\n✅ 아이콘 생성 완료!")


if __name__ == '__main__':
    main()
