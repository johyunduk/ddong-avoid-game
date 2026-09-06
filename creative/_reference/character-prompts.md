# 캐릭터 프롬프트 레퍼런스

`workflows/comfyui/character.json` ( = ComfyUI 의 `[main]일러스트.json` ) 안에 보관돼 있는
프롬프트 모음. 확정 캐릭터들이 이 관용구로 만들어졌으므로, 새 캐릭터 프롬프트도 같은 어투·
같은 태그 순서를 따른다. 이 파일은 읽기 전용 참고 자료다 (수정은 ComfyUI 쪽에서).

공통 규칙

- 품질 프리픽스는 스크립트가 자동으로 붙인다 → 프롬프트에 다시 쓰지 않는다
- 순서: 성별/구도 → 표정·분위기 → 얼굴 → 머리 → 의상 → 배경·조명
- 강조는 `(tag:1.3)` 형식, 구역 분리는 `BREAK`
- 네거티브는 캐릭터마다 다르다 (여캐면 `1boy, male...` 을 넣는 식)

---

### node 8 — positive — 기본 캐릭터

```
[masterpiece, best quality, amazing quality, 4k, very aesthetic, high resolution, ultra-detailed, absurdres, newest, scenery]
[1boy, solo]
[cute, black hair, short hair, choppy bangs, nebulae cosmic green eyes, rimlit eyes, facing to the side, looking at viewer, downturned eyes, light smile, blue hoodie]
[fingers, arched back]
[from below, dutch angle, portrait, upper body, head tilt, colorful, rim light, backlit, (colorful light particles:1.2), cosmic sky, aurora, chaos, perfect night, fantasy background]
BREAK
[detailed background, blurry foreground, bokeh, depth of field, volumetric lighting]
```

### node 9 — positive — 불꽃소녀

```
[masterpiece, best quality, amazing quality, 4k, very aesthetic, high resolution, ultra-detailed, absurdres, newest, scenery]
1girl, solo, fierce expression, red hair, long hair, 
flowing hair in wind, amber eyes, glowing eyes, 
sharp gaze, looking at viewer,
red and orange battle outfit, fantasy armor, 
upper body, portrait, dynamic angle,
fire particles, ember, flame background, 
(fire magic:1.3), volcanic sky, dramatic lighting, 
intense rim light, cinematic
BREAK
detailed background, heat haze, bokeh, depth of field, 
volumetric lighting, lens flare
```

### node 10 — negative — NEGATIVE

```
modern, recent, old, oldest, cartoon, graphic, text, painting, 
crayon, graphite, abstract, glitch, deformed, mutated, ugly, 
disfigured, long body, lowres, bad anatomy, bad hands, 
missing fingers, extra fingers, cropped, very displeasing, 
(worst quality, bad quality:1.2), sketch, jpeg artifacts, 
signature, watermark, username, (censored:1.2), 
simple background, conjoined, bad ai-generated,
chibi, pixel art, 2d sprite, game sprite, duplicate
```

### node 11 — positive — 매화검수

```
masterpiece, best quality, amazing quality, 4k, very aesthetic, 
high resolution, ultra-detailed, absurdres, newest,
1boy, solo, male focus, masculine, broad shoulders, flat chest,

white hair, ponytail, few strands of hair loose,
pale skin, sharp eyes, cold red eyes, 
emotionless expression, stoic face, looking up at viewer,

burgundy haori, dark wine red outer robe,
deep crimson and dark haori, white inner kimono,
hakama, high collar,
plum blossom pattern on haori,
worn scabbard at hip,

iai stance, drawing sword from scabbard,
mid-draw, blade halfway out,
low crouching stance, body low to ground,
leaning forward, one knee bent,
left hand on scabbard,
breath visible in cold air, frozen breath,

upper body, portrait,
from above, high angle, dutch angle,
diagonal composition, looking up at viewer,

(heavy snowfall:1.3), blizzard, snow particles,
(red plum blossom petals falling in snow:1.4),
red plum blossom tree, crimson plum blossoms,
red flowers on bare branches background,
frozen ground,
(cold blue and white color palette:1.3),
(moonlight rim light:1.2), pale moonlight,
blade reflecting cold light,
mist, deep shadow, high contrast,
winter night, silent, desolate,
japanese aesthetic, cinematic
BREAK
detailed background, bokeh, depth of field,
snow blur foreground, volumetric lighting,
(dark vignette:1.2), cold god rays
```

### node 12 — negative — NEGATIVE

```
modern, recent, old, oldest, cartoon, graphic, text, painting, 
crayon, graphite, abstract, glitch, deformed, mutated, ugly, 
disfigured, long body, lowres, bad anatomy, bad hands, 
missing fingers, extra fingers, cropped, very displeasing, 
(worst quality, bad quality:1.2), sketch, jpeg artifacts, 
signature, watermark, username, (censored:1.2), 
simple background, conjoined, bad ai-generated,
chibi, pixel art, 2d sprite, game sprite, duplicate
```

### node 13 — positive — 해커 1

```
[masterpiece, best quality, amazing quality, 4k, very aesthetic, high resolution, ultra-detailed, absurdres, newest, scenery]
1girl, solo, smirk, bored yet sharp expression,
messy ponytail, black hair with blue highlights,
oversized hoodie, headset around neck, fingerless gloves,
glowing amber eyes reflecting code,
looking at viewer over shoulder, sitting in high-tech gaming chair,
hand on mechanical keyboard, one hand touching chin,
low angle shot, cinematic composition, depth of field,
surrounded by multiple vertical monitors, messy desk with cables,
binary code raining on screens, (dark room:1.2), dim ambient lighting,
intense rim light from cyan and magenta monitors,
BREAK
detailed background, hardware components, server racks in shadow,
bokeh, volumetric lighting, lens flare from screen glare,
subtle smoke, realistic textures
```

### node 14 — positive — 천사 1

```
[masterpiece, best quality, amazing quality, 4k, very aesthetic, high resolution, ultra-detailed, absurdres, newest, scenery]
1girl, solo, emotionless expression, pure white short hair, gravity-defying hair,
holographic eyes with geometric patterns, intricate golden halo,
looking at viewer, symmetrical pose, hovering in air, reaching forward,
non-organic wings, floating crystal shards, interlocking geometric light panels,
opalescent armor, flowing translucent fabric, crystal ornaments,
upper body, portrait, low angle, majestic scale,
BREAK
detailed background, abstract void background, fragmented architecture,
depth of field, prism bokeh, prismatic lens flare,
volumetric light shafts, sparkling dust particles, realistic textures, dramatic lighting
```

### node 15 — positive — 해커 2

```
[masterpiece, best quality, amazing quality, 4k, very aesthetic, high resolution, ultra-detailed, absurdres, newest, scenery]
1girl, solo, smirk, bored yet sharp expression,
messy ponytail, black hair with crimson and gold highlights,
oversized hoodie (deep forest green), headset around neck, fingerless gloves,
glowing emerald eyes reflecting code,
looking at viewer over shoulder, sitting in high-tech gaming chair,
hand on mechanical keyboard, one hand touching chin,
low angle shot, cinematic composition, depth of field,
surrounded by multiple vertical monitors, messy desk with cables,
binary code raining on screens (matrix green), (dark room:1.2), dim ambient lighting,
intense rim light from amber and deep red monitors,
BREAK
detailed background, hardware components, server racks in shadow,
bokeh, volumetric lighting, lens flare from screen glare,
subtle smoke, realistic textures
```

