async function runQuery() {
  const query = document.getElementById("query").value;
  const status = document.getElementById("status");
  status.textContent = "Running…";
  try {
    const res = await fetch("/cql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Query failed");
    renderTable(data.rows);
    renderTrajectory(data.rows.filter((r) => r.type === "frame"));
    status.textContent = `${data.rows.length} row(s)`;
  } catch (e) {
    status.textContent = e.message;
  }
}

function renderTable(rows) {
  const tbody = document.querySelector("#results tbody");
  tbody.innerHTML = "";
  for (const r of rows) {
    const tr = document.createElement("tr");
    const timeline =
      r.timeline ?? r.intent?.timeline ?? r.payload?.data?.id ?? "";
    const detail =
      r.type === "frame"
        ? `speed=${r.params?.speed ?? "—"}`
        : r.type === "transition"
          ? `allowed=${r.decision?.allowed}`
          : r.artifactType ?? "";
    const cells = [r.type, r.timestamp ?? "", timeline, r.host ?? "", detail];
    for (const text of cells) {
      const td = document.createElement("td");
      td.textContent = String(text);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}

function renderTrajectory(frames) {
  const canvas = document.getElementById("chart");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!frames.length) return;

  const times = frames.map((f) => f.timestamp);
  const speeds = frames.map((f) => f.params?.speed ?? 0);
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const sMin = Math.min(...speeds);
  const sMax = Math.max(...speeds);

  ctx.strokeStyle = "#00ff88";
  ctx.lineWidth = 2;
  ctx.beginPath();
  frames.forEach((f, i) => {
    const x = ((f.timestamp - tMin) / (tMax - tMin || 1)) * (canvas.width - 40) + 20;
    const y =
      canvas.height -
      20 -
      ((f.params?.speed ?? 0) - sMin) / (sMax - sMin || 1) * (canvas.height - 40);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

document.getElementById("run").addEventListener("click", runQuery);
