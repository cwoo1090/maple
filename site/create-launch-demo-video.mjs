import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const siteDir = dirname(fileURLToPath(import.meta.url));
const assetsDir = join(siteDir, "assets");
const tmpDir = join(siteDir, ".video-tmp");
const outPath = join(assetsDir, "maple-launch-demo.mp4");
const posterPath = join(assetsDir, "maple-launch-demo-poster.jpg");
const font = "/System/Library/Fonts/SFNS.ttf";

const width = 1920;
const height = 1080;
const fps = 30;
const icon = join(assetsDir, "maple-icon.png");

const scenes = [
  {
    kind: "title",
    duration: 4.5,
    kicker: "LOCAL AI WIKI BUILDER",
    title: "Maple",
    body: "Turn PDFs, notes, links, and research scraps into a local wiki you can review and keep on your Mac.",
  },
  {
    image: "maple-workspace-explore.png",
    duration: 6,
    kicker: "1. CREATE A WORKSPACE",
    title: "Start with one topic",
    body: "A course, research project, archive, or skill path becomes a local Maple workspace.",
  },
  {
    image: "maple-guide-sources.png",
    duration: 6,
    kicker: "2. IMPORT SOURCES",
    title: "Bring in the raw material",
    body: "Add PDFs, notes, transcripts, screenshots, papers, and captured links without rewriting the originals.",
  },
  {
    image: "maple-update-wiki-modal.png",
    duration: 6,
    kicker: "3. BUILD WITH AI",
    title: "Use your ChatGPT/Codex subscription",
    body: "Maple asks AI to compile sources into summaries, concept pages, guides, links, and logs.",
  },
  {
    image: "maple-guide-generated-page.png",
    duration: 6,
    kicker: "4. REVIEW THE WIKI",
    title: "Read the generated pages",
    body: "The wiki becomes the working layer: structured, linked, and easier to revisit than a chat thread.",
  },
  {
    image: "maple-guide-chat.png",
    duration: 6,
    kicker: "5. EXPLORE",
    title: "Ask questions safely",
    body: "Explore Chat is read-only by default, so normal questions do not silently change your files.",
  },
  {
    image: "maple-guide-review.png",
    duration: 6,
    kicker: "6. APPLY WHAT MATTERS",
    title: "Keep useful answers",
    body: "Turn selected explanations into reviewable wiki edits when they are worth saving.",
  },
  {
    image: "maple-guide-maintain.png",
    duration: 6,
    kicker: "7. MAINTAIN",
    title: "Improve the archive over time",
    body: "Run healthchecks, improve pages, organize sources, and update durable workspace rules.",
  },
  {
    kind: "end",
    duration: 4.5,
    kicker: "MAPLE FOR MACOS",
    title: "Build your local AI wiki",
    body: "Download Maple and turn your next pile of learning material into something you can actually explore.",
  },
];