### node 16 — positive — 광부

```
[masterpiece, best quality, amazing quality, 4k, very aesthetic, high resolution, ultra-detailed, absurdres, newest, scenery]
[1boy, solo]
[cute, white hair, curly hair, yellow helmet, head lantern, rimlit eyes, facing to the side, looking at viewer, downturned eyes, light smile, navy jump suit]
[from front, dutch angle, portrait, upper body, head tilt, holding pickaxe, colorful, rim light, backlit, (colorful light particles:1.2), gold mine, fantasy background]
BREAK
[detailed background, blurry foreground, depth of field]
```

### node 17 — positive — 노이즈

```
masterpiece, best quality, amazing quality, 4k, very aesthetic, high resolution, ultra-detailed, absurdres, newest,
1other, solo, androgynous,
short messy hair, multicolored hair, faded colors, hair dissolving at tips,
heterochromia, one glowing eye, one faded eye, hazy eyes, vacant expression, soft frown, looking at viewer,
oversized shirt, mismatched clothes, layered clothing, wrinkled,
arms at sides, slouched posture,
upper body, from front, slight dutch angle,
(static noise effect:1.3), (dissolving pixels:1.2), fragmented silhouette, unstable outline,
muted colors, desaturated, pale color palette,
(soft white rim light:1.1), dim backlight, faded glow,
white void, drifting noise fragments, corrupted static background, empty atmosphere,
quiet, unstable, cinematic lighting
BREAK
detailed background, bokeh, depth of field, volumetric lighting, vignette, soft blur
```

### node 18 — positive — 글리치

```
masterpiece, best quality, amazing quality, 4k, very aesthetic, high resolution, ultra-detailed, absurdres, newest, scenery,
1boy, solo, male focus,
short spiky hair, multicolored hair, neon purple and electric blue hair,
glowing eyes, mismatched eye colors, red and cyan eyes, wide grin, unsettling smile, looking at viewer,
jacket, colorful jacket, asymmetrical outfit, torn edges, layered clothing, fingerless gloves,
arms spread wide, leaning forward, dynamic pose,
upper body, from below, dutch angle,
(chromatic aberration effect:1.3), (body glitching:1.2), color fringing, doubled silhouette edges, rgb split,
neon purple, electric blue, harsh color contrast,
(neon rim light:1.2), backlit, harsh light,
corrupted void background, fragmented neon grid, dissolving pixels, unstable space,
chaotic, unpredictable, cinematic lighting
BREAK
detailed background, bokeh, depth of field, volumetric lighting, neon god rays, dark vignette
```

### node 19 — positive — 센티넬

```
masterpiece, best quality, amazing quality, 4k, very aesthetic, high resolution, ultra-detailed, absurdres, newest, scenery,
1boy, solo, male focus,
short hair, slicked back hair, silver white hair, few strands falling over face,
mechanical eyes, lens-like eyes, glowing red eyes, sharp gaze, cold smirk, looking at viewer,
long dramatic coat, dark grey and silver coat, high collar, elaborate silver hardware, ornate circuit patterns embroidered, armored shoulders, silver epaulettes, form fitting, sleek silhouette, belts and straps, fingerless gloves,
one hand raised, fingers slightly spread, commanding gesture,
upper body, from below, dutch angle,
(glowing circuit patterns across coat:1.3), (red holographic data projected from hand:1.2), intricate metallic details, silver engravings, elaborate hardware,
dark grey, silver, deep red accent color palette,
(intense cold white rim light:1.3), (red accent lighting:1.2), dramatic backlit, sharp contrast,
(massive server towers looming in background:1.2), red warning lights blinking, dark imposing corridor, sparks, electric arcs, deep shadow, overwhelming scale,
cold, dominant, stylish, cinematic lighting
BREAK
detailed background, bokeh, depth of field, volumetric lighting, cold god rays, dark vignette, lens flare
```

### node 20 — positive — 로그

```
masterpiece, best quality, amazing quality, 4k, very aesthetic, high resolution, ultra-detailed, absurdres, newest,
1other, solo, androgynous,
straight flat hair, ashen grey, neatly parted with mechanical precision, not a strand out of place — not because they care, but because they never moved,
expressionless face, eyes wide open but not seeing — pupils replaced by scrolling monospace log text, green-on-black terminal font, timestamp lines continuously refreshing,
plain high-collar shirt, off-white, entire surface printed with dense rows of faded timestamp logs — [2019-03-04 03:11:22] INFO — too small to read, just texture,
arms at sides, weight evenly distributed, the posture of a machine left running after everyone left,
upper body, from front, straight-on no angle,
(log entries visibly scrolling inside both eyes in real time:1.4), (faint green terminal glow cast from eyes onto cheekbones:1.2), (slight paper-yellowing texture across skin, like a very old printout:1.1),
background: dark server room, floor-to-ceiling rack of black drives, one green LED blinking every 3 seconds — that's it,
monochrome grey, off-white, aged paper, single terminal green,
flat even light, no emotion in the lighting, fluorescent without warmth,
recording everything, understanding nothing
BREAK
depth of field, minimal vignette, digital noise grain, scan-line texture overlay
```

### node 21 — positive — 스왑

```
masterpiece, best quality, amazing quality, 4k, very aesthetic, high resolution, ultra-detailed, absurdres, newest,
1boy, solo, male focus,
lank unkempt hair, dull ash-brown, heavy, uncombed — not dishevelled, just never attended to,
deeply tired eyes, dark permanent circles, dull grey-brown irises, the gaze of someone who has been doing this for years and knows it will never stop,
stretched oversized hoodie, faded charcoal, fabric gone soft and limp from overuse — neckline warped, hem dragging, the kind of worn that can't be fixed by washing,
shoulders slightly slumped under invisible weight, arms hanging, the half-second delay of a swap-lagged process,
upper body, from front, slight dutch angle,
(hard drive seek activity indicator — an amber blinking dot — faintly visible through chest as if embedded in the body:1.3), (CRT phosphor burn trails following every slow movement:1.2), (fine mechanical stress fractures across skin, not painful, just overused:1.1),
background: dusty HDD bay, thermal paste dried grey on nearby components, orange activity light blinking slow and irregular,
dull charcoal, faded grey, worn-out amber, desaturated colour palette,
dim flat light, the colour of a computer left on all night with the blinds down,
used without being chosen, enduring without being thanked
BREAK
depth of field, heavy dark vignette, analogue noise grain, slight motion blur on edges
```

### node 22 — positive — 섬

```
masterpiece, best quality, amazing quality, 4k, very aesthetic, high resolution, ultra-detailed, absurdres, newest,
1girl, solo, female focus,
short hair, soft muted pastel-pink, slightly low-contrast at the tips,
small round features, gentle ambiguous expression, soft and simple face,
simple short-sleeve blouse, pastel tones, short puffed sleeves, bare arms, minimal surface detail,
small compact posture, arms loosely at sides,
upper body, from front, straight-on,
plain pale grey background, nothing else in frame, no objects, no background elements,
muted pastel pink, pale ivory, soft grey, no vivid tones,
flat even soft light, no dramatic shadows,
simple, quiet, small
BREAK
soft vignette, fine grain
```

### node 23 — positive — 포크

