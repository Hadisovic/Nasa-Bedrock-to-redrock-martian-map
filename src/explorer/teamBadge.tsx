import { useId } from "react";

export const teamBadgeUrl = import.meta.env.BASE_URL + "images/martian-map-logo.png";
export const badgeBounds = { x: 120, y: 222, width: 1006, height: 825 };
// The crop follows the supplied badge silhouette while retaining the original 1254 px raster.
export const badgeOutline = "M130 449Q130 389 190 349L374 244Q414 222 456 247L610 326Q624 334 639 326L798 245Q839 222 880 245L1055 345Q1116 380 1116 449V882Q1116 942 1058 981Q1006 1022 944 994L858 952Q831 939 805 954L652 1030Q623 1045 594 1032L442 958Q413 944 386 958L309 995Q239 1021 180 978Q130 941 130 882Z";

export function TeamBadge({ className, width, height, x, y, source = teamBadgeUrl }: {
  className?: string; width?: number; height?: number; x?: number; y?: number; source?: string;
}) {
  const clip = useId();
  const { x: left, y: top, width: w, height: h } = badgeBounds;
  return <svg className={className} width={width} height={height} x={x} y={y} viewBox={`${left} ${top} ${w} ${h}`}
    aria-hidden="true" focusable="false">
    <defs><clipPath id={clip}><path d={badgeOutline} /></clipPath></defs>
    <image href={source} width="1254" height="1254" clipPath={`url(#${clip})`} />
  </svg>;
}