function ffmpeg(args) {
  const result = spawnSync("ffmpeg", ["-hide_banner", "-y", ...args], {
    cwd: siteDir,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed with status ${result.status}`);
  }
}

function textFile(name, value) {
  const path = join(tmpDir, name);
  writeFileSync(path, value);
  return path;
}

function drawText({ file, size, color, x, y, extra = "" }) {
  return `drawtext=fontfile='${font}':textfile='${file}':fontsize=${size}:fontcolor=${color}:x=${x}:y=${y}:line_spacing=8${extra}`;
}

function makeTitleScene(scene, index, output) {
  const duration = scene.duration;
  const kickerFile = textFile(`${index}-kicker.txt`, scene.kicker);
  const titleFile = textFile(`${index}-title.txt`, scene.title);
  const bodyFile = textFile(`${index}-body.txt`, scene.body);

  const filter = [
    `[1:v]scale=112:112[icon]`,
    `[0:v][icon]overlay=x=150:y=156[base]`,
    `[base]drawbox=x=118:y=118:w=1684:h=844:color=0xffffff@0.62:t=fill[card]`,
    `[card]${drawText({ file: kickerFile, size: 31, color: "0xb93e17", x: 150, y: 310 })}[a]`,
    `[a]${drawText({ file: titleFile, size: 116, color: "0x1f1a12", x: 145, y: 365 })}[b]`,
    `[b]${drawText({ file: bodyFile, size: 42, color: "0x5c5447", x: 150, y: 522 })}[c]`,
    `[c]drawbox=x=150:y=740:w=300:h=56:color=0xe04e1a@1:t=fill[d]`,
    `[d]drawtext=fontfile='${font}':text='Download for macOS':fontsize=29:fontcolor=0xfffaf6:x=177:y=753[e]`,
    `[e]fade=t=in:st=0:d=0.35,fade=t=out:st=${duration - 0.35}:d=0.35,format=yuv420p[v]`,
  ].join(";");

  ffmpeg([
    "-f",
    "lavfi",
    "-i",
    `color=c=0xfbfaf6:s=${width}x${height}:r=${fps}:d=${duration}`,
    "-loop",
    "1",
    "-t",
    String(duration),
    "-i",
    icon,
    "-filter_complex",
    filter,
    "-map",
    "[v]",
    "-t",
    String(duration),
    "-r",
    String(fps),
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "19",
    "-pix_fmt",
    "yuv420p",
    output,
  ]);
}

function makeImageScene(scene, index, output) {
  const duration = scene.duration;
  const frames = Math.round(duration * fps);
  const source = join(assetsDir, scene.image);
  const kickerFile = textFile(`${index}-kicker.txt`, scene.kicker);
  const titleFile = textFile(`${index}-title.txt`, scene.title);
  const bodyFile = textFile(`${index}-body.txt`, scene.body);

  const filter = [
    `[0:v]scale=1540:760:force_original_aspect_ratio=decrease,pad=1540:760:(ow-iw)/2:(oh-ih)/2:color=0xffffff,setsar=1,zoompan=z='min(zoom+0.00075,1.055)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1540x760:fps=${fps}[shot]`,
    `[1:v]scale=40:40[icon]`,
    `color=c=0xfbfaf6:s=${width}x${height}:r=${fps}:d=${duration}[base]`,
    `[base]drawbox=x=185:y=55:w=1550:h=770:color=0xd4cdb9@1:t=fill[frame]`,
    `[frame][shot]overlay=x=190:y=60[withshot]`,
    `[withshot]drawbox=x=120:y=842:w=1680:h=174:color=0xffffff@0.96:t=fill[caption]`,
    `[caption][icon]overlay=x=144:y=866[brand]`,
    `[brand]${drawText({ file: kickerFile, size: 25, color: "0xb93e17", x: 198, y: 863 })}[a]`,
    `[a]${drawText({ file: titleFile, size: 43, color: "0x1f1a12", x: 144, y: 905 })}[b]`,
    `[b]${drawText({ file: bodyFile, size: 27, color: "0x5c5447", x: 625, y: 887 })}[c]`,
    `[c]fade=t=in:st=0:d=0.35,fade=t=out:st=${duration - 0.35}:d=0.35,format=yuv420p[v]`,
  ].join(";");

  ffmpeg([
    "-loop",
    "1",
    "-t",
    String(duration),
    "-i",
    source,
    "-loop",
    "1",
    "-t",
    String(duration),
    "-i",
    icon,
    "-filter_complex",
    filter,
    "-map",
    "[v]",
    "-t",
    String(duration),
    "-r",
    String(fps),
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "19",
    "-pix_fmt",
    "yuv420p",
    output,
  ]);
}

rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });

const segmentPaths = scenes.map((_, index) => join(tmpDir, `segment-${String(index).padStart(2, "0")}.mp4`));

scenes.forEach((scene, index) => {
  if (scene.kind === "title" || scene.kind === "end") {
    makeTitleScene(scene, index, segmentPaths[index]);
  } else {
    makeImageScene(scene, index, segmentPaths[index]);
  }
});

const concatList = segmentPaths
  .map((segment) => `file '${resolve(segment).replaceAll("'", "'\\''")}'`)
  .join("\n");
const concatPath = join(tmpDir, "concat.txt");
writeFileSync(concatPath, concatList);

ffmpeg([
  "-f",
  "concat",
  "-safe",
  "0",
  "-i",
  concatPath,
  "-c:v",
  "libx264",
  "-preset",
  "medium",
  "-crf",
  "20",
  "-pix_fmt",
  "yuv420p",
  "-movflags",
  "+faststart",
  outPath,
]);

ffmpeg([
  "-ss",
  "1",
  "-i",
  outPath,
  "-frames:v",
  "1",
  "-update",
  "1",
  "-q:v",
  "2",
  posterPath,
]);

rmSync(tmpDir, { recursive: true, force: true });

console.log(`Created ${outPath}`);
console.log(`Created ${posterPath}`);