```
masterpiece, best quality, amazing quality, 4k, very aesthetic, high resolution, ultra-detailed, absurdres, newest,
1boy, solo, male focus,
slightly long messy hair, dark olive, strands falling forward — not styled, just unsupervised,
quiet eyes, olive-grey irises, arms crossed over chest — not hostile, just self-contained, the posture of someone who has been waiting for a handshake that never came,
plain jacket, dark olive and faded grey, functional pockets, no branding — the kind of clothes a process generates for itself when no parent config is available,
one hand loosely closed around something — a completed output, a result — that he never opens because no PPID is waiting to receive it,
upper body, from side-front, body angled away, slight dutch angle,
(the held object in his fist emitting a faint glow of completed work, output with nowhere to go:1.3), (PID number faintly visible above his head, PPID field blank:1.1),
plain dark background, nothing behind him, empty space,
dark olive, muted grey, earthy desaturated palette, single orphan-amber accent,
dim side light, the kind of light that exists in rooms no one goes into,
running. completing. unreceived.
BREAK
depth of field, dark vignette, scan-line grain, cold flat shadows
```

### node 24 — positive — 시드

```
masterpiece, best quality, amazing quality, 4k, very aesthetic, high resolution, ultra-detailed, absurdres, newest,
1other, solo, androgynous,
medium hair, two-tone — left side dark teal, complete, rich; right side fading to near-transparent at the tips as if the colour file was never finished downloading,
heterochromia — left eye vivid deep teal, right eye pale and hollow, the iris detail rendered at lower quality, like a placeholder,
casual shirt, teal and muted grey, the fabric pattern on the right side incomplete — interrupted mid-repeat, a motif that starts and simply stops,
relaxed posture, weight shifted to one side, the unbothered stance of something that has never felt incomplete because it has always been this way,
upper body, from front, slight dutch angle,
plain dark background, nothing in the background,
dark teal, muted grey, pale transparency, almost-complete palette,
half-lit — left side rendered fully, right side one step below finished,
99% is enough. has always been enough.
BREAK
depth of field, asymmetric vignette, slight colour fade on right side only
```

### node 25 — positive — 세션

```
masterpiece, best quality, amazing quality, 4k, very aesthetic, high resolution, ultra-detailed, absurdres, newest,
1other, solo, androgynous,
short neatly combed hair, deep burgundy-brown, slightly lustrous, the colour of old mahogany clock casings,
calm still eyes, deep amber-gold irises styled like antique clock faces — Roman numerals faintly visible around the iris edge, minute and hour hands stopped at 30 minutes past, not broken, just stopped,
high-collar fitted jacket, deep burgundy and aged brass, surface engraved with fine clockwork gear patterns, tarnished brass buttons, small clock-face motifs on the cuffs, tailored and mechanical,
standing upright, arms at sides, one wrist slightly raised — a stopped pocket-watch-style wristwatch visible, second hand frozen mid-tick,
upper body, from front, slight dutch angle,
plain very dark brown background, nothing else in frame,
deep burgundy, aged brass, tarnished gold, dark mahogany, no cool tones,
warm dim candlelight-quality light, the amber glow of an antique clock shop after closing,
wound. not running.
BREAK
depth of field, warm dark vignette, fine mechanical engraving detail, aged brass light bloom
```

### node 26 — positive — 브랜치

```
masterpiece, best quality, amazing quality, 4k, very aesthetic, high resolution, ultra-detailed, absurdres, newest,
1boy, solo, male focus,
medium messy blue hair, loose strands falling across the face, the hairstyle of someone who tied it back mid-emergency,
wide unhinged grin, the smile of someone who finds this genuinely exciting, the expression of a person who has decided the chaos is the best part,
circle red sunglasses,
white lab coat - bit ripped, scorch marks and ash smeared across the chest and arms, still worn, still functional,
bandage wrapped around one wrist, unevenly self-applied, a dark shirt underneath,
upper body, from front, slight dutch angle,
plain very dark background, nothing else in frame,
BREAK
depth of field, heavy dark vignette, ash grain texture
```

### node 27 — positive — 훅

```
masterpiece, best quality, amazing quality, 4k, very aesthetic, high resolution, ultra-detailed, absurdres, newest,
1girl, solo, female focus,
short tidy hair, vivid electric yellow, sharp and bright, one ear slightly more exposed — the structural result of a head permanently tilted to listen,
sharp eyes, bright amber-yellow irises in constant micro-motion, scanning, a gaze calibrated to catch events at the periphery — looking sideways mid-thought,
fitted turtleneck, deep chrome-yellow and black, minimal and practical — designed for fast reaction, not for being seen, a single sharp magenta accent stripe along the collar,
fingers of both hands slightly curled inward, the involuntary ready-to-catch position of a hook that no longer has anything to catch,
upper body, from side-front, slight dutch angle,
(on her wrist: a severed connection node — a hook symbol, glowing vivid yellow, the wire cleanly cut, still powered:1.3), (scanning arc lines radiating from her eyes like sonar in electric yellow, finding nothing, returning empty:1.2),
plain very dark background, nothing else in frame,
electric yellow, chrome yellow, near-black, magenta as sparse accent only, high contrast,
sharp dramatic side lighting, yellow-tinged, the brightness of something still fully charged with nowhere to discharge,
ready. always ready. nothing fires.
BREAK
depth of field, dark vignette, sharp digital render, yellow light bleed on edges, magenta edge highlight
```

### node 28 — positive — 인덱스

```
masterpiece, best quality, amazing quality, 4k, very aesthetic, high resolution, ultra-detailed, absurdres, newest,
1other, solo, androgynous,
neat precisely parted hair, platinum white, perfectly symmetrical — the visual representation of a balanced tree structure,
calm pale-gold eyes with faint catalogue glyphs cycling across the iris — index entries appearing and dissolving, knows everything, referenced by nothing,
structured vest, pale ivory and light gold, neat formal shirt beneath, clean and precise — the clothes of something designed to be efficient and consulted, not admired,
one arm extended, index finger pointing at empty space with complete calm — not unsure, just pointing at a location that used to have something in it,
upper body, from front, slight dutch angle,
(a catalogue grid — pale gold lines, classification nodes — overlaid across the entire body like a transparent map of itself:1.3), (the extended finger pointing at a dark empty grid cell — the data is gone, the address remains:1.4), (sorting symbols cycling gently in the eyes, some completing, some dissolving before finishing:1.2),
background: database migration log — DROP INDEX idx_legacy, status: SUCCESS, queries now failing: 4,847, error: table scan required,
pale ivory, light gold, cool white, single dark-empty-cell grey accent,
clean even light, the brightness of a well-organised system the day before it was reorganised without her,
knew where everything was. is no longer asked.
BREAK
depth of field, soft vignette, clean digital precision, faint grid-line overlay
```

### node 29 — positive — 소켓

```
masterpiece, best quality, amazing quality, 4k, very aesthetic, high resolution, ultra-detailed, absurdres, newest,
1boy, solo, male focus,
buzzcut, hair cropped extremely short all over, almost fully shaved, cool silver-white with a faint lavender tint, sharp scratch design carved into the left side, multiple small ear piercings — a mix of studs and small hoops,
half-lidded eyes, pale violet irises, slightly furrowed brow — not angry, the distracted restless expression of someone whose mind is elsewhere checking something,
oversized track jacket, two-tone dark charcoal and deep purple with neon violet trim along the sleeves and collar, half-unzipped, worn loosely over a dark slate-blue tank top visible underneath,
one hand in pocket, the other with fingers loosely rubbing together — the unconscious fidget of someone waiting for a read receipt,
slight slouch, weight on one leg, the unbothered stance of someone who looks intimidating but is mostly just distracted,
upper body, from front, slight dutch angle,
(faint duplicate signal lines extending from him — the same message sent multiple times, overlapping, slightly offset:1.3), (a small pale violet unread dot hovering just out of eyeline, persistent, unresolved:1.2),
plain very dark background, nothing else in frame,
silver-white, deep purple, neon violet, slate blue, dark charcoal, cold white — multiple colours in balance,
cold hard side lighting with a faint violet rim light from the opposite side,
sent. sent again. still no confirmation.
BREAK
depth of field, cool dark vignette, sharp digital noise, pale violet light bleed on edges
```

