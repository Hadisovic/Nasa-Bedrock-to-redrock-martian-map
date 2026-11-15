import { useRef } from "react";

const teamEmail = "contact.bedrocktoredrock@gmail.com";

const sources = [
  ["NASA Mars Trek", "Global basemap and orbital layers", "https://trek.nasa.gov/mars/"],
  ["USGS Jezero terrain", "HiRISE imagery and elevation for detailed routes", "https://astrogeology.usgs.gov/search/map/mars-2020-jezero-crater-landing-site-products"],
  ["USGS western Jezero mosaic", "Candidate for new coverage: HiRISE terrain, imagery and confidence data", "https://www.usgs.gov/data/mars-sample-return-hirise-mosaics-terrain-relative-navigation"],
  ["USGS Gale terrain", "Elevation around Mount Sharp", "https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m"],
  ["NASA Perseverance images", "Rover imagery and discovery context", "https://science.nasa.gov/mission/mars-2020-perseverance/mars-2020-raw-images/"],
  ["NASA/JPL-Caltech Perseverance 3D model", "Visualization for rover route playback", "https://science.nasa.gov/resource/mars-perseverance-rover-3d-model/"],
  ["NASA Mars24", "Mars solar time and daylight", "https://www.giss.nasa.gov/tools/mars24/help/algorithm.html"],
  ["NASA Curiosity flyover", "Mount Sharp terrain and camera reference", "https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/"],
];

export function Resources() {
  const dialog = useRef<HTMLDialogElement>(null);
  return <footer className="project-footer">
    <button type="button" onClick={() => dialog.current?.showModal()}>Contact &amp; resources</button>
    <dialog ref={dialog} className="project-dialog" aria-label="Contact and resources">
      <form method="dialog"><button className="btn btn--small">Close</button></form>
      <h2>Contact</h2>
      <p>Bedrock to Redrock · Irbid, Jordan</p>
      <p><a href={`mailto:${teamEmail}`}>{teamEmail}</a></p>
      <details><summary>Map and mission sources</summary>
        <ul>{sources.map(([name, use, url]) => <li key={url}><a href={url} target="_blank" rel="noreferrer">{name}</a><br />{use}</li>)}</ul>
      </details>
      <details><summary>Licenses &amp; Terms</summary><ul>
        <li>Drone geology is clipped and recolored from <a href="https://doi.org/10.1130/GSAB.S.25938268" target="_blank" rel="noreferrer">Meyer et al., CC BY 4.0</a> and <a href="https://doi.org/10.3133/sim3464" target="_blank" rel="noreferrer">Sun and Stack, USGS SIM 3464</a>.</li>
        <li>Orbital and rover data are credited to their source missions and providers. See the individual layer, terrain pack, or catalog entry for its source.</li>
        <li>The Bedrock to Redrock badge marks project navigation and sourced mission records. Individual records retain their NASA and other source credits.</li>
        <li>NASA mission imagery follows the <a href="https://www.nasa.gov/nasa-brand-center/images-and-media/" target="_blank" rel="noreferrer">NASA media usage guidelines</a>. Individual records identify the image and data providers.</li>
        <li>Project assets include the Bedrock to Redrock artwork, lander, astronaut, and bundled synthetic Mission Control recordings. Third-party source terms apply separately.</li>
      </ul></details>
    </dialog>
  </footer>;
}
