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
  const langToggle = document.getElementById("lang-toggle");
  const proModal = document.getElementById("pro-modal");
  const proBodyEl = document.getElementById("pro-body");
  const proBtn = document.getElementById("pro-btn");
  const proToast = document.getElementById("pro-toast");

  let goals = [];
  const haveAmounts = {};
  const doneSet = new Set();

  // ---------- i18n ----------

  const UI_STRINGS = {
    es: {
      topbarTag: "Calculadora de Materiales · Palworld 1.0",
      addGoalHeading: "Agregar objetivo de fabricación",
      itemPlaceholder: "Buscar objeto (ej. Rifle de Asalto, Pastel...)",
      addBtn: "Agregar",
      calcBtn: "Calcular materiales",
      clearBtn: "Vaciar todo",
      removeTitle: "Quitar",
      resultsHeading: "Materiales base necesarios",
      hint: 'Edita "Tengo" si ya posees parte de los materiales — se recalcula lo que falta.',
      thMaterial: "Material",
      thNecesario: "Necesario",
      thTengo: "Tengo",
      thFalta: "Falta",
      treeHeading: "Desglose anidado por objetivo",
      summary: (n) => `${n} materiales base distintos`,
      crafts: (n) => `${n} ${n !== 1 ? "fabricaciones" : "fabricación"}`,
      notFound: (q) => `No se encontró ningún objeto parecido a "${q}".`,
      addAtLeastOne: "Agrega al menos un objeto a fabricar.",
      proBody: "Para calcular materiales necesitas PalMatC Pro.",
      proBtn: "Hacerme PRO",
      proToast: "¡Ya eres Pro!",
    },
    en: {
      topbarTag: "Material Calculator · Palworld 1.0",
      addGoalHeading: "Add crafting goal",
      itemPlaceholder: "Search item (e.g. Assault Rifle, Cake...)",
      addBtn: "Add",
      calcBtn: "Calculate materials",
      clearBtn: "Clear all",
      removeTitle: "Remove",
      resultsHeading: "Base materials needed",
      hint: 'Edit "Have" if you already own some materials — the missing amount recalculates.',
      thMaterial: "Material",
      thNecesario: "Needed",
      thTengo: "Have",
      thFalta: "Missing",
      treeHeading: "Nested breakdown by goal",
      summary: (n) => `${n} distinct base materials`,
      crafts: (n) => `${n} ${n !== 1 ? "crafts" : "craft"}`,
      notFound: (q) => `No item found matching "${q}".`,
      addAtLeastOne: "Add at least one item to craft.",
      proBody: "You need PalMatC Pro to calculate materials.",
      proBtn: "Go PRO",
      proToast: "You're Pro now!",
    },
  };

  let lang = localStorage.getItem("palLang") || "es";
  if (lang !== "es" && lang !== "en") lang = "es";

  function t(key) {
    return UI_STRINGS[lang][key];
  }

  function nameFor(key) {
    if (lang === "en") return key;
    return NAMES_ES[key] || key;
  }

  function applyStaticText() {
    document.documentElement.lang = lang;
    document.getElementById("topbar-tag").textContent = t("topbarTag");
    document.getElementById("add-goal-heading").textContent = t("addGoalHeading");
    document.getElementById("results-heading").textContent = t("resultsHeading");
    document.getElementById("hint-text").textContent = t("hint");
    document.getElementById("th-material").textContent = t("thMaterial");
    document.getElementById("th-necesario").textContent = t("thNecesario");
    document.getElementById("th-tengo").textContent = t("thTengo");
    document.getElementById("th-falta").textContent = t("thFalta");
    document.getElementById("tree-heading").textContent = t("treeHeading");
    itemInput.placeholder = t("itemPlaceholder");
    addBtn.textContent = t("addBtn");
    calcBtn.textContent = t("calcBtn");
    clearBtn.textContent = t("clearBtn");
    proBodyEl.textContent = t("proBody");
    proBtn.textContent = t("proBtn");
    langToggle.querySelectorAll(".lang-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.lang === lang);
    });
  }

  function rebuildDatalist() {
    datalist.innerHTML = itemNames
      .map((n) => `<option value="${escapeHtml(nameFor(n))}">`)
      .join("");
  }

  function setLang(newLang) {
    if (newLang !== "es" && newLang !== "en") return;
    lang = newLang;
    localStorage.setItem("palLang", lang);
    applyStaticText();
    rebuildDatalist();
    renderGoals();
    if (!resultsPanel.hidden) calculate();
  }

  langToggle.addEventListener("click", (e) => {
    const btn = e.target.closest(".lang-btn");
    if (!btn) return;
    setLang(btn.dataset.lang);
  });

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

  function displayTag(key) {
    return escapeHtml(nameFor(key));
  }

  // ---------- Search index (bilingual, typo-tolerant) ----------

  function normalize(s) {
    return s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/['’]/g, "")
      .trim();
  }

  const searchIndex = itemNames.map((key) => ({
    key,
    normEn: normalize(key),
    normEs: NAMES_ES[key] ? normalize(NAMES_ES[key]) : null,
  }));

  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    let prev = new Array(n + 1);
    let curr = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      curr[0] = i;
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        curr[j] = Math.min(
          prev[j] + 1,
          curr[j - 1] + 1,
          prev[j - 1] + cost
        );
      }
      [prev, curr] = [curr, prev];
    }
    return prev[n];
  }

  function wordDistance(q, target) {
    let best = levenshtein(q, target);
    for (const w of target.split(" ")) {
      if (Math.abs(w.length - q.length) <= 3) {
        const d = levenshtein(q, w);
        if (d < best) best = d;
      }
    }
    return best;
  }

  function fuzzyThreshold(len) {
    if (len <= 4) return 1;
    if (len <= 8) return 2;
    return 3;
  }

  function findItem(query) {
    const q = normalize(query);
    if (!q) return null;

    for (const it of searchIndex) {
      if (it.normEn === q || it.normEs === q) return it.key;
    }
    for (const it of searchIndex) {
      if (it.normEn.startsWith(q) || (it.normEs && it.normEs.startsWith(q))) return it.key;
    }
    for (const it of searchIndex) {
      if (it.normEn.includes(q) || (it.normEs && it.normEs.includes(q))) return it.key;
    }

    let best = null;
    let bestDist = Infinity;
    for (const it of searchIndex) {
      const d = Math.min(
        wordDistance(q, it.normEn),
        it.normEs ? wordDistance(q, it.normEs) : Infinity
      );
      if (d < bestDist) { bestDist = d; best = it; }
    }
    if (best && bestDist <= fuzzyThreshold(q.length)) return best.key;
    return null;
  }

  function renderGoals() {
    goalsList.innerHTML = goals.map((g, idx) => `
      <li>
        <span>${iconTag(g.name)}${displayTag(g.name)} × ${g.qty}</span>
        <button class="remove-btn" data-idx="${idx}" title="${t("removeTitle")}">✕</button>
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
      alert(t("notFound")(raw));
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

  // ---------- "PRO" joke paywall ----------

  let toastTimer = null;

  function showToast(msg) {
    clearTimeout(toastTimer);
    proToast.textContent = msg;
    proToast.hidden = false;
    proToast.classList.remove("hide");
    toastTimer = setTimeout(() => {
      proToast.classList.add("hide");
      setTimeout(() => { proToast.hidden = true; }, 300);
    }, 2600);
  }

  proBtn.addEventListener("click", () => {
    localStorage.setItem("palmatc_pro", "1");
    proModal.hidden = true;
    showToast(t("proToast"));
    calculate();
  });

  calcBtn.addEventListener("click", () => {
    if (!localStorage.getItem("palmatc_pro")) {
      proModal.hidden = false;
      return;
    }
    calculate();
  });

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
          ${iconTag(node.name)}${displayTag(node.name)} — <span class="qty">${node.qty}</span>
        </label>
      `;
    }
    return `
      <details open>
        <summary>${iconTag(node.name)}${displayTag(node.name)} — <span class="qty">${node.qty}</span>
          <span class="raw-tag">${t("crafts")(node.crafts)}</span>
        </summary>
        <div class="node-children">
          ${node.children.map(renderNode).join("")}
        </div>
      </details>
    `;
  }

  function calculate() {
    if (goals.length === 0) {
      alert(t("addAtLeastOne"));
      return;
    }
    const rawTotals = {};
    const trees = goals.map((g) => buildNode(g.name, g.qty, rawTotals));

    const sortedRaw = Object.keys(rawTotals).sort((a, b) => nameFor(a).localeCompare(nameFor(b), lang));
    rawTableBody.innerHTML = sortedRaw.map((mat) => {
      const need = rawTotals[mat];
      const have = haveAmounts[mat] || 0;
      const missing = Math.max(0, need - have);
      const done = doneSet.has(mat);
      return `
        <tr data-mat="${escapeHtml(mat)}" class="${done ? "done" : ""}">
          <td class="check-col"><input type="checkbox" class="done-check" data-mat="${escapeHtml(mat)}" ${done ? "checked" : ""}></td>
          <td class="mat-name">${iconTag(mat)}${displayTag(mat)}</td>
          <td>${need}</td>
          <td class="have-cell"><input type="number" min="0" value="${have}" data-mat="${escapeHtml(mat)}"></td>
          <td class="missing ${missing === 0 ? "zero" : "pending"}">${missing}</td>
        </tr>
      `;
    }).join("");

    summaryEl.textContent = t("summary")(sortedRaw.length);

    treesEl.innerHTML = goals.map((g, i) => `
      <details class="tree-root" open>
        <summary>${iconTag(g.name)}${displayTag(g.name)} × ${g.qty}</summary>
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

  applyStaticText();
  rebuildDatalist();
})();
