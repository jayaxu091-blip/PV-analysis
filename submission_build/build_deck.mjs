import fs from "node:fs/promises";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const OUT = "C:/Users/jayax/OneDrive/Desktop/pole vault tracker/VaultLab_Presentation.pptx";
const PREVIEW_DIR = "C:/Users/jayax/OneDrive/Desktop/pole vault tracker/deck_render";

const W = 1280;
const H = 720;
const colors = {
  ink: "#111827",
  muted: "#4B5563",
  panel: "#EEF2F1",
  line: "#CBD5D1",
  teal: "#0F766E",
  blue: "#2563EB",
  gold: "#D99D25",
  red: "#B93838",
  white: "#FFFFFF",
};

async function writeBlob(path, blob) {
  await fs.writeFile(path, new Uint8Array(await blob.arrayBuffer()));
}

function box(slide, left, top, width, height, fill = colors.panel, line = colors.line) {
  return slide.shapes.add({
    geometry: "rect",
    position: { left, top, width, height },
    fill,
    line: { style: "solid", fill: line, width: 1 },
  });
}

function text(slide, value, left, top, width, height, style = {}) {
  const shape = slide.shapes.add({
    geometry: "textbox",
    position: { left, top, width, height },
    fill: "none",
    line: { style: "solid", fill: "none", width: 0 },
  });
  shape.text = value;
  shape.text.style = {
    fontSize: style.fontSize || 24,
    bold: Boolean(style.bold),
    color: style.color || colors.ink,
    alignment: style.alignment || "left",
  };
  return shape;
}

function title(slide, value, subtitle = "") {
  text(slide, value, 72, 54, 940, 92, { fontSize: 42, bold: true });
  if (subtitle) text(slide, subtitle, 74, 142, 850, 46, { fontSize: 20, color: colors.muted });
  slide.shapes.add({
    geometry: "rect",
    position: { left: 72, top: 202, width: 140, height: 5 },
    fill: colors.gold,
    line: { style: "solid", fill: colors.gold, width: 0 },
  });
}

function footer(slide, number) {
  text(slide, `VaultLab | ${number}`, 1050, 662, 160, 24, { fontSize: 14, color: "#6B7280", alignment: "right" });
}

function bullets(slide, items, left, top, width, fontSize = 24, gap = 56) {
  items.forEach((item, index) => {
    slide.shapes.add({
      geometry: "ellipse",
      position: { left, top: top + index * gap + 9, width: 10, height: 10 },
      fill: colors.teal,
      line: { style: "solid", fill: colors.teal, width: 0 },
    });
    text(slide, item, left + 26, top + index * gap, width - 26, 44, { fontSize });
  });
}

function notes(slide, lines) {
  slide.speakerNotes.textFrame.setText(lines);
  slide.speakerNotes.setVisible(true);
}

function addMetric(slide, label, value, left, top, width = 250) {
  box(slide, left, top, width, 112, colors.white, colors.line);
  text(slide, value, left + 18, top + 18, width - 36, 40, { fontSize: 32, bold: true, color: colors.teal });
  text(slide, label, left + 18, top + 64, width - 36, 28, { fontSize: 17, color: colors.muted });
}

const deck = Presentation.create({ slideSize: { width: W, height: H } });

// 1
{
  const slide = deck.slides.add();
  slide.background.fill = colors.white;
  text(slide, "What if every vault video became data?", 76, 82, 850, 150, { fontSize: 56, bold: true });
  text(slide, "VaultLab uses pose estimation and interpretable machine learning to help pole vaulters understand technique.", 80, 266, 760, 90, { fontSize: 26, color: colors.muted });
  box(slide, 910, 84, 270, 470, "#10231F", "#10231F");
  text(slide, "VL", 960, 168, 170, 90, { fontSize: 72, bold: true, color: "#8FD6C9", alignment: "center" });
  text(slide, "AI video analysis\nfor pole vault", 940, 312, 210, 96, { fontSize: 26, color: colors.white, alignment: "center" });
  text(slide, "STEM Research & Innovation", 80, 612, 520, 30, { fontSize: 20, color: colors.muted });
  footer(slide, 1);
  notes(slide, [
    "[Sources] Project prototype and author research notes.",
    "Opening hook: a normal phone video can become measurable technique data.",
  ]);
}

