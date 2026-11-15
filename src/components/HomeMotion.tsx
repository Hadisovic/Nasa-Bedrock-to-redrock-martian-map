import { useEffect, useRef } from "react";

// Bright points in the supplied reference artwork, normalized to its 4:3 frame.
const stars = [
  [.022, .146, 1.8, 0.4, 6.7], [.105, .202, 1.2, 3.9, 8.2], [.142, .039, 1.4, 1.5, 7.3],
  [.240, .101, 1.8, 3.0, 9.1], [.296, .135, 1.4, 2.3, 6.5], [.289, .117, 1.1, 0.9, 8.6],
  [.386, .153, 1.7, 4.4, 7.8], [.526, .230, 3.5, 0.6, 8.4], [.681, .079, 1.5, 5.2, 9.7],
  [.780, .074, 2.1, 2.9, 7.4], [.959, .123, 3.2, 4.3, 9.3], [.971, .236, 2.8, 0.2, 10.4],
] as const;

/** Animate small regions of the supplied artwork without animating its typography or framing. */
export function HomeMotion() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const layer = canvas.current;
    if (!layer) return;
    const art = layer.parentElement?.querySelector<HTMLImageElement>(".mission-home__art");
    const ctx = layer.getContext("2d");
    if (!ctx || !art) return;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0, last = 0, hadFrame = false;
    const clips = [
      { x: .412, y: .296, w: .151, h: .323, d: 0 },
      { x: .78, y: .175, w: .21, h: .365, d: 1.4 },
    ];
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (preference.matches || document.hidden) {
        if (hadFrame) { ctx.clearRect(0, 0, layer.width, layer.height); hadFrame = false; }
        return;
      }
      if (!art.complete || !art.naturalWidth || now - last < 32) return;
      last = now;
      const w = layer.clientWidth, h = layer.clientHeight;
      if (!w || !h) return;
      if (layer.width !== w || layer.height !== h) { layer.width = w; layer.height = h; }
      ctx.clearRect(0, 0, w, h);
      hadFrame = true;
      const scale = Math.max(w / art.naturalWidth, h / art.naturalHeight);
      const iw = art.naturalWidth * scale, ih = art.naturalHeight * scale;
      const position = getComputedStyle(art).objectPosition.split(" ").map((v) => Number.parseFloat(v) / 100);
      const ox = (w - iw) * position[0], oy = (h - ih) * position[1];
      for (const { x, y, w: cw, h: ch, d } of clips) {
        const px = ox + x * iw, py = oy + y * ih, pw = cw * iw, ph = ch * ih;
        const dy = Math.sin(now / 950 + d) * 2.2, dx = Math.sin(now / 1300 + d) * .8;
        ctx.save();
        ctx.beginPath(); ctx.ellipse(px + pw / 2, py + ph / 2, pw / 2, ph / 2, 0, 0, 2 * Math.PI); ctx.clip();
        ctx.globalAlpha = .7;
        ctx.drawImage(art, (x - .005) * art.naturalWidth, (y - .005) * art.naturalHeight,
          (cw + .01) * art.naturalWidth, (ch + .01) * art.naturalHeight,
          px - .005 * iw + dx, py - .005 * ih + dy, pw + .01 * iw, ph + .01 * ih);
        ctx.restore();
      }
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      for (const [x, y, size, delay, period] of stars) {
        const phase = ((now / 1000 + delay) % period) / period;
        const twinkle = .17 + .83 * Math.pow(Math.max(0, Math.sin(Math.PI * phase)), 8);
        const px = ox + iw * x, py = oy + ih * y;
        const radius = (size * 2.4 + 1) * Math.max(.85, Math.min(1.5, iw / 850));
        if (px < -radius || px > w + radius || py < -radius || py > h + radius) continue;
        const glow = ctx.createRadialGradient(px, py, 0, px, py, radius);
        glow.addColorStop(0, `rgba(240, 250, 255, ${twinkle * .8})`);
        glow.addColorStop(.27, `rgba(132, 205, 255, ${twinkle * .32})`);
        glow.addColorStop(1, "rgba(78, 144, 255, 0)");
        ctx.fillStyle = glow;
        ctx.fillRect(px - radius, py - radius, radius * 2, radius * 2);
        if (size >= 2.8) {
          ctx.strokeStyle = `rgba(207, 237, 255, ${twinkle * .53})`;
          ctx.lineWidth = .65;
          ctx.beginPath();
          ctx.moveTo(px - radius * .85, py); ctx.lineTo(px + radius * .85, py);
          ctx.moveTo(px, py - radius * 1.1); ctx.lineTo(px, py + radius * 1.1);
          ctx.stroke();
        }
      }
      ctx.restore();
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);
  return <canvas ref={canvas} className="mission-home__motion" aria-hidden="true" />;
}
