# Original pixel asset provenance

Generated with the built-in image generation tool for this project on 2026-11-13. No third-party character packs, Codex or DeepSeek characters were copied. The selected UI concept is a visual reference, not an executable UI.

The four PNG atlases live in public/pets and remain unmodified generation outputs. Each atlas is 1536×1024 with four columns (idle, reminder, celebrate, rest) and two rows (two animation frames). Transparent margins are part of the atlas. CSS background positioning selects the state and frame without cropping source files. assets/app-icon.png is the original icon generation; Tauri's icon command creates platform icon formats from it.

## Atlas prompt set

Shared direction: original functional transparent PNG animation sprite atlas; exact1536×1024 canvas, four equal columns and two rows; each384×512 cell contains the same character centered with paws/lower hem at local y400; roughly240×240 footprint; genuine chunky low-resolution pixel art, stepped edges, limited colors, no text or cell borders, no overlap. Column1 idle (open eyes/blink); column2 reminder (alert/raised paw); column3 celebrate (happy arms up/bounce); column4 rest (resting/sleeping). Intended for CSS background-position, not a presentation board.

- Cat: orange striped cat, cream muzzle and chest, dark brown dot eyes, curling striped tail; warm burnt orange, honey orange, pale cream and charcoal. Reminder includes tiny amber exclamation; celebration includes small pixel sparkles.
- Shiba: caramel fur, cream cheeks and belly, triangular ears, curled tail, dark dot eyes and compact proportions. Reminder perks ears/raises paw; celebration smiles and bounces; rest lies down and sleeps. No glow, gradient or 3D rendering.
- Robot: matte blue-gray casing, navy screen, cyan square eyes, tiny antenna and stubby limbs. Reminder changes antenna to amber and waves; celebration raises arms/bounces; rest dims/closes eyes.
- Ghost: soft lavender, violet dot eyes, square blush cheeks, wavy lower hem and little arms. Reminder surprised eyes/wave; celebration smile and small bounce; rest half-closed/sleeping eyes.

## App icon prompt

Use the generated shiba atlas as the identity reference. Create one square macOS app icon for Task Sprite: centered shiba face and upper paws, tiny gold four-point pixel star; warm ivory #fffdf5 edge-to-edge background, no outer rounded mask, no text or letters. Strict chunky square pixel art, burnt orange fur, cream cheeks, dark pixel eyes; generous margins and legible silhouette. Preserve the character identity, not the sheet layout.
