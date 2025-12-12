#!/usr/bin/env python3
"""
PNG 이미지를 SVG 파일로 변환하는 스크립트.
PNG를 base64로 인코딩하여 SVG에 임베드합니다.
"""

import base64
from pathlib import Path


def create_svg_icon(png_path: str, svg_path: str):
    """
    PNG 이미지를 base64로 인코딩하여 SVG 파일로 변환합니다.

    Args:
        png_path: 입력 PNG 이미지 경로
        svg_path: 출력 SVG 파일 경로
    """
    # PNG 파일 읽기
    with open(png_path, 'rb') as f:
        png_data = f.read()

    # base64 인코딩
    base64_data = base64.b64encode(png_data).decode('utf-8')

    # PNG 파일 크기 확인
    from PIL import Image
    img = Image.open(png_path)
    width, height = img.size

    # SVG 파일 생성
    svg_content = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="{width}" height="{height}" viewBox="0 0 {width} {height}">
  <image width="{width}" height="{height}"
         xlink:href="data:image/png;base64,{base64_data}"/>
</svg>'''

    # SVG 파일 저장
    with open(svg_path, 'w', encoding='utf-8') as f:
        f.write(svg_content)

    # 파일 크기 비교
    png_size = Path(png_path).stat().st_size
    svg_size = Path(svg_path).stat().st_size

    print(f"✅ SVG 생성 완료: {svg_path}")
    print(f"   PNG 크기: {png_size / 1024:.1f} KB")
    print(f"   SVG 크기: {svg_size / 1024:.1f} KB")
    print()


def main():
    """메인 함수 - poop_sunglass.png와 poop_sunglass_cp.png를 SVG로 변환"""
    assets_dir = Path('public/assets/poops')

    files_to_convert = [
        ('poop_sunglass.png', 'poop_sunglass.svg'),
        ('poop_sunglass_cp.png', 'poop_sunglass_cp.svg')
    ]

    print("🎨 PNG를 SVG로 변환 중...\n")

    for png_file, svg_file in files_to_convert:
        png_path = assets_dir / png_file
        svg_path = assets_dir / svg_file

        if not png_path.exists():
            print(f"⚠️  파일을 찾을 수 없습니다: {png_file}")
            continue

        print(f"🔄 변환 중: {png_file} → {svg_file}")
        create_svg_icon(str(png_path), str(svg_path))

    print("✅ 모든 변환 완료!")


if __name__ == '__main__':
    main()
