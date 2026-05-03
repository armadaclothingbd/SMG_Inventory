import { onPurchaseEntriesSnapshot } from "./firebase-config.js";
import { getPurchaseEntries } from "./firebase-config.js";
import { exportReport } from "./export-report.js";

const DEFAULT_ENTITIES = ["Lumbini", "SML", "SSIL"];
const FLAGS = ["Design Requirement", "Purchased", "Replace", "New", "Extra"];

const modelFilter = document.querySelector("#modelFilter");
const itemFilter = document.querySelector("#itemFilter");
const summaryHead = document.querySelector("#summaryHead");
const summaryRows = document.querySelector("#summaryRows");
const exportButton = document.querySelector("#exportReportBtn");

let entries = [];
let entities = [];

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };

    return entities[char];
  });
}

function toQuantity(value) {
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
}

function uniqueValues(key) {
  return [...new Set(entries.map((entry) => entry[key]).filter(Boolean))].sort();
}

function getEntities() {
  const savedEntities = uniqueValues("entity");
  const customEntities = savedEntities.filter((entity) => !DEFAULT_ENTITIES.includes(entity));

  return [...DEFAULT_ENTITIES, ...customEntities.sort()];
}

function fillFilter(select, values, label) {
  select.innerHTML = `<option value="all">All ${label}</option>`;
  select.insertAdjacentHTML(
    "beforeend",
    values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join(""),
  );
}

function getFilteredEntries() {
  return entries.filter((entry) => {
    const modelMatch = modelFilter.value === "all" || entry.model === modelFilter.value;
    const itemMatch = itemFilter.value === "all" || (entry.item || "-") === itemFilter.value;

    return modelMatch && itemMatch;
  });
}

function buildPivot(rows) {
  const groups = new Map();

  rows.forEach((entry) => {
    const model = entry.model || "-";
    const item = entry.item || "-";
    const entity = entry.entity || "-";
    const flag = entry.flag || "-";
    const key = `${model}|||${item}`;

    if (!groups.has(key)) {
      groups.set(key, {
        model,
        item,
        totals: Object.fromEntries(
          entities.map((entityName) => [
            entityName,
            Object.fromEntries(FLAGS.map((flagName) => [flagName, 0])),
          ]),
        ),
      });
    }

    if (groups.get(key).totals[entity] && groups.get(key).totals[entity][flag] !== undefined) {
      groups.get(key).totals[entity][flag] += toQuantity(entry.quantity);
    }
  });

  return [...groups.values()].sort((a, b) => {
    const modelCompare = a.model.localeCompare(b.model);
    return modelCompare || a.item.localeCompare(b.item);
  });
}

function renderHead() {
  summaryHead.innerHTML = `
    <tr>
      <th rowspan="2">Model</th>
      <th rowspan="2">Item</th>
      ${entities.map((entity) => `<th class="entity-group" colspan="${FLAGS.length}">${escapeHtml(entity)}</th>`).join("")}
      <th rowspan="2">Stock</th>
    </tr>
    <tr>
      ${entities.map(() =>
        FLAGS.map((flag) => `<th class="flag-head">${flag}</th>`).join(""),
      ).join("")}
    </tr>
  `;
}

function renderRows(groups) {
  if (groups.length === 0) {
    summaryRows.innerHTML = `<tr class="empty-row"><td colspan="${2 + entities.length * FLAGS.length + 1}">No purchase entry added yet.</td></tr>`;
    return;
  }

  summaryRows.innerHTML = groups
    .map((group) => {
      const designRequirement = entities.reduce(
        (sum, entity) => sum + group.totals[entity]["Design Requirement"],
        0,
      );
      const deductedQuantity = entities.reduce(
        (sum, entity) =>
          sum +
          group.totals[entity].Purchased +
          group.totals[entity].Replace +
          group.totals[entity].New +
          group.totals[entity].Extra,
        0,
      );
      const stock = designRequirement - deductedQuantity;

      return `
        <tr>
          <td class="sticky-col model-cell">${escapeHtml(group.model)}</td>
          <td class="sticky-col item-cell">${escapeHtml(group.item)}</td>
          ${entities.map((entity) =>
            FLAGS.map((flag) => {
              const value = group.totals[entity][flag];
              return `<td class="qty-cell">${value || ""}</td>`;
            }).join(""),
          ).join("")}
          <td class="stock-cell ${stock < 0 ? "negative" : ""}">${stock}</td>
        </tr>
      `;
    })
    .join("");
}

function renderSummery() {
  const rows = getFilteredEntries();
  renderHead();
  renderRows(buildPivot(rows));
}

function loadSummery() {
async function loadSummery() {
  summaryRows.innerHTML = '<tr class="empty-row"><td colspan="3">Loading summary...</td></tr>';

  onPurchaseEntriesSnapshot((data, error) => {
    if (error) {
      summaryRows.innerHTML =
        '<tr class="empty-row"><td colspan="3">Firebase summary load failed. Check Firestore rules/config.</td></tr>';
      console.error(error);
      return;
    }
    entries = data;
  try {
    entries = await getPurchaseEntries();
    entities = getEntities();
    fillFilter(modelFilter, uniqueValues("model"), "Models");
    fillFilter(itemFilter, uniqueValues("item"), "Items");
    renderSummery();
  });
  } catch (error) {
    summaryRows.innerHTML =
      '<tr class="empty-row"><td colspan="3">Firebase summary load failed. Check Firestore rules/config.</td></tr>';
    console.error(error);
  }
}

modelFilter.addEventListener("change", renderSummery);
itemFilter.addEventListener("change", renderSummery);
exportButton?.addEventListener("click", () => exportReport());
exportButton?.addEventListener("click", () => exportReport(entries));
loadSummery();