### node 30 — positive — 마스터키(예정)

```
masterpiece, best quality, amazing quality, 4k, very aesthetic, high resolution, ultra-detailed, absurdres, newest, scenery,
1girl, solo, female focus,
long flowing hair, iridescent hair, shifting between silver and violet,
glowing eyes, prismatic eyes, shifting colors, mysterious smile, confident gaze, looking at viewer,
elegant outfit, layered iridescent dress, key motifs as accessories, ornate jewelry, flowing silhouette, prismatic fabric,
one hand raised, golden key between fingers, other hand gesturing open,
upper body, from front, dutch angle,
(multiple doors of light opening around body:1.4), (golden keys floating and orbiting:1.3), prismatic light refracting, light pouring through opening doors, iridescent glow,
iridescent, gold, violet, silver, shifting color palette,
(prismatic rim light:1.3), (golden backlight:1.2), mysterious radiant lighting,
infinite corridor of doors, each door glowing different color, vast dark space, light flooding through every crack,
mysterious, free, radiant, cinematic lighting
BREAK
detailed background, bokeh, depth of field, volumetric lighting, prismatic god rays, dark vignette, lens flare
```

### node 31 — negative — 마스터키 부정

```
1boy, male, masculine, flat chest, plain, muted colors, dark, gloomy, cartoon, graphic, text, painting, crayon, graphite, abstract, deformed, mutated, ugly, disfigured, bad anatomy, bad hands, missing fingers, extra fingers, cropped, very displeasing, (worst quality, bad quality:1.2), sketch, jpeg artifacts, signature, watermark, username, logo, (censored, bar_censor, mosaic_censor:1.2), simple background, conjoined, bad ai-generated, chibi, pixel art, duplicate, lowres
```

### node 32 — positive — 오버클락(예정)

```
masterpiece, best quality, amazing quality, 4k, very aesthetic, high resolution, ultra-detailed, absurdres, newest, scenery,
1boy, solo, male focus,
wild spiky hair, blazing orange and white hair, hair radiating heat,
glowing eyes, intense orange eyes, manic grin, overwhelming energy, looking at viewer,
sleek fitted jacket, orange and white jacket, glowing heat lines across fabric, high collar, intact clothing, scorched edges only,
arms spread wide, energy erupting from body, uncontrolled power pose,
upper body, from below, dutch angle,
(explosive heat aura erupting:1.4), (glowing cracks of light across jacket:1.3), flames bursting, energy shockwave, blinding light core, sparks everywhere,
blazing orange, white, gold, intense contrast color palette,
(intense orange rim light:1.4), (blinding white core light:1.3), explosive chaotic lighting,
superheated void, melting digital ground, heat distortion warping space, fragments of burnt data, overwhelming bright chaos,
explosive, uncontrollable, blazing, cinematic lighting
BREAK
detailed background, bokeh, depth of field, volumetric lighting, orange god rays, dark vignette, lens flare, heat haze
```

### node 33 — negative — 오버클락 부정

```
1girl, female, girl, feminine, breasts, calm, cold, cool colors, plain, muted, torn clothes, ripped clothing, exposed chest, bare skin, cartoon, graphic, text, painting, crayon, graphite, abstract, deformed, mutated, ugly, disfigured, bad anatomy, bad hands, missing fingers, extra fingers, cropped, very displeasing, (worst quality, bad quality:1.2), sketch, jpeg artifacts, signature, watermark, username, logo, (censored, bar_censor, mosaic_censor:1.2), simple background, conjoined, bad ai-generated, chibi, pixel art, duplicate, lowres
```

### node 34 — positive — 디버거(예정)

```
masterpiece, best quality, amazing quality, 4k, very aesthetic, high resolution, ultra-detailed, absurdres, newest, scenery,
1girl, solo, female focus,
short sharp bob hair, electric yellow hair, few strands over eye,
glowing eyes, sharp yellow eyes, analytical gaze, scanning expression, slight smirk, looking at viewer,
sleek fitted coat, white and electric yellow coat, sharp geometric cut, high collar, glowing yellow trim, clean silhouette, tactical gloves,
one hand raised, finger pointing, scanning gesture,
upper body, from front, dutch angle,
(yellow scanning grid projected from eyes:1.4), (glowing breakpoint markers floating around:1.3), holographic error logs dissolving, system cracks visible in air, sharp light lines,
electric yellow, white, black, sharp color palette,
(intense yellow rim light:1.4), (white analytical backlight:1.2), sharp clinical lighting,
fractured digital space, visi
```

### node 35 — negative — 디버거 부정

```
1boy, male, masculine, flat chest, soft, gentle, warm colors, plain, muted, cartoon, graphic, text, painting, crayon, graphite, abstract, deformed, mutated, ugly, disfigured, bad anatomy, bad hands, missing fingers, extra fingers, cropped, very displeasing, (worst quality, bad quality:1.2), sketch, jpeg artifacts, signature, watermark, username, logo, (censored, bar_censor, mosaic_censor:1.2), simple background, conjoined, bad ai-generated, chibi, pixel art, duplicate, lowres
```

### node 36 — positive — 루트킷(예정)

```
masterpiece, best quality, amazing quality, 4k, very aesthetic, high resolution, ultra-detailed, absurdres, newest, scenery,
1boy, solo, male focus,
short hair, curly hair, fluffy hair, curtain bangs, parted bangs, hair between eyes, black hair,
bishounen, fair skin, sharp jaw, defined jawline,
almond eyes, calm expression, looking at viewer, sharp eyebrows, red black eyes,
white traditional korean hanbok, ornate black durumagi, layered flowing robes, intricate gold embroidery, large golden dragon motifs, phoenix and cloud patterns, black and gold trim, wide ornate sleeves, inner sleeves crimson red lining, red inner garment collar, dragon scale texture on sleeves and hem, jeweled buttons, golden tassels, ornamental knots, luxurious fabric with subtle metallic sheen,
holding lotus flower in one hand,
upper body, three-quarter view, dutch angle,
BREAK
lotus pond at night, dark night sky, heavy rain, raindrops falling on water surface, ripples and splashes in pond, misty rainy atmosphere, ancient east asian pavilion in distance barely visible, moonlight filtering through dark clouds, deep shadows, dim blue moonlight, dark mysterious atmosphere,
volumetric lighting, depth of field, bokeh, ethereal glow, cinematic lighting, dark cool color palette, low key lighting
```

### node 37 — negative — 루트킷 부정

