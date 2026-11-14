import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const svgIcon = (size, isMaskable = false) => {
  const padding = isMaskable ? size * 0.15 : size * 0.08;
  const innerSize = size - padding * 2;
  const rx = isMaskable ? 0 : size * 0.22;

  return `
  <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" rx="${rx}" fill="#0F2744"/>
    <g transform="translate(${padding}, ${padding})">
      <!-- Shield / container -->
      <path d="M ${innerSize * 0.5} ${innerSize * 0.08}
               L ${innerSize * 0.85} ${innerSize * 0.22}
               C ${innerSize * 0.85} ${innerSize * 0.62} ${innerSize * 0.5} ${innerSize * 0.92} ${innerSize * 0.5} ${innerSize * 0.92}
               C ${innerSize * 0.5} ${innerSize * 0.92} ${innerSize * 0.15} ${innerSize * 0.62} ${innerSize * 0.15} ${innerSize * 0.22}
               Z"
            fill="#0F766E" stroke="#14B8A6" stroke-width="${innerSize * 0.03}" />
      
      <!-- Checkmark & Rupee Accent -->
      <path d="M ${innerSize * 0.35} ${innerSize * 0.5}
               L ${innerSize * 0.46} ${innerSize * 0.62}
               L ${innerSize * 0.68} ${innerSize * 0.38}"
            fill="none" stroke="#FFFFFF" stroke-width="${innerSize * 0.06}" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
  </svg>
  `;
};

async function main() {
  const dir = path.resolve("public/icons");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // 192x192
  await sharp(Buffer.from(svgIcon(192, false)))
    .png()
    .toFile(path.join(dir, "icon-192.png"));
  console.log("Generated icon-192.png");

  // 512x512
  await sharp(Buffer.from(svgIcon(512, false)))
    .png()
    .toFile(path.join(dir, "icon-512.png"));
  console.log("Generated icon-512.png");

  // 512x512 maskable (with safe area)
  await sharp(Buffer.from(svgIcon(512, true)))
    .png()
    .toFile(path.join(dir, "icon-maskable.png"));
  console.log("Generated icon-maskable.png");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
