"use client";

interface ParticleDef {
  size: number;
  color: string;
  opacity: number;
  duration: number;
  reverse: boolean;
  delay: number;
}

const SM_PARTICLES: ParticleDef[] = [
  { size: 4, color: "#D4903A", opacity: 0.7, duration: 4, reverse: false, delay: 0 },
  { size: 3, color: "#f5c97a", opacity: 0.5, duration: 6, reverse: true, delay: -2 },
];

const LG_PARTICLES: ParticleDef[] = [
  { size: 6, color: "#D4903A", opacity: 0.7, duration: 5, reverse: false, delay: 0 },
  { size: 4, color: "#f5c97a", opacity: 0.5, duration: 7, reverse: true, delay: -3 },
  { size: 3, color: "#e8b06a", opacity: 0.4, duration: 9, reverse: false, delay: -5 },
];

const CONFIG = {
  sm: {
    imgClass: "h-24 w-auto",
    floatClass: "",
    particles: [],
    orbitRadius: 0,
  },
  lg: {
    imgClass: "h-[120px] w-auto",
    floatClass: "animate-[logo-float-lg_3s_ease-in-out_infinite]",
    particles: LG_PARTICLES,
    orbitRadius: 80,
  },
};

export function AnimatedLogo({ size }: { size: "sm" | "lg" }) {
  const { imgClass, floatClass, particles, orbitRadius } = CONFIG[size];

  return (
    <div className="relative inline-flex flex-shrink-0 overflow-visible">
      <img
        src="/logo.png"
        alt="CtxNest"
        className={`block ${imgClass} object-contain ${floatClass}`}
      />
      {particles.map((p, i) => (
        <span
          key={i}
          className="absolute rounded-full pointer-events-none"
          style={{
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            opacity: p.opacity,
            top: `calc(50% - ${orbitRadius}px)`,
            left: `calc(50% - ${p.size / 2}px)`,
            transformOrigin: `${p.size / 2}px ${orbitRadius}px`,
            animation: `logo-orbit ${p.duration}s linear infinite${p.reverse ? " reverse" : ""}`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