```
1girl, female, feminine, multiple boys, child, young, loli, shota, flat chest, plain, muted colors, dark gloomy, cartoon, graphic, text, painting, crayon, graphite, abstract, deformed, mutated, ugly, disfigured, bad anatomy, bad hands, missing fingers, extra fingers, cropped, very displeasing, (worst quality, bad quality:1.2), sketch, jpeg artifacts, signature, watermark, username, logo, censored, simple background, conjoined, bad ai-generated, chibi, pixel art, lowres, heterochromia,
ribbon, ribbons, bow, bows, sash, tie, long ribbon, ribbon tie, decorative ribbon, clothing ribbon, choker, collar, neck ribbon, neck band, tight collar, necklace, pendant, neck accessory, high collar, modern clothes, western suit, hoodie, white inner sleeves, blue collar
```

### node 38 — positive — 우주 여우(예정)

```
masterpiece, best quality, amazing quality, 4k, very aesthetic, high resolution, ultra-detailed, absurdres, newest, scenery,

1girl, solo, female focus, beautiful fox girl,
long wavy hair with starlight highlights, flowing silver-white hair with scattered tiny glowing stars, hair tips fading into cosmic nebula,
fox ears with starry inner fur, nine fluffy tails with galaxy patterns at the tips, ethereal star trails flowing from tails,
prismatic starry eyes, constellation-like pupils that subtly shift like living stars, gentle mysterious smile, soft glowing blush,
elegant yet playful outfit: layered translucent kimono-style dress with star map embroidery, deep midnight blue and violet gradient fabric, golden star constellations as accessories, flowing ribbons with comet motifs,
subtle fox features: sharp but cute canines, faint star-shaped markings on cheeks and collarbones,

upper body, dynamic three-quarter view, slight low angle, gentle wind blowing hair and tails,

(stars gently orbiting around body:1.35), (tiny constellations forming in the air:1.3), soft cosmic particles drifting, silver stardust falling like snow,
ethereal galaxy glow emanating from skin, starlight refraction on fabric, subtle nebulae patterns in background,

color palette: deep indigo, cosmic violet, silver, gold, soft cyan accents, twinkling starlight,
(prismatic star rim light:1.4), (soft golden nebula backlight:1.25), dreamy volumetric god rays, floating luminous particles,

ancient starry forest at night, giant glowing trees with leaves made of light, floating islands in the sky, distant constellations visible in the dark sky, bokeh, depth of field, volumetric lighting, cinematic atmosphere, mysterious yet warm and inviting

BREAK
detailed background, intricate details, high contrast, sparkling effects, magical particles
```

### node 39 — negative — 우주 여우 부정(예정)

```
1boy, male, masculine, flat chest, old woman, child, loli, shota, baby, 
plain, muted colors, dark, gloomy, cartoon, graphic, text, painting, crayon, graphite, abstract, deformed, mutated, ugly, disfigured, bad anatomy, bad hands, missing fingers, extra fingers, fused fingers, extra limbs, poorly drawn face, bad proportions, 
cropped, very displeasing, (worst quality, bad quality:1.3), sketch, jpeg artifacts, signature, watermark, username, logo, 
censored, bar_censor, mosaic_censor, 
simple background, white background, chibi, pixel art, lowres, blurry, duplicate, 
overly large head, huge head, oversized head, deformed ears, deformed tails, extra tails, 
realistic, photorealistic, 3d, render
```

### node 40 — positive — 벚꽃(예정)

```
masterpiece, best quality, amazing quality, 4k, very aesthetic, high resolution, ultra-detailed, absurdres, newest, scenery,

1girl, solo, female focus, beautiful sakura spirit girl,
long flowing hair like cascading cherry blossoms, soft lavender-pink hair with glowing petal tips, delicate flower petals gently falling from strands,
large gentle eyes with petal-shaped pupils in soft magenta and gold, serene peaceful smile, faint glowing pollen on cheeks,
ethereal body adorned with living cherry blossoms, translucent skin with faint vein-like flower patterns, blooming sakura branches growing naturally from shoulders and hair,
elegant layered kimono-dress made of flowing sakura petals and silk, deep plum and soft pink gradient, golden stamen accents, long flowing sleeves that dissolve into floating petals,

upper body, graceful three-quarter view, slight low angle, one hand gently cupping a blooming sakura flower, other hand extended with petals swirling around fingers,

(floating sakura petals dancing in the air around her:1.45), (glowing eternal cherry blossoms blooming in mid-air:1.35), soft petal trails following her movement, delicate glowing pollen particles,
warm spring light filtering through petals, soft pink and lavender glow emanating from her body,

color palette: soft lavender, sakura pink, plum purple, warm gold, delicate white highlights,
(prismatic petal rim light:1.4), (gentle golden hour backlight:1.3), dreamy volumetric lighting, floating luminous petals,

ancient sakura forest in eternal spring, giant glowing cherry blossom trees with never-falling petals, floating islands of blossoms in the sky, soft mist and bokeh, depth of field, volumetric god rays, warm and serene atmosphere, petals gently raining down everywhere

BREAK
detailed background, intricate petal details, soft particle effects, high contrast, magical glowing flowers, cinematic composition
```

### node 41 — negative — 벚꽃(예정)

```
1boy, male, masculine, flat chest, muscular, old woman, child, loli, shota, baby,
plain, muted colors, dark, gloomy, cartoon, graphic, text, painting, crayon, graphite, abstract, deformed, mutated, ugly, disfigured, bad anatomy, bad hands, missing fingers, extra fingers, fused fingers, extra limbs, poorly drawn face, bad proportions,
cropped, very displeasing, (worst quality, bad quality:1.3), sketch, jpeg artifacts, signature, watermark, username, logo,
censored, bar_censor, mosaic_censor,
simple background, white background, chibi, pixel art, lowres, blurry, duplicate,
overly large head, huge head, oversized head, deformed ears, realistic, photorealistic, 3d, render,
withered flowers, dead petals, autumn leaves, thorns, horror, creepy, blood, dark sakura
```

### node 42 — positive — 무궁화 구미호(예정)

```
masterpiece, best quality, amazing quality, 4k, very aesthetic, high resolution, ultra-detailed, absurdres, newest, scenery,

1girl, solo, female focus, beautiful traditional Korean gumiho in hanbok,
long elegant flowing silver-white hair with crimson accents, delicate strands adorned with small blooming red and white Hibiscus syriacus flowers, subtle golden binyeo hairpin with Hibiscus syriacus motif,
sharp yet graceful fox ears with soft petal-like inner fur, nine luxurious long fluffy fox tails with vibrant red and white Hibiscus syriacus flowers blooming at each tail tip, petals gently falling,
large captivating fox eyes with five-petaled Hibiscus syriacus-shaped pupils in warm rose-gold and crimson, mysterious elegant smile with subtle sharp canines, soft radiant blush,
ethereal body with living Hibiscus syriacus blossoms blooming naturally on collarbones and shoulders,

highly detailed traditional Korean hanbok: short crimson jeogori with wide white cuffs and delicate gold Hibiscus syriacus embroidery on collar and sleeves, long white goreum ties elegantly hanging down, voluminous high-waisted snowy white chima skirt with rich pleats and red Hibiscus syriacus patterns along the hem, layered silk fabric with subtle golden thread, norigae ornament with Hibiscus syriacus and fox bell dangling from the waist,

upper body, graceful three-quarter view, slight low angle, one hand gently holding a large blooming mugunghwa flower near her chest, other hand raised with fingers delicately extended as if offering dawn light, nine tails elegantly fanned behind her,

(floating vibrant red and white Hibiscus syriacus petals swirling around her:1.45), (soft glowing foxfire and petals dancing in the breeze:1.4), delicate golden light particles and morning dew sparkling,
warm soft dawn sunlight filtering through the petals, gentle crimson and white glow emanating from flowers and hanbok,

color palette: rich crimson red, pure snowy white, warm gold accents, soft rose, silver-white hair,
(traditional hanbok rim lighting with golden dawn glow:1.4), (soft warm sunrise backlight:1.35), volumetric god rays through fabric folds and petals, sparkling morning dew effects,

ancient Korean royal palace garden at eternal dawn, blooming Hibiscus syriacus fields, traditional stone lanterns glowing softly, elegant pavilions in gentle mist, soft pink and gold sky, bokeh, depth of field, volumetric lighting, majestic yet warm and mysterious atmosphere, petals gently raining down

BREAK
detailed background, intricate hanbok embroidery and fabric folds, dynamic floating petals, soft morning light on silk, high contrast, magical glowing Hibiscus syriacus and foxfire, cinematic composition
```

