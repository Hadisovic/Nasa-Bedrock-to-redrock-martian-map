// Set this to an approved asset path under public/ after the team verifies the planned use.
const approved = import.meta.env.VITE_APPROVED_NASA_INSIGNIA as string | undefined;
export const nasaInsignia = approved && /^[\w-]+(?:\/[\w-]+)*(?:\.local)?\.svg$/i.test(approved)
  ? import.meta.env.BASE_URL + approved : null;
export const explorerBadge = nasaInsignia ?? import.meta.env.BASE_URL + "images/martian-map-logo.png";
