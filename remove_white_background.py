#!/usr/bin/env python3
"""
흰색/밝은 회색 배경을 투명하게 처리하는 스크립트.
이미지 내부의 중요한 흰색 부분은 보존합니다.
"""

from PIL import Image
from pathlib import Path

def get_background_colors(img, sample_size=50):
    """
    이미지 네 모서리를 샘플링하여 배경색을 감지합니다.

    Returns:
        set: 배경색 RGB 튜플들의 집합
    """
    width, height = img.size
    pixels = img.load()

    background_colors = set()

    # 네 모서리에서 샘플링
    corners = [
        (0, 0, sample_size, sample_size),  # 좌상단
        (width - sample_size, 0, width, sample_size),  # 우상단
        (0, height - sample_size, sample_size, height),  # 좌하단
        (width - sample_size, height - sample_size, width, height),  # 우하단
    ]

    for x1, y1, x2, y2 in corners:
        for x in range(x1, x2):
            for y in range(y1, y2):
                if 0 <= x < width and 0 <= y < height:
                    r, g, b = pixels[x, y][:3]
                    background_colors.add((r, g, b))

    return background_colors


def is_similar_color(pixel, target_colors, tolerance=15):
    """
    픽셀이 목표 색상들 중 하나와 유사한지 확인합니다.

    Args:
        pixel: (R, G, B) 튜플
        target_colors: 목표 색상들의 집합
        tolerance: 허용 오차

    Returns:
        bool: 유사한 색상이면 True
    """
    r, g, b = pixel[:3]

    for tr, tg, tb in target_colors:
        if (abs(r - tr) <= tolerance and
            abs(g - tg) <= tolerance and
            abs(b - tb) <= tolerance):
            return True

    return False


def remove_white_background(image_path: str, output_path: str):
    """
    흰색/밝은 회색 배경을 투명하게 만듭니다.

    Args:
        image_path: 입력 이미지 경로
        output_path: 출력 이미지 경로
    """
    # 이미지 로드
    img = Image.open(image_path).convert('RGBA')
    width, height = img.size
    pixels = img.load()

    print(f"  🔍 배경색 감지 중...")
    # 모서리에서 배경색 샘플링
    background_colors = get_background_colors(img)
    print(f"    감지된 배경색: {len(background_colors)}개")

    # 배경으로 마킹할 픽셀 좌표 저장
    background_pixels = set()
    visited = set()

    def flood_fill(start_x, start_y):
        """
        특정 좌표에서 시작하여 연결된 배경 영역을 찾습니다.
        """
        stack = [(start_x, start_y)]

        while stack:
            x, y = stack.pop()

            # 범위 체크
            if x < 0 or x >= width or y < 0 or y >= height:
                continue

            # 이미 방문했으면 스킵
            if (x, y) in visited:
                continue

            pixel = pixels[x, y]

            # 배경색과 유사하지 않으면 스킵
            if not is_similar_color(pixel, background_colors):
                continue

            # 방문 표시 및 배경으로 마킹
            visited.add((x, y))
            background_pixels.add((x, y))

            # 상하좌우 인접 픽셀 추가
            stack.extend([
                (x - 1, y), (x + 1, y),
                (x, y - 1), (x, y + 1)
            ])

    # 이미지 가장자리 전체를 스캔하여 배경 찾기
    print(f"  🔍 배경 영역 탐색 중...")

    # 위쪽 가장자리
    for x in range(width):
        if (x, 0) not in visited and is_similar_color(pixels[x, 0], background_colors):
            flood_fill(x, 0)

    # 아래쪽 가장자리
    for x in range(width):
        if (x, height - 1) not in visited and is_similar_color(pixels[x, height - 1], background_colors):
            flood_fill(x, height - 1)

    # 왼쪽 가장자리
    for y in range(height):
        if (0, y) not in visited and is_similar_color(pixels[0, y], background_colors):
            flood_fill(0, y)

    # 오른쪽 가장자리
    for y in range(height):
        if (width - 1, y) not in visited and is_similar_color(pixels[width - 1, y], background_colors):
            flood_fill(width - 1, y)

    # 배경으로 마킹된 부분을 투명하게 만들기
    print(f"  ✨ 배경을 투명하게 처리 중...")
    for x, y in background_pixels:
        r, g, b, a = pixels[x, y]
        pixels[x, y] = (r, g, b, 0)  # 알파값을 0으로 설정

    # 저장
    img.save(output_path, 'PNG')
    total_pixels = width * height
    background_count = len(background_pixels)
    percentage = (background_count / total_pixels) * 100

    print(f"  ✓ 처리 완료: {output_path}")
    print(f"    배경으로 처리된 픽셀: {background_count:,} / {total_pixels:,} ({percentage:.1f}%)")


def main():
    """메인 함수 - poop_sunglass 파일들 처리"""
    assets_dir = Path('public')

    # 처리할 파일 목록
    target_files = ['poop_sunglass_600x600.png']

    images_to_process = []
    for filename in target_files:
        file_path = assets_dir / filename
        if file_path.exists():
            images_to_process.append(file_path)
        else:
            print(f"⚠️  파일을 찾을 수 없습니다: {filename}")

    if not images_to_process:
        print("❌ 처리할 이미지를 찾을 수 없습니다.")
        return

    print(f"📂 {len(images_to_process)}개의 이미지를 찾았습니다.\n")

    for image_path in images_to_process:
        print(f"🎨 처리 중: {image_path.name}")
        # 원본 파일을 직접 덮어쓰기
        remove_white_background(str(image_path), str(image_path))
        print()

    print("✅ 모든 이미지 처리 완료!")


if __name__ == '__main__':
    main()