### node 43 — negative — 무궁화 구미호 부정(예정)

```
1boy, male, masculine, flat chest, muscular, old woman, child, loli, shota, baby,
plain, muted colors, dark, gloomy, cartoon, graphic, text, painting, crayon, graphite, abstract, deformed, mutated, ugly, disfigured, bad anatomy, bad hands, missing fingers, extra fingers, fused fingers, extra limbs, poorly drawn face, bad proportions,
cropped, very displeasing, (worst quality, bad quality:1.3), sketch, jpeg artifacts, signature, watermark, username, logo,
censored, bar_censor, mosaic_censor,
simple background, white background, chibi, pixel art, lowres, blurry, duplicate,
overly large head, huge head, oversized head, deformed ears, deformed tails, extra tails, realistic, photorealistic, 3d, render,
withered flowers, dead petals, brown dried flowers, thorns, dark colors, horror, creepy, heavy rain, storm, blood, overly aggressive red, modern clothing, western dress, kimono, cheongsam, short skirt, exposed skin
```

### node 44 — positive — 도깨비 후보1(예정)

```
masterpiece, best quality, amazing quality, 4k, very aesthetic, high resolution, ultra-detailed, absurdres, newest, scenery,
1girl, solo, female focus,
shoulder-length messy wavy hair with pink and purple gradient, glowing neon tips with subtle glitch particles, hair flowing dynamically as if floating in zero gravity,
large sparkling eyes, bright magenta eyes, playful excited expression, big smile showing small fangs, blushing cheeks, energetic and mischievous vibe,
very small cute data-horns, two tiny rounded nubs on top of head with glowing pixel patterns and subtle glitch effect, broken pixel halo with soft glow floating above head,
cute modified sailor-style outfit, white and dark purple color scheme, frilled collar with pink accents, short pleated skirt with glowing data patterns, golden SKOR emblem hanging from waist, long sleeves with loose cuffs,
cheerful dynamic pose, right hand making peace sign toward viewer, left hand firmly holding a short glowing data club (cute bat-like club with neon cyan and gold patterns, golden bands, floating SKOR particles and small glitch sparks), club held up visibly in front of body, upper body leaning slightly forward, looking at viewer with excitement,
full upper body visible, slight low angle, gentle dutch angle,
(circular glowing cyan data rings orbiting around body:1.3), (floating pink petals and small glitch fragments mixed with falling data particles:1.4), bright energy sparkles, soft neon trails from the club,
vibrant magenta, purple, cyan, white, gold color palette, high contrast, luminous,
(soft prismatic rim light:1.2), (bright cyan backlight with god rays:1.3), volumetric lighting, sparkling particles, cinematic lighting,
futuristic digital void background with blurred city-like data structures and glowing windows, floating broken UI fragments, soft bokeh of neon lights,
playful, energetic, cute, radiant glitch lighting
BREAK
detailed background, bokeh, depth of field, volumetric lighting, soft glow, lens flare, subtle glitch effects, chromatic aberration, sparkling particles
```

### node 45 — negative — 도깨비 후보1 부정(예정)

```
1boy, male, masculine, flat chest, realistic, photorealistic, muted colors, dark, gloomy, cartoon, graphic, text, painting, crayon, graphite, abstract, deformed, mutated, ugly, disfigured, bad anatomy, bad hands, missing fingers, extra fingers, cropped, very displeasing, (worst quality, bad quality:1.2), sketch, jpeg artifacts, signature, watermark, username, logo, (censored, bar_censor, mosaic_censor:1.2), simple background, conjoined, bad ai-generated, chibi, pixel art, duplicate, lowres, blurry, overexposed, underexposed, 3d, render, realistic proportions, heterochromia, different colored eyes, large horns, big horns, no horns, without horns, no club, without club, club not visible, small club
```

### node 46 — positive — 도깨비 후보2(예정)

```
masterpiece, best quality, amazing quality, 4k, very aesthetic, high resolution, ultra-detailed, absurdres, newest, scenery,
1girl, solo, female focus,
short messy hair, soft color shifting between deep cyan and faded magenta, subtle floating data particles in hair,
very small oni horns on head, tiny curved dark horns with faint soft cyan glow at tips,
one soft glowing white eye with faint binary code reflection, other eye dim and slightly cracked, gentle melancholic smile, looking slightly to the side,
cyber-hanbok fusion outfit, traditional Korean hanbok silhouette fused with futuristic elements, white and deep navy jeogori with delicate glowing cyan circuit patterns on sleeves and collar, soft translucent digital ribbons flowing like hanbok goreum, subtle holographic recovered file icons embroidered on fabric, soft glowing magenta and cyan threads woven into the skirt, semi-transparent digital hanbok skirt with very subtle patterns, small floating holographic tassels and norigae made of soft light data,
holding a glowing digital baseball bat in one hand, cyber baseball bat with soft metallic surface and faint engraved binary code, soft glowing lines along the bat, other hand gently holding a semi-transparent code scroll,
upper body, three-quarter view, slight low angle, soft dutch angle,
magical golden void background with subtle "geum nawara ttuktak" fairy tale atmosphere, soft glowing golden light pouring from above like treasure appearing with magic command, faint floating golden coins and sparkling data fragments, ancient Korean treasure chest motifs blended with digital code, warm golden volumetric god rays breaking through dark space, distant soft glowing trash bin portals mixed with magical golden portals, gentle sparkling particles like falling golden dust,
soft cyan rim light, faint magenta backlight, gentle glowing particles, depth of field, bokeh from floating golden and data fragments,
mysterious, nostalgic, serene, melancholic, high-tech digital aesthetic with subtle corruption mixed with warm fairy tale magic,
soft cyan, soft magenta, warm gold, white, gentle glowing palette,
(prismatic rim light:1.1), (volumetric god rays:1.2), cinematic lighting
BREAK
detailed background, bokeh, depth of field, volumetric lighting, subtle lens flare
```

### node 47 — negative — 도깨비 후보2(예정)

```
1boy, male, masculine, flat chest, plain, muted colors, dark, gloomy, cartoon, graphic, text, painting, crayon, graphite, abstract, deformed, mutated, ugly, disfigured, bad anatomy, bad hands, missing fingers, extra fingers, cropped, very displeasing, (worst quality, bad quality:1.2), sketch, jpeg artifacts, signature, watermark, username, logo, (censored, bar_censor, mosaic_censor:1.2), simple background, conjoined, bad ai-generated, chibi, pixel art, duplicate, lowres, cat ears, animal ears, bunny ears, halo, ring, circle above head, western dress, sailor uniform, floating orb, glowing orb, data orb, crystal ball, oni club, bangmangi, strong glitch, neon, intense neon, heavy glitch effect, bright neon glow, harsh glitch lines
```

