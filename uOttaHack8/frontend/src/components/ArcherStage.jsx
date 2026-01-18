import Bow1 from "../assets/Bow1.png";
import Bow2 from "../assets/Bow2.png";
import Bow3 from "../assets/Bow3.png";
import Bow4 from "../assets/Bow4.png";
import Bow5 from "../assets/Bow5.png";
import Bow6 from "../assets/Bow6.png";

const BOWS = [Bow1, Bow2, Bow3, Bow4, Bow5, Bow6];
const STEP = 1 / BOWS.length; // ≈ 0.1667

export default function ArcherStage({ certainty = 0 }) {
  // Clamp certainty just in case
  const c = Math.max(0, Math.min(1, certainty));

  // Pick bow based on certainty bucket
  const bowIndex = Math.min(
    BOWS.length - 1,
    Math.floor(c / STEP)
  );

  const bowSrc = BOWS[bowIndex];

  return (
    <div style={styles.stage}>
      {/* Background glow */}
      <div style={styles.bg} />

      {/* Bow visual */}
      <img
        src={bowSrc}
        alt={`Bow level ${bowIndex + 1}`}
        style={{
          ...styles.bow,

          // Draw tension effect (vertical stretch)
          transform: `
            translateX(-200%)
            translateY(-50%)
            scaleY(${0.85 + c * 0.3})
          `,
        }}
      />
    </div>
  );
}

const styles = {
  stage: {
    flex: 1,
    width: "100%",
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  bg: {
    position: "absolute",
    inset: 0,
    background: `
      radial-gradient(
        900px 500px at 50% 30%,
        rgba(255,255,255,0.08),
        transparent 60%
      ),
      linear-gradient(
        180deg,
        rgba(255,255,255,0.04),
        rgba(0,0,0,0)
      )
    `,
    zIndex: 0,
  },

  bow: {
    position: "absolute",
    bottom: "6%",
    left: "50%",

    /* 👇 BASE SIZE (main size control) */
    width: "min(200px, 22vw)",

    pointerEvents: "none",
    transition: "transform 260ms ease, opacity 260ms ease",
    zIndex: 1,
  },
};
