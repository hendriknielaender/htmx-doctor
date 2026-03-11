import { ImageResponse } from "next/og";

const PERFECT_SCORE = 100;
const SCORE_GOOD_THRESHOLD = 75;
const SCORE_OK_THRESHOLD = 50;
const IMAGE_WIDTH_PX = 1200;
const IMAGE_HEIGHT_PX = 630;
const BRAND_ICON_SIZE_PX = 42;
const BRAND_ICON_PATH = "/favicon.png";

const getScoreLabel = (score: number): string => {
  if (score >= SCORE_GOOD_THRESHOLD) return "Great";
  if (score >= SCORE_OK_THRESHOLD) return "Needs work";
  return "Critical";
};

const getScoreColor = (score: number): string => {
  if (score >= SCORE_GOOD_THRESHOLD) return "#4ade80";
  if (score >= SCORE_OK_THRESHOLD) return "#eab308";
  return "#f87171";
};

export const GET = (request: Request): ImageResponse => {
  const { searchParams } = new URL(request.url);

  const projectName = searchParams.get("p") ?? null;
  const score = Math.max(0, Math.min(PERFECT_SCORE, Number(searchParams.get("s")) || 0));
  const errorCount = Math.max(0, Number(searchParams.get("e")) || 0);
  const warningCount = Math.max(0, Number(searchParams.get("w")) || 0);
  const fileCount = Math.max(0, Number(searchParams.get("f")) || 0);
  const scoreColor = getScoreColor(score);
  const brandIconUrl = new URL(BRAND_ICON_PATH, request.url).toString();
  const scoreBarPercent = (score / PERFECT_SCORE) * 100;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#0a0a0a",
        fontFamily: "monospace",
        padding: "60px 80px",
        justifyContent: "center",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
        <div
          style={{
            width: `${BRAND_ICON_SIZE_PX}px`,
            height: `${BRAND_ICON_SIZE_PX}px`,
            backgroundImage: `url(${brandIconUrl})`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "center",
            backgroundSize: "contain",
            flexShrink: 0,
          }}
        />
        <div style={{ display: "flex", color: "#f5f5f5", fontSize: "34px", fontWeight: 700 }}>
          HTMX Doctor
        </div>
        {projectName && (
          <div
            style={{
              display: "flex",
              marginLeft: "auto",
              fontSize: "24px",
              color: "#a3a3a3",
            }}
          >
            {projectName}
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: "16px", marginTop: "48px" }}>
        <span style={{ fontSize: "120px", color: scoreColor, fontWeight: 700, lineHeight: 1 }}>
          {score}
        </span>
        <span style={{ fontSize: "40px", color: "#525252", lineHeight: 1 }}>/ {PERFECT_SCORE}</span>
        <span style={{ fontSize: "40px", color: scoreColor, lineHeight: 1, marginLeft: "8px" }}>
          {getScoreLabel(score)}
        </span>
      </div>

      <div
        style={{
          display: "flex",
          width: "100%",
          height: "16px",
          backgroundColor: "#1a1a1a",
          borderRadius: "8px",
          marginTop: "32px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${scoreBarPercent}%`,
            height: "100%",
            backgroundColor: scoreColor,
            borderRadius: "8px",
          }}
        />
      </div>

      {(errorCount > 0 || warningCount > 0 || fileCount > 0) && (
        <div style={{ display: "flex", gap: "24px", marginTop: "36px", fontSize: "24px" }}>
          {errorCount > 0 && (
            <span style={{ color: "#f87171" }}>
              {errorCount} error{errorCount === 1 ? "" : "s"}
            </span>
          )}
          {warningCount > 0 && (
            <span style={{ color: "#eab308" }}>
              {warningCount} warning{warningCount === 1 ? "" : "s"}
            </span>
          )}
          {fileCount > 0 && (
            <span style={{ color: "#737373" }}>
              across {fileCount} file{fileCount === 1 ? "" : "s"}
            </span>
          )}
        </div>
      )}
    </div>,
    { width: IMAGE_WIDTH_PX, height: IMAGE_HEIGHT_PX },
  );
};
