import { useState } from "react";
import { PLAN_DATA_VERSION, readPlan, readPlans, savePlans, sharePlan } from "./missionPlan.ts";
import type { Plan, SavedPlan } from "./missionPlan.ts";

export function SavedRoutes({ current, load }: { current: Plan | null; load: (p: Plan) => void }) {
  const [plans, setPlans] = useState(readPlans);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const store = (next: SavedPlan[]) => {
    try { savePlans(next); setPlans(next); setEditing(null); setName(""); setStatus("Saved on this browser."); }
    catch { setStatus("This browser could not save the route. Use Export route to keep a copy."); }
  };
  const copy = (plan: Plan) => { void sharePlan(plan).then(() => setStatus("Route link copied."), () => setStatus("Clipboard unavailable.")); };
  const exportPlan = (plan: Plan) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(plan, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "martian-route.json"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div className="route-save">
    {current && <form className="route-save__form" onSubmit={(e) => {
      e.preventDefault();
      if (!name.trim()) return;
      if (editing && current) store(plans.map((x) => x.id === editing ? { ...x, name: name.trim(), plan: current } : x));
      else if (current) store([...plans, { id: crypto.randomUUID(), name: name.trim(), plan: current }]);
    }}>
      <label>Route name <input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} /></label>
      <button className="btn btn--small btn--primary" disabled={!name.trim()}>{editing ? "Update saved route" : "Save route"}</button>
      {editing && <button className="btn btn--small" type="button" onClick={() => { setEditing(null); setName(""); }}>Cancel edit</button>}
    </form>}
    {editing && <p className="small muted">Change the endpoints or mission options above, then update the saved route.</p>}
    <details><summary>Saved routes ({plans.length})</summary>
    {!plans.length && <p className="small muted">No routes saved yet.</p>}
    <ul className="saved-route-list">{plans.map((item) => <li key={item.id}><strong>{item.name}</strong>
      {item.plan.data !== PLAN_DATA_VERSION && <p className="small muted">Saved with terrain {item.plan.data}</p>}
      <div className="mission-row">
        <button className="btn btn--small" onClick={() => load(item.plan)}>Open</button>
        <button className="btn btn--small" onClick={() => { load(item.plan); setEditing(item.id); setName(item.name); }}>Edit</button>
        <button className="btn btn--small" onClick={() => store([...plans, { ...item, id: crypto.randomUUID(), name: (item.name + " copy").slice(0, 100) }])}>Duplicate</button>
        <button className="btn btn--small" onClick={() => exportPlan(item.plan)}>Export</button>
        <button className="btn btn--small" onClick={() => copy(item.plan)}>Copy link</button>
        <button className="btn btn--small" onClick={() => store(plans.filter((x) => x.id !== item.id))}>Remove</button>
    </div></li>)}</ul></details>
    <details><summary>Share or import a route</summary>
    {current && <div className="mission-row">
      <button className="btn btn--small" type="button" onClick={() => copy(current)}>Copy route link</button>
      <button className="btn btn--small" type="button" onClick={() => exportPlan(current)}>Export route</button>
    </div>}
    <label className="small">Open route file <input type="file" accept=".json,application/json" onChange={async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const plan = file.size <= 16_384 ? readPlan(await file.text().catch(() => "")) : null;
      if (plan) load(plan); else setStatus("This route file has invalid or unsupported inputs.");
    }} /></label></details>
    <p role="status" className="muted small">{status || "Routes stay in this browser. A share link opens the same scenario in this version of the app."}</p>
  </div>;
}