// 2
{
  const slide = deck.slides.add();
  slide.background.fill = colors.white;
  title(slide, "Young athletes get video, but not measurements");
  bullets(slide, [
    "Coaching feedback is often visual and subjective.",
    "Biomechanical tools can be expensive or hard to access.",
    "Pole vault happens too fast to judge every phase by eye.",
  ], 92, 258, 760, 28, 72);
  addMetric(slide, "Core problem", "Access", 920, 262);
  addMetric(slide, "Target user", "Athletes", 920, 402);
  footer(slide, 2);
  notes(slide, [
    "[Sources] User project goals and competition description.",
    "Problem framing emphasizes accessibility and objectivity.",
  ]);
}

// 3
{
  const slide = deck.slides.add();
  slide.background.fill = colors.white;
  title(slide, "Research question: which variables predict success?");
  text(slide, "Can computer vision extract pole-vault technique variables from video and use them to predict whether a jump is a make or miss?", 92, 250, 980, 120, { fontSize: 32, bold: true });
  box(slide, 92, 430, 1000, 94, "#EEF5FF", "#C7D2FE");
  text(slide, "Planned model: logistic regression because the target label is binary: make or miss.", 122, 460, 930, 38, { fontSize: 25, color: colors.ink });
  footer(slide, 3);
  notes(slide, [
    "[Sources] scikit-learn LogisticRegression documentation; project methodology.",
    "Logistic regression is interpretable through feature coefficients.",
  ]);
}

// 4
{
  const slide = deck.slides.add();
  slide.background.fill = colors.white;
  title(slide, "The system turns video into a research dataset");
  const y = 280;
  const steps = ["Video", "Pose", "Metrics", "Dataset", "Prediction"];
  steps.forEach((step, i) => {
    const left = 82 + i * 230;
    box(slide, left, y, 170, 96, i === 0 ? "#E6FAF7" : colors.panel, colors.line);
    text(slide, step, left + 14, y + 30, 142, 36, { fontSize: 28, bold: true, alignment: "center" });
    if (i < steps.length - 1) {
      text(slide, ">", left + 184, y + 28, 40, 40, { fontSize: 34, bold: true, color: colors.gold, alignment: "center" });
    }
  });
  bullets(slide, [
    "Pose landmarks locate shoulders, hips, knees, and ankles.",
    "VaultLab estimates takeoff, inversion, clearance, and speed.",
    "Each saved attempt becomes one labeled model row.",
  ], 128, 450, 920, 22, 48);
  footer(slide, 4);
  notes(slide, [
    "[Sources] Google MediaPipe Pose Landmarker documentation; VaultLab source code.",
  ]);
}

// 5
{
  const slide = deck.slides.add();
  slide.background.fill = colors.white;
  title(slide, "VaultLab measures the variables coaches care about");
  const cols = [
    ["Approach", "distance / time", "speed"],
    ["Takeoff", "body line angle", "timing"],
    ["Inversion", "shoulder-hip-ankle", "swing quality"],
    ["Clearance", "bar result", "make/miss"],
  ];
  cols.forEach((c, i) => {
    const left = 80 + i * 292;
    box(slide, left, 250, 242, 230, colors.white, colors.line);
    text(slide, c[0], left + 20, 280, 200, 34, { fontSize: 29, bold: true, color: colors.teal });
    text(slide, c[1], left + 20, 338, 196, 40, { fontSize: 22 });
    text(slide, c[2], left + 20, 410, 196, 34, { fontSize: 20, color: colors.muted });
  });
  footer(slide, 5);
  notes(slide, [
    "[Sources] Linthorne et al. 2012; author research map; VaultLab metrics.",
  ]);
}

