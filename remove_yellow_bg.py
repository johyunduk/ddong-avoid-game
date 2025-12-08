#!/usr/bin/env python3
"""
노란색 배경을 투명하게 처리하는 스크립트.
전체 이미지를 스캔하여 노란색 계열 픽셀을 투명하게 만듭니다.
"""

from PIL import Image
from pathlib import Path

def is_yellow_background(pixel):
    """
    픽셀이 노란색 배경인지 확인합니다.

    Args:
        pixel: (R, G, B, A) 튜플

    Returns:
        bool: 노란색 배경이면 True
    """
    r, g, b = pixel[:3]

    # 순수한 흰색(230+)은 보호
    if r >= 230 and g >= 230 and b >= 230:
        return False

    # 어두운 색상(수염, 눈 등)도 보호
    if r <= 100 and g <= 100 and b <= 100:
        return False

    # 노란색 조건: R과 G가 높고, B가 상대적으로 낮음
    # 매우 넓은 범위로 설정
    if r >= 140 and g >= 130:
        # R과 G가 B보다 큰지 확인 (노란색의 특징)
        if r > b + 5 and g > b + 5:
            return True

    return False

def remove_yellow_background(image_path: str, output_path: str):
    """
    노란색 배경을 투명하게 만듭니다.

    Args:
        image_path: 입력 이미지 경로
        output_path: 출력 이미지 경로
    """
    # 이미지 로드
    img = Image.open(image_path).convert('RGBA')
    width, height = img.size
    pixels = img.load()

    print(f"  🔍 노란색 배경 감지 및 제거 중...")

    transparent_count = 0

    # 전체 이미지를 스캔하여 노란색 픽셀을 투명하게 만들기
    for y in range(height):
        for x in range(width):
            pixel = pixels[x, y]

            # 노란색 배경이면 투명하게 만들기
            if is_yellow_background(pixel):
                r, g, b, a = pixel
                pixels[x, y] = (r, g, b, 0)  # 알파값을 0으로 설정
                transparent_count += 1

    # 저장
    img.save(output_path, 'PNG')
    total_pixels = width * height
    percentage = (transparent_count / total_pixels) * 100

    print(f"  ✓ 처리 완료: {output_path}")
    print(f"    투명하게 처리된 픽셀: {transparent_count:,} / {total_pixels:,} ({percentage:.1f}%)")

def main():
    """메인 함수 - beard.png 처리"""
    assets_dir = Path('public/assets/poops')

    # 처리할 파일 목록
    target_files = ['beard.png']

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
        remove_yellow_background(str(image_path), str(image_path))
        print()

    print("✅ 모든 이미지 처리 완료!")

if __name__ == '__main__':
    main()
