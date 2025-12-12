#!/usr/bin/env python3
"""
PNG 아이콘의 내용물을 크게 키우는 스크립트.
콘텐츠를 크롭하고 리스케일하여 더 큰 비율로 표시합니다.
"""

from PIL import Image
from pathlib import Path


def enlarge_icon_content(input_path: str, output_path: str, target_size=600, content_ratio=0.85):
    """
    아이콘의 내용물을 크게 키웁니다.

    Args:
        input_path: 입력 이미지 경로
        output_path: 출력 이미지 경로
        target_size: 최종 이미지 크기 (정사각형)
        content_ratio: 콘텐츠가 차지할 비율 (0.0 ~ 1.0)
    """
    # 이미지 로드
    img = Image.open(input_path).convert('RGBA')
    width, height = img.size
    pixels = img.load()

    # 투명하지 않은 영역 찾기 (콘텐츠 영역)
    min_x, min_y = width, height
    max_x, max_y = 0, 0

    for y in range(height):
        for x in range(width):
            if pixels[x, y][3] > 0:
                min_x = min(min_x, x)
                max_x = max(max_x, x)
                min_y = min(min_y, y)
                max_y = max(max_y, y)

    content_width = max_x - min_x + 1
    content_height = max_y - min_y + 1

    print(f"  원본 크기: {width}x{height}")
    print(f"  콘텐츠 영역: ({min_x}, {min_y}) - ({max_x}, {max_y})")
    print(f"  콘텐츠 크기: {content_width}x{content_height}")
    print(f"  콘텐츠 비율: {content_width / width * 100:.1f}% x {content_height / height * 100:.1f}%")

    # 콘텐츠만 크롭
    cropped = img.crop((min_x, min_y, max_x + 1, max_y + 1))

    # 목표 콘텐츠 크기 계산 (정사각형 캔버스에서 content_ratio만큼 차지)
    target_content_size = int(target_size * content_ratio)

    # 가로/세로 중 큰 쪽에 맞춰 리스케일
    scale_factor = target_content_size / max(content_width, content_height)
    new_width = int(content_width * scale_factor)
    new_height = int(content_height * scale_factor)

    # 고품질 리스케일 (LANCZOS)
    resized = cropped.resize((new_width, new_height), Image.Resampling.LANCZOS)

    print(f"  리스케일: {content_width}x{content_height} → {new_width}x{new_height}")
    print(f"  확대 비율: {scale_factor:.2f}x")

    # 새 캔버스 생성 (투명 배경)
    new_canvas = Image.new('RGBA', (target_size, target_size), (0, 0, 0, 0))

    # 중앙에 배치
    paste_x = (target_size - new_width) // 2
    paste_y = (target_size - new_height) // 2
    new_canvas.paste(resized, (paste_x, paste_y), resized)

    print(f"  배치 위치: ({paste_x}, {paste_y})")
    print(f"  최종 콘텐츠 비율: {new_width / target_size * 100:.1f}% x {new_height / target_size * 100:.1f}%")

    # 저장
    new_canvas.save(output_path, 'PNG')
    print(f"  ✅ 저장 완료: {output_path}")


def main():
    """메인 함수"""
    input_path = 'public/poop_sunglass_600x600.png'
    output_path = 'public/poop_sunglass_600x600.png'

    print("🎨 아이콘 내용물 확대 중...\n")

    if not Path(input_path).exists():
        print(f"❌ 파일을 찾을 수 없습니다: {input_path}")
        return

    # 콘텐츠가 전체의 85%를 차지하도록 설정
    enlarge_icon_content(input_path, output_path, target_size=600, content_ratio=0.85)

    print("\n✅ 아이콘 확대 완료!")


if __name__ == '__main__':
    main()
