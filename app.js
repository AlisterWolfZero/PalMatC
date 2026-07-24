(function () {
  const itemNames = Object.keys(RECIPES).sort((a, b) => a.localeCompare(b, "es"));

  const itemInput = document.getElementById("item-input");
  const qtyInput = document.getElementById("qty-input");
  const addBtn = document.getElementById("add-btn");
  const goalsList = document.getElementById("goals-list");
  const calcBtn = document.getElementById("calc-btn");
  const clearBtn = document.getElementById("clear-btn");
  const resultsPanel = document.getElementById("results-panel");
  const rawTableBody = document.querySelector("#raw-table tbody");
  const summaryEl = document.getElementById("summary");
  const treesEl = document.getElementById("trees");
  const datalist = document.getElementById("item-list");

  datalist.innerHTML = itemNames.map((n) => `<option value="${escapeHtml(n)}">`).join("");

  let goals = [];
  const haveAmounts = {};
  const doneSet = new Set();

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function iconTag(name) {
    const src = ICONS[name];
    if (!src) return "";
    return `<img class="item-icon" src="${src}" alt="" loading="lazy" onerror="this.remove()">`;
  }

  function findItem(name) {
    const exact = itemNames.find((n) => n.toLowerCase() === name.toLowerCase());
    return exact || null;
  }

  function renderGoals() {
    goalsList.innerHTML = goals.map((g, idx) => `
      <li>
        <span>${iconTag(g.name)}${escapeHtml(g.name)} × ${g.qty}</span>
        <button class="remove-btn" data-idx="${idx}" title="Quitar">✕</button>
      </li>
    `).join("");
  }

  addBtn.addEventListener("click", addGoal);
  itemInput.addEventListener("keydown", (e) => { if (e.key === "Enter") addGoal(); });

  function addGoal() {
    const raw = itemInput.value.trim();
    if (!raw) return;
    const match = findItem(raw);
    if (!match) {
      alert(`No se encontró el objeto "${raw}" en la base de datos.`);
      return;
    }
    const qty = Math.max(1, parseInt(qtyInput.value, 10) || 1);
    const existing = goals.find((g) => g.name === match);
    if (existing) existing.qty += qty;
    else goals.push({ name: match, qty });
    itemInput.value = "";
    qtyInput.value = 1;
    itemInput.focus();
    renderGoals();
  }

  goalsList.addEventListener("click", (e) => {
    const btn = e.target.closest(".remove-btn");
    if (!btn) return;
    goals.splice(Number(btn.dataset.idx), 1);
    renderGoals();
  });

  clearBtn.addEventListener("click", () => {
    goals = [];
    doneSet.clear();
    renderGoals();
    resultsPanel.hidden = true;
  });

  calcBtn.addEventListener("click", calculate);

  function buildNode(name, qtyNeeded, rawTotals) {
    const recipe = RECIPES[name];
    if (!recipe) {
      rawTotals[name] = (rawTotals[name] || 0) + qtyNeeded;
      return { name, qty: qtyNeeded, raw: true };
    }
    const makes = recipe.makes || 1;
    const crafts = Math.ceil(qtyNeeded / makes);
    const children = recipe.mats.map((m) => buildNode(m.n, m.a * crafts, rawTotals));
    return {
      name,
      qty: qtyNeeded,
      raw: false,
      crafts,
      children,
    };
  }

  function renderNode(node) {
    if (node.raw) {
      const done = doneSet.has(node.name);
      return `
        <label class="leaf${done ? " done" : ""}" data-mat="${escapeHtml(node.name)}">
          <input type="checkbox" class="done-check" data-mat="${escapeHtml(node.name)}" ${done ? "checked" : ""}>
          ${iconTag(node.name)}${escapeHtml(node.name)} — <span class="qty">${node.qty}</span>
        </label>
      `;
    }
    return `
      <details open>
        <summary>${iconTag(node.name)}${escapeHtml(node.name)} — <span class="qty">${node.qty}</span>
          <span class="raw-tag">${node.crafts} ${node.crafts !== 1 ? "fabricaciones" : "fabricación"}</span>
        </summary>
        <div class="node-children">
          ${node.children.map(renderNode).join("")}
        </div>
      </details>
    `;
  }

  function calculate() {
    if (goals.length === 0) {
      alert("Agregá al menos un objeto a fabricar.");
      return;
    }
    const rawTotals = {};
    const trees = goals.map((g) => buildNode(g.name, g.qty, rawTotals));

    const sortedRaw = Object.keys(rawTotals).sort((a, b) => a.localeCompare(b, "es"));
    rawTableBody.innerHTML = sortedRaw.map((mat) => {
      const need = rawTotals[mat];
      const have = haveAmounts[mat] || 0;
      const missing = Math.max(0, need - have);
      const done = doneSet.has(mat);
      return `
        <tr data-mat="${escapeHtml(mat)}" class="${done ? "done" : ""}">
          <td class="check-col"><input type="checkbox" class="done-check" data-mat="${escapeHtml(mat)}" ${done ? "checked" : ""}></td>
          <td class="mat-name">${iconTag(mat)}${escapeHtml(mat)}</td>
          <td>${need}</td>
          <td class="have-cell"><input type="number" min="0" value="${have}" data-mat="${escapeHtml(mat)}"></td>
          <td class="missing ${missing === 0 ? "zero" : "pending"}">${missing}</td>
        </tr>
      `;
    }).join("");

    summaryEl.textContent = `${sortedRaw.length} materiales base distintos`;

    treesEl.innerHTML = goals.map((g, i) => `
      <details class="tree-root" open>
        <summary>${iconTag(g.name)}${escapeHtml(g.name)} × ${g.qty}</summary>
        ${trees[i].children.map(renderNode).join("")}
      </details>
    `).join("");

    resultsPanel.hidden = false;
  }

  rawTableBody.addEventListener("input", (e) => {
    const input = e.target.closest("input[type=number][data-mat]");
    if (!input) return;
    const mat = input.dataset.mat;
    haveAmounts[mat] = Math.max(0, parseInt(input.value, 10) || 0);
    const row = input.closest("tr");
    const need = Number(row.children[2].textContent);
    const missing = Math.max(0, need - haveAmounts[mat]);
    const missingCell = row.querySelector(".missing");
    missingCell.textContent = missing;
    missingCell.className = `missing ${missing === 0 ? "zero" : "pending"}`;
  });

  resultsPanel.addEventListener("change", (e) => {
    const check = e.target.closest(".done-check");
    if (!check) return;
    const mat = check.dataset.mat;
    if (check.checked) doneSet.add(mat);
    else doneSet.delete(mat);
    const isDone = check.checked;
    document.querySelectorAll(`tr[data-mat="${CSS.escape(mat)}"], label.leaf[data-mat="${CSS.escape(mat)}"]`).forEach((el) => {
      el.classList.toggle("done", isDone);
    });
    document.querySelectorAll(`.done-check[data-mat="${CSS.escape(mat)}"]`).forEach((cb) => {
      cb.checked = isDone;
    });
  });
})();