// 6
{
  const slide = deck.slides.add();
  slide.background.fill = colors.white;
  title(slide, "The prototype is already live and demo-ready");
  bullets(slide, [
    "React + Vite + TypeScript web app hosted on Firebase.",
    "Firebase sign-in plus demo mode for judges.",
    "Full-video pose analysis with skeleton overlay.",
    "Attempt log, CSV export, and research-readiness panel.",
  ], 90, 236, 850, 25, 62);
  box(slide, 910, 254, 240, 150, "#10231F", "#10231F");
  text(slide, "Live app", 940, 292, 180, 28, { fontSize: 23, bold: true, color: "#8FD6C9", alignment: "center" });
  text(slide, "pvanalysis-68252.web.app", 934, 340, 190, 42, { fontSize: 17, color: colors.white, alignment: "center" });
  footer(slide, 6);
  notes(slide, [
    "[Sources] Firebase Hosting deployment; VaultLab GitHub repository.",
  ]);
}

// 7
{
  const slide = deck.slides.add();
  slide.background.fill = colors.white;
  title(slide, "Early result: the honest prototype is more valuable");
  text(slide, "Single-camera pose estimates are useful, but not perfect.", 92, 245, 760, 56, { fontSize: 34, bold: true });
  bullets(slide, [
    "Motion blur and occlusion can reduce landmark quality.",
    "Inverted poses are difficult for general pose models.",
    "The app reports estimates and keeps reviewable phase markers.",
  ], 116, 342, 820, 23, 54);
  addMetric(slide, "Prototype principle", "Estimated", 920, 292);
  footer(slide, 7);
  notes(slide, [
    "[Sources] Bissas & Cronin 2026; author research notes.",
    "This slide prevents overclaiming and makes the project sound scientifically mature.",
  ]);
}

// 8
{
  const slide = deck.slides.add();
  slide.background.fill = colors.white;
  title(slide, "The innovation is interpretable AI coaching");
  bullets(slide, [
    "Not just video review: structured variables are extracted.",
    "Not just prediction: coefficients can explain which factors matter.",
    "Not just a model: feedback is returned to the athlete.",
  ], 100, 252, 900, 28, 72);
  box(slide, 100, 526, 920, 72, "#FFF8E6", "#EAD5A7");
  text(slide, "Main innovation: accessible pole-vault biomechanics from ordinary athlete video.", 128, 546, 860, 32, { fontSize: 25, bold: true });
  footer(slide, 8);
  notes(slide, [
    "[Sources] Project objective and app implementation.",
  ]);
}

// 9
{
  const slide = deck.slides.add();
  slide.background.fill = colors.white;
  title(slide, "Next milestone: validate the model with real attempts");
  bullets(slide, [
    "Collect 30-50 labeled vault attempts.",
    "Train logistic regression on exported CSV data.",
    "Report accuracy and most influential variables.",
    "Upgrade pose model with YOLO Pose or RTMPose backend.",
  ], 90, 238, 860, 25, 62);
  addMetric(slide, "Submission status", "Ready", 920, 285);
  addMetric(slide, "Future model", "YOLO / RTMPose", 920, 425);
  footer(slide, 9);
  notes(slide, [
    "[Sources] Project roadmap; scikit-learn LogisticRegression documentation; author research map.",
  ]);
}

await fs.mkdir(PREVIEW_DIR, { recursive: true });
for (const [index, slide] of deck.slides.items.entries()) {
  const stem = `slide-${String(index + 1).padStart(2, "0")}`;
  await writeBlob(`${PREVIEW_DIR}/${stem}.png`, await deck.export({ slide, format: "png", scale: 1 }));
  const layout = await slide.export({ format: "layout" });
  await fs.writeFile(`${PREVIEW_DIR}/${stem}.layout.json`, await layout.text());
}
await writeBlob(`${PREVIEW_DIR}/deck-montage.webp`, await deck.export({ format: "webp", montage: true, scale: 1 }));

const pptx = await PresentationFile.exportPptx(deck);
await pptx.save(OUT);
console.log(OUT);