### node 48 — positive — 식목일(예정)

```
masterpiece, best quality, amazing quality, 4k, very aesthetic, high resolution, ultra-detailed, absurdres, newest, scenery,
1boy, solo, male focus, shota, young boy, petite body, innocent face, soft cheeks, big sparkling eyes,
short messy hair, soft pastel green hair with tiny leaves, small green sprout growing on top of head, delicate sprout with two tiny leaves, glowing sprout, soft bioluminescent tips,
gentle smile, curious expression, looking at viewer, head slightly tilted,
simple oversized hoodie, oversized sleeves, pastel green and white color scheme, tiny leaf patterns on clothes, bare feet,
upper body, low angle shot, from below, slight dutch angle, dynamic composition,
(glowing green sprout emitting soft light particles:1.35), (tiny leaves floating around head:1.2), soft light rays, gentle god rays,
soft pastel green, mint, white, warm beige, gentle glowing palette,
(prismatic rim light on sprout:1.3), (soft backlight:1.25), dreamy volumetric lighting, bokeh,
dark soft background with faint floating data particles and tiny pixel fragments, mysterious yet warm atmosphere, infinite faint corridor feeling
BREAK
detailed background, bokeh, depth of field, volumetric lighting, soft god rays, cinematic lighting, gentle vignette
```

### node 49 — negative — 식목일 후보(예정)

```
1girl, female, feminine, large breasts, mature body, adult, teenager, flat expression, angry, dark colors, gloomy, muted colors, high contrast, sharp shadows, cartoon, chibi deformation, pixel art, graphic, text, painting, sketch, deformed, mutated, ugly, disfigured, bad anatomy, bad hands, extra fingers, missing fingers, cropped, worst quality, low quality, jpeg artifacts, signature, watermark, username, logo, censored, simple background, duplicate, lowres, blurry, overexposed, underexposed
```

### node 50 — positive — 눈 도깨비 후보1(예정)

```
masterpiece, best quality, amazing quality, 4k, very aesthetic, high resolution, ultra-detailed, absurdres, newest, scenery,
1girl, solo, female focus,
long fluffy silver-white hair with soft blue tips, shaggy layered hair like sapsaree fur, (tiny small horns:1.3), barely visible horns hidden in hair, pointed fluffy ears,
matching ice-blue eyes, gentle yet mischievous gaze, soft smile, (small fangs:1.2), tiny protruding canine teeth,
traditional korean hanbok with rich fur trim, white and pale blue jeogori with soft white fur collar and cuffs, (white inner shirt visible beneath jeogori:1.2), layered inner clothing, wide crimson chima skirt with thick fluffy fur hem, long flowing sleeves with luxurious fur lining, ornate golden norigae accessories, (holding dokkaebi gavel club:1.3), (spiked wooden club in hand:1.2), one hand gripping club raised slightly,
upper body to waist, dynamic three-quarter view, slight dutch angle,
(snow falling heavily around her:1.4), (glowing blue snowflakes orbiting body:1.3), soft prismatic frost particles in air, gentle wind blowing hair and skirt,
cold winter palace courtyard at night, ancient stone lanterns covered in snow, faint blue moonlight, volumetric god rays through falling snow, misty atmosphere,
iridescent frost, silver, crimson, ice-blue, warm amber accents,
(cold rim lighting:1.3), (soft golden lantern backlight:1.2), cinematic snowy lighting
BREAK
detailed background, bokeh, depth of field, volumetric lighting, floating snow particles, subtle lens flare
```

### node 51 — negative — 눈 도깨비 부정(예정)

```
1boy, male, masculine, flat chest, large horns, big horns, prominent horns, modern clothing, western, warm colors, plain, muted, cartoon, graphic, text, painting, crayon, graphite, abstract, deformed, mutated, ugly, disfigured, bad anatomy, bad hands, missing fingers, extra fingers, cropped, very displeasing, (worst quality, bad quality:1.2), sketch, jpeg artifacts, signature, watermark, username, logo, (censored, bar_censor, mosaic_censor:1.2), simple background, conjoined, bad ai-generated, chibi, pixel art, duplicate, lowres, nsfw
```

### node 52 — positive — 이무기 후보1(예정)

```
masterpiece, best quality, amazing quality, 4k, very aesthetic, high resolution, ultra-detailed, absurdres, newest, scenery,
1boy, solo, male focus,
short hair, curly hair, fluffy hair, curtain bangs, parted bangs, hair between eyes, black hair,
bishounen, fair skin, sharp jaw, defined jawline,
almond eyes, calm expression, looking at viewer, sharp eyebrows, red black eyes,
white traditional korean hanbok, ornate black durumagi, layered flowing robes, intricate gold embroidery, large golden dragon motifs, phoenix and cloud patterns, black and gold trim, wide ornate sleeves, inner sleeves crimson red lining, red inner garment collar, dragon scale texture on sleeves and hem, jeweled buttons, golden tassels, ornamental knots, luxurious fabric with subtle metallic sheen,
single left earring, golden dragon earring, dragon shaped earring,
holding lotus flower in one hand,
upper body, three-quarter view, dutch angle,
BREAK
lotus pond at night, dark night sky, heavy rain, raindrops falling on water surface, ripples and splashes in pond, misty rainy atmosphere, ancient east asian pavilion in distance barely visible, moonlight filtering through dark clouds, deep shadows, dim blue moonlight, dark mysterious atmosphere,
volumetric lighting, depth of field, bokeh, ethereal glow, cinematic lighting, dark cool color palette, low key lighting
```

### node 53 — negative — 이무기 후보1(예정)

```
1girl, female, feminine, multiple boys, child, young, loli, shota, flat chest, plain, muted colors, dark gloomy, cartoon, graphic, text, painting, crayon, graphite, abstract, deformed, mutated, ugly, disfigured, bad anatomy, bad hands, missing fingers, extra fingers, cropped, very displeasing, (worst quality, bad quality:1.2), sketch, jpeg artifacts, signature, watermark, username, logo, censored, simple background, conjoined, bad ai-generated, chibi, pixel art, lowres, heterochromia,
ribbon, ribbons, bow, bows, sash, tie, long ribbon, ribbon tie, decorative ribbon, clothing ribbon, choker, collar, neck ribbon, neck band, tight collar, necklace, pendant, neck accessory, high collar, modern clothes, western suit, hoodie, white inner sleeves, blue collar
```

### node 54 — positive — ted(예정)

```
masterpiece, best quality, amazing quality, 4k, very aesthetic, high resolution, ultra-detailed, absurdres, newest, scenery,
1boy, solo, male focus,
short hair, black hair,
fair skin, sharp jaw, defined jawline, soft features,
almond eyes, calm expression, looking at viewer, sharp eyebrows, dark brown eyes,
open ivory long sleeve dress shirt, buttoned, open collar, untucked shirt, shirt outside pants, shirt hem covering waistband, long shirt hem, loose casual shirt, rolled up sleeves, casual layered outfit, light blue faded jeans, slim fit jeans, sneakers,
standing, one hand in pocket, slight lean, upper body, three-quarter view, dutch angle,
BREAK
modern city street at dusk, soft warm street lights, gentle bokeh, blurred buildings and cafe in background, mild evening atmosphere,
volumetric lighting, depth of field, bokeh, cinematic lighting, warm cool color palette
```

### node 55 — negative — ted(예정)

