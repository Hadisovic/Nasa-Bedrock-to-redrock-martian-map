import { useRef } from "react";

const sources = [
  ["NASA Mars Trek", "Global basemap and orbital layers", "https://trek.nasa.gov/mars/"],
  ["USGS Jezero terrain", "HiRISE imagery and elevation for detailed routes", "https://astrogeology.usgs.gov/search/map/mars-2020-jezero-crater-landing-site-products"],
  ["USGS western Jezero mosaic", "Candidate for new coverage: HiRISE terrain, imagery and confidence data", "https://www.usgs.gov/data/mars-sample-return-hirise-mosaics-terrain-relative-navigation"],
  ["USGS Gale terrain", "Elevation around Mount Sharp", "https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m"],
  ["NASA Perseverance images", "Rover imagery and discovery context", "https://science.nasa.gov/mission/mars-2020-perseverance/mars-2020-raw-images/"],
  ["NASA Mars24", "Mars solar time and daylight", "https://www.giss.nasa.gov/tools/mars24/help/algorithm.html"],
];

export function Resources() {
  const dialog = useRef<HTMLDialogElement>(null);
  return <footer className="project-footer">
    <button type="button" onClick={() => dialog.current?.showModal()}>Contact &amp; resources</button>
    <dialog ref={dialog} className="project-dialog" aria-label="Contact and resources">
      <form method="dialog"><button className="btn btn--small">Close</button></form>
      <h2>Contact</h2>
      <p>Bedrock to Redrock · Irbid, Jordan. Team emails will be added here.</p>
      <h2>Resources</h2>
      <ul>{sources.map(([name, use, url]) => <li key={url}><a href={url} target="_blank" rel="noreferrer">{name}</a><br />{use}</li>)}</ul>
    </dialog>
  </footer>;
}
