const fs = require('fs');
const path = require('path');
const { Resvg } = require('B:/workgit/flagforge/node_modules/@resvg/resvg-js');

function buildLogoSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <!-- Luxury Squircle Clip -->
    <clipPath id="squircle-clip">
      <rect x="24" y="24" width="976" height="976" rx="220" />
    </clipPath>

    <!-- Electric Cyan Optic & CRDT Convergence Vector -->
    <linearGradient id="cyan-glow" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="40%" stop-color="#00f5ff"/>
      <stop offset="100%" stop-color="#0284c7"/>
    </linearGradient>

    <!-- Falcon Golden Beak Gradient -->
    <linearGradient id="beak-gold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fbbf24"/>
      <stop offset="60%" stop-color="#f59e0b"/>
      <stop offset="100%" stop-color="#d97706"/>
    </linearGradient>

    <!-- Emerald Replication Sync Vector -->
    <linearGradient id="sync-emerald" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#34d399"/>
      <stop offset="60%" stop-color="#10b981"/>
      <stop offset="100%" stop-color="#059669"/>
    </linearGradient>

    <!-- Eye Iris Gradients -->
    <linearGradient id="eye-glow-r" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="40%" stop-color="#00f5ff"/>
      <stop offset="100%" stop-color="#0284c7"/>
    </linearGradient>

    <linearGradient id="eye-glow-l" x1="100%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="40%" stop-color="#00f5ff"/>
      <stop offset="100%" stop-color="#0284c7"/>
    </linearGradient>

    <!-- Volumetric Obsidian & Slate Lighting Gradients -->
    <linearGradient id="g-bright" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#94a3b8"/>
      <stop offset="100%" stop-color="#475569"/>
    </linearGradient>

    <linearGradient id="g-lit" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#64748b"/>
      <stop offset="100%" stop-color="#334155"/>
    </linearGradient>

    <linearGradient id="g-mid-lit" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#475569"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>

    <linearGradient id="g-mid" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#334155"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>

    <linearGradient id="g-shadow" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>

    <linearGradient id="g-dark" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#050811"/>
    </linearGradient>

    <filter id="subtle-shadow" x="-15%" y="-15%" width="130%" height="130%">
      <feDropShadow dx="0" dy="16" stdDeviation="22" flood-color="#000000" flood-opacity="0.16" />
    </filter>
  </defs>

  <!-- Luxury White Squircle Container -->
  <rect x="24" y="24" width="976" height="976" rx="220" fill="#ffffff" stroke="#e2e8f0" stroke-width="6" />

  <g clip-path="url(#squircle-clip)">
    <g transform="translate(512, 512)" filter="url(#subtle-shadow)">

      <!-- Hexagonal Architectural Gateway Frame -->
      <polygon points="
        0,-390
        338,-195
        338,195
        0,390
        -338,195
        -338,-195
      " fill="none" stroke="#0f172a" stroke-width="36" stroke-linejoin="round" />

      <!-- Inner Telemetry Dashed Hexagon (Replication Loom Grid) -->
      <polygon points="
        0,-355
        307,-177
        307,177
        0,355
        -307,177
        -307,-177
      " fill="none" stroke="#00f5ff" stroke-width="4" opacity="0.45" stroke-dasharray="16, 12" />

      <!-- Loom Warp & Weft Telemetry Vectors -->
      <line x1="-307" y1="-177" x2="307" y2="177" stroke="#0284c7" stroke-width="2" opacity="0.25" stroke-dasharray="8, 8" />
      <line x1="-307" y1="177" x2="307" y2="-177" stroke="#0284c7" stroke-width="2" opacity="0.25" stroke-dasharray="8, 8" />
      <line x1="0" y1="-355" x2="0" y2="355" stroke="#00f5ff" stroke-width="2.5" opacity="0.3" stroke-dasharray="10, 10" />

      <!-- 100% Watertight Solid Base Silhouette (Aerodynamic Falcon Wedge) -->
      <path d="
        M 0,-345
        L 45,-310 L 80,-330 L 95,-265 L 145,-280 L 165,-210 L 230,-140 L 295,-30 L 265,75 L 210,185 L 140,265 L 75,320 L 0,355
        L -75,320 L -140,265 L -210,185 L -265,75 L -295,-30 L -230,-140 L -165,-210 L -145,-280 L -95,-265 L -80,-330 L -45,-310
        Z
      " fill="#080c14" />

      <!-- ==================== THE LOOM FALCON MASCOT ==================== -->

      <!-- CROWN CREST: Razor Aerodynamic Feather Tufts -->
      <polygon points="0,-345 35,-275 0,-255" fill="url(#g-bright)" />
      <polygon points="0,-345 -35,-275 0,-255" fill="url(#g-shadow)" />
      <polygon points="0,-345 45,-310 35,-275" fill="url(#g-lit)" />
      <polygon points="0,-345 -45,-310 -35,-275" fill="url(#g-dark)" />

      <!-- Lateral Crest Horns (Right) -->
      <polygon points="45,-310 80,-330 75,-260 35,-275" fill="url(#g-bright)" />
      <polygon points="80,-330 95,-265 75,-260" fill="url(#g-mid-lit)" />
      <polygon points="75,-260 95,-265 145,-280 120,-220 75,-220" fill="url(#g-lit)" />
      <polygon points="145,-280 165,-210 125,-180 120,-220" fill="url(#g-mid-lit)" />

      <!-- Lateral Crest Horns (Left - Shadow) -->
      <polygon points="-45,-310 -80,-330 -75,-260 -35,-275" fill="url(#g-dark)" />
      <polygon points="-80,-330 -95,-265 -75,-260" fill="url(#g-shadow)" />
      <polygon points="-75,-260 -95,-265 -145,-280 -120,-220 -75,-220" fill="url(#g-shadow)" />
      <polygon points="-145,-280 -165,-210 -125,-180 -120,-220" fill="url(#g-dark)" />

      <!-- Cyan Crest Transmitter Vector -->
      <polygon points="0,-255 24,-200 0,-165 -24,-200" fill="url(#cyan-glow)" />
      <polygon points="0,-240 14,-200 0,-175 -14,-200" fill="#ffffff" opacity="0.9" />

      <!-- FOREHEAD & CROWN SHIELD -->
      <polygon points="0,-255 35,-275 75,-220 35,-190 0,-195" fill="url(#g-lit)" />
      <polygon points="0,-255 -35,-275 -75,-220 -35,-190 0,-195" fill="url(#g-shadow)" />
      <polygon points="0,-195 35,-190 55,-135 0,-140" fill="url(#g-bright)" />
      <polygon points="0,-195 -35,-190 -55,-135 0,-140" fill="url(#g-mid)" />

      <!-- SUPRAORBITAL EYEBROW RIDGES (Sharp Predatory Cant) -->
      <!-- Right Ridge (Lit) -->
      <polygon points="0,-140 55,-135 105,-105 45,-90" fill="url(#g-bright)" />
      <polygon points="55,-135 75,-220 120,-220 125,-180 105,-105" fill="url(#g-lit)" />
      <!-- Left Ridge (Shadow) -->
      <polygon points="0,-140 -55,-135 -105,-105 -45,-90" fill="url(#g-shadow)" />
      <polygon points="-55,-135 -75,-220 -120,-220 -125,-180 -105,-105" fill="url(#g-dark)" />

      <!-- PREDATOR EYES: Sharp geometric almond sockets with electric cyan luminescence -->
      <!-- Right Eye Socket Dark Frame -->
      <polygon points="45,-90 105,-105 116,-82 52,-72" fill="#040711" />
      <!-- Right Eye Glowing Iris -->
      <polygon points="50,-87 101,-101 109,-85 58,-75" fill="url(#eye-glow-r)" />
      <!-- Right Pupil -->
      <polygon points="74,-94 82,-93 79,-79 72,-80" fill="#020817" />
      <!-- Right Eye Specular Spark -->
      <polygon points="68,-91 74,-92 72,-85 66,-84" fill="#ffffff" opacity="0.95" />

      <!-- Left Eye Socket Dark Frame -->
      <polygon points="-45,-90 -105,-105 -116,-82 -52,-72" fill="#040711" />
      <!-- Left Eye Glowing Iris -->
      <polygon points="-50,-87 -101,-101 -109,-85 -58,-75" fill="url(#eye-glow-l)" />
      <!-- Left Pupil -->
      <polygon points="-74,-94 -82,-93 -79,-79 -72,-80" fill="#020817" />
      <!-- Left Eye Specular Spark -->
      <polygon points="-68,-91 -74,-92 -72,-85 -66,-84" fill="#ffffff" opacity="0.95" />

      <!-- NOSE BRIDGE & CERE -->
      <polygon points="0,-140 45,-90 32,-35 0,-30" fill="url(#g-lit)" />
      <polygon points="0,-140 -45,-90 -32,-35 0,-30" fill="url(#g-shadow)" />

      <!-- Amber Cere Accent (Base of Beak) -->
      <polygon points="0,-30 32,-35 25,-10 0,-5" fill="url(#beak-gold)" />
      <polygon points="0,-30 -32,-35 -25,-10 0,-5" fill="url(#beak-gold)" opacity="0.8" />

      <!-- CHISELED HOOKED RAPTOR BEAK (Precision Data Needle) -->
      <!-- Right Upper Beak Flange -->
      <polygon points="0,-5 25,-10 28,55 0,90" fill="url(#g-bright)" />
      <!-- Left Upper Beak Flange -->
      <polygon points="0,-5 -25,-10 -28,55 0,90" fill="url(#g-mid)" />
      <!-- Hooked Tip (Curving Downward to Sharp Point) -->
      <polygon points="0,90 28,55 16,130 0,160" fill="url(#g-lit)" />
      <polygon points="0,90 -28,55 -16,130 0,160" fill="#050811" />
      <!-- Golden Tomial Tooth Accent (Falcon Signature Mark) -->
      <polygon points="0,135 10,140 0,160 -10,140" fill="url(#beak-gold)" />

      <!-- FALCON MALAR STRIPES (Obsidian Tear Lines / Cheek Armour) -->
      <!-- Right Cheek & Malar Stripe -->
      <polygon points="105,-105 125,-180 165,-210 230,-140 185,-55 116,-82" fill="url(#g-mid-lit)" />
      <polygon points="116,-82 185,-55 155,25 85,-20 52,-72" fill="url(#g-lit)" />
      <polygon points="32,-35 85,-20 75,55 28,55" fill="url(#g-bright)" />
      <polygon points="85,-20 155,25 130,110 75,55" fill="url(#g-mid-lit)" />

      <!-- Left Cheek & Malar Stripe (Shadow Side) -->
      <polygon points="-105,-105 -125,-180 -165,-210 -230,-140 -185,-55 -116,-82" fill="url(#g-dark)" />
      <polygon points="-116,-82 -185,-55 -155,25 -85,-20 -52,-72" fill="url(#g-shadow)" />
      <polygon points="-32,-35 -85,-20 -75,55 -28,55" fill="url(#g-dark)" />
      <polygon points="-85,-20 -155,25 -130,110 -75,55" fill="url(#g-shadow)" />

      <!-- SWEPT WING COVERTS & SHOULDER PLATES (85% Hex Mass) -->
      <!-- Right Wing Outer Coverts -->
      <polygon points="230,-140 295,-30 225,35 185,-55" fill="url(#g-bright)" />
      <polygon points="295,-30 265,75 210,115 225,35" fill="url(#g-lit)" />
      <polygon points="265,75 210,185 160,180 210,115" fill="url(#g-mid-lit)" />
      <polygon points="210,185 140,265 105,225 160,180" fill="url(#g-lit)" />

      <!-- Left Wing Outer Coverts (Shadow Side) -->
      <polygon points="-230,-140 -295,-30 -225,35 -185,-55" fill="url(#g-shadow)" />
      <polygon points="-295,-30 -265,75 -210,115 -225,35" fill="url(#g-dark)" />
      <polygon points="-265,75 -210,185 -160,180 -210,115" fill="url(#g-shadow)" />
      <polygon points="-210,185 -140,265 -105,225 -160,180" fill="url(#g-dark)" />

      <!-- CHEST & CENTRAL CRDT CONVERGENCE EMBLEM -->
      <!-- Throat Armour -->
      <polygon points="0,160 16,130 75,55 55,150 0,175" fill="url(#g-lit)" />
      <polygon points="0,160 -16,130 -75,55 -55,150 0,175" fill="url(#g-shadow)" />

      <!-- Central CRDT Core Singularity (Monotonic Clock Heart) -->
      <polygon points="0,175 52,225 0,275 -52,225" fill="url(#cyan-glow)" />
      <polygon points="0,188 36,225 0,262 -36,225" fill="#090d16" />
      <polygon points="0,202 20,225 0,248 -20,225" fill="url(#sync-emerald)" />
      <polygon points="0,212 9,225 0,236 -9,225" fill="#ffffff" />

      <!-- Pectoral Flanges -->
      <polygon points="52,225 105,225 65,290 0,275" fill="url(#g-lit)" />
      <polygon points="-52,225 -105,225 -65,290 0,275" fill="url(#g-shadow)" />
      <polygon points="105,225 140,265 75,320 65,290" fill="url(#g-bright)" />
      <polygon points="-105,225 -140,265 -75,320 -65,290" fill="url(#g-dark)" />

      <!-- Keel Apex (Base Anchor) -->
      <polygon points="0,275 65,290 75,320 0,355" fill="url(#g-mid-lit)" />
      <polygon points="0,275 -65,290 -75,320 0,355" fill="url(#g-dark)" />

    </g>
  </g>
</svg>`;
}

async function main() {
  const svg = buildLogoSvg();
  const docsDir = path.join(__dirname, '..', 'docs', 'images');
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }

  const svgPath = path.join(docsDir, 'logo.svg');
  const pngPath = path.join(docsDir, 'logo.png');

  fs.writeFileSync(svgPath, svg, 'utf8');
  console.log('Saved SVG to:', svgPath);

  const resvg = new Resvg(svg, {
    fitTo: {
      mode: 'width',
      value: 1024,
    },
  });

  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();
  fs.writeFileSync(pngPath, pngBuffer);
  console.log('Rendered and saved PNG to:', pngPath, 'Size:', pngBuffer.length, 'bytes');
}

main().catch(console.error);