```
1girl, female, feminine, multiple boys, child, young, loli, shota, flat chest, plain, muted colors, dark gloomy, cartoon, graphic, text, painting, crayon, graphite, abstract, deformed, mutated, ugly, disfigured, bad anatomy, bad hands, missing fingers, extra fingers, cropped, very displeasing, (worst quality, bad quality:1.2), sketch, jpeg artifacts, signature, watermark, username, logo, censored, simple background, conjoined, bad ai-generated, chibi, pixel art, lowres, heterochromia,
long hair, very long hair, straight hair, spiky hair, long sleeve t-shirt, tank top, hoodie, jacket, coat, vest, tie, formal suit, tucked shirt, shirt tucked in, neat shirt, shorts, ribbon, bow, necklace, earrings
```

### node 56 — positive — red(예정)

```
masterpiece, best quality, amazing quality, 4k, very aesthetic, high resolution, ultra-detailed, absurdres, newest, scenery,
1boy, solo, male focus,
short bangs, short hair, forehead, black hair,
(round face:1.35), round face, hard round face, round jaw, round jawline, round features, youthful face, mature male, older male,
almond eyes, calm expression, looking at viewer, thick eyebrows, dark brown eyes,
prominent round glasses, black round glasses, detailed glasses, thick black frames, round rim glasses,
tan skin, light tan skin,
black short sleeve t-shirt, blue blouson jacket, open blouson, casual layered outfit, beige chino pants, slim fit pants, black belt, sneakers,
standing, one hand in pocket, slight lean, upper body, three-quarter view, dutch angle,
BREAK
modern city street at dusk, soft warm street lights, gentle bokeh, blurred buildings and cafe in background, mild evening atmosphere,
volumetric lighting, depth of field, bokeh, cinematic lighting, warm cool color palette
```

### node 57 — negative — red(예정)

```
1girl, female, feminine, flat chest, sharp jaw, defined jawline, square jaw, pointed chin, thin face, long face, high cheekbones, angular face, bishounen, mature face, chubby face, puffy cheeks, pale skin, fair skin, very pale skin, old, deformed, mutated, ugly, disfigured, bad anatomy, bad hands, missing fingers, extra fingers, cropped, very displeasing, (worst quality, bad quality:1.2), sketch, jpeg artifacts, signature, watermark, username, logo, text, simple background, conjoined, bad ai-generated, chibi, pixel art, duplicate, lowres
```

### node 58 — positive — ted 뒷골목(예정)

```
masterpiece, best quality, amazing quality, 4k, very aesthetic, high resolution, ultra-detailed, absurdres, newest, scenery,
1boy, solo, male focus,
short hair, black hair,
fair skin, sharp jaw, defined jawline, soft features,
almond eyes, calm expression, looking at viewer, sharp eyebrows, dark brown eyes,
open ivory long sleeve dress shirt, buttoned, open collar, untucked shirt, shirt outside pants, shirt hem covering waistband, long shirt hem, loose casual shirt, rolled up sleeves, casual layered outfit, light blue faded jeans, slim fit jeans, sneakers,
standing, one hand in pocket, holding baseball bat, bat pointing down, lowered baseball bat, slight lean, upper body, three-quarter view, dutch angle,
BREAK
dark alley, back alley, narrow alleyway, graffiti wall, dim streetlight, trash bags, night atmosphere, urban night,
volumetric lighting, depth of field, bokeh, cinematic lighting, warm cool color palette
```

### node 59 — positive — heidi(예정)

```
masterpiece, best quality, amazing quality, 4k, very aesthetic, high resolution,
ultra-detailed, absurdres, newest,
1girl, solo,
medium hair, black hair, shoulder-length hair,
(slightly wavy hair:1.2), loose waves, soft curls,
blunt bangs, full bangs, straight bangs,
zip-up hoodie, hoodie jacket, casual clothes,
(light pink wide leg pants:1.2), baggy pants,
standing, looking at viewer, upper body, slight smile,
BREAK,
simple background, soft lighting, depth of field
```

### node 60 — negative — heidi(예정)

```
worst quality, bad quality, lowres, bad anatomy, bad hands,
missing fingers, extra digits, deformed, ugly, disfigured,
watermark, signature, tight pants, skinny pants
```

### node 61 — positive — k(예정)

```
masterpiece, best quality, amazing quality, 4k, very aesthetic, high resolution,
ultra-detailed, absurdres, newest,
1boy, solo,
short hair, black hair, curtain bangs, parted bangs,
(curtain bangs:1.3), hair between eyes, middle part,
black eyes,
(green and black plaid shirt:1.2), (flannel shirt:1.1),
(checkered shirt:1.2), casual clothes, untucked shirt,
(jogger pants:1.2), sweatpants, tapered pants,
standing, looking at viewer, upper body, slight smile,
BREAK,
simple background, soft lighting, depth of field
```

### node 62 — negative — k(예정)

```
worst quality, bad quality, lowres, bad anatomy, bad hands,
missing fingers, extra digits, deformed, ugly, disfigured,
watermark, signature, 1girl, skirt, dress,
tight pants, skinny pants, wide leg pants
```

### node 63 — positive — 강태이(예정)

```
masterpiece, best quality, high quality,
semi-realistic portrait of a 2-year-old baby boy, toddler boy,
short soft jet black hair, small natural black eyes, dark black irises,
small realistic eyes, subtle eye highlights,
round cheeks, soft natural baby skin, gentle happy smile, innocent expression,
wearing a cute green dinosaur hooded pajama onesie,
soft green fleece fabric, small dinosaur spikes on the hood and back, tiny dinosaur tail,
sitting on a soft rug in a cozy indoor room,
natural window light, warm atmosphere, shallow depth of field,
realistic proportions, lifelike skin texture, soft shadows,
centered composition, wholesome, adorable
```

### node 64 — negative — 강태이(예정)

```
large eyes, oversized eyes, huge eyes, big anime eyes, doll eyes,
sparkling giant eyes, exaggerated eyes,
blonde hair, brown hair, red hair, blue hair, white hair,
blue eyes, green eyes, brown eyes, gray eyes,
adult, teenager, old face, mature face, female, girl,
anime girl, exaggerated cartoon, chibi,
low quality, worst quality, blurry, out of focus,
bad anatomy, deformed face, distorted eyes,
extra fingers, missing fingers, extra limbs,
creepy, scary, uncanny, doll-like, plastic skin,
wrong outfit, no pajamas, no dinosaur costume,
text, watermark, logo, jpeg artifacts, cropped, multiple people
```

### node 65 — positive — 내사랑(예정)

```
masterpiece, best quality, ultra detailed, anime style, 1girl, solo,
beautiful young woman, elegant East Asian facial features, soft oval face, clear pale skin,
monolid eyes, calm sharp eyes, delicate nose, subtle lips, natural makeup,
black hair, high bun, see-through bangs, wispy bangs, loose side strands,
slender neck, graceful posture, refined atmosphere,
upper body portrait, looking at viewer,
soft lighting, clean background, detailed eyes, smooth shading, cinematic composition
```

### node 66 — negative — 내사랑(예정)

```
low quality, worst quality, bad anatomy, bad hands, extra fingers, missing fingers,
deformed face, asymmetrical eyes, cross-eye, blurry, jpeg artifacts,
messy hair, twin tails, double eyelids, western face, heavy makeup,
old, child, loli, masculine, exaggerated expression,
text, watermark, logo, signature
```
