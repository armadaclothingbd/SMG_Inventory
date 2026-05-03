import {
  addPurchaseEntry,
  deletePurchaseEntry,
  onPurchaseEntriesSnapshot,
  updatePurchaseEntry,
} from "./firebase-config.js";
import { exportReport } from "./export-report.js";

const newPurchaseBtn = document.querySelector("#newPurchaseBtn");
const purchaseFormPanel = document.querySelector("#purchaseFormPanel");
const closePurchaseForm = document.querySelector("#closePurchaseForm");
const purchaseForm = document.querySelector("#purchaseForm");
const purchaseFormStatus = document.querySelector("#purchaseFormStatus");
const purchaseEntries = document.querySelector("#purchaseEntries");
const purchaseSubmitBtn = document.querySelector("#purchaseSubmitBtn");
const exportButton = document.querySelector("#exportReportBtn");

let entries = [];
let editingIndex = null;

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

function renderEntries() {
  if (entries.length === 0) {
    purchaseEntries.innerHTML = '<tr class="empty-row"><td colspan="11">No purchase entry added yet.</td></tr>';
    return;
  }

  purchaseEntries.innerHTML = entries
    .map(
      (entry, index) => `
        <tr>
          <td>${escapeHtml(entry.entity)}</td>
          <td>${escapeHtml(entry.date)}</td>
          <td>${escapeHtml(entry.model)}</td>
          <td>${escapeHtml(entry.item || "-")}</td>
          <td>${escapeHtml(entry.rate)}</td>
          <td>${escapeHtml(entry.quantity || 1)}</td>
          <td>${escapeHtml(entry.currency)}</td>
          <td><span class="badge ${entry.flag === "Replace" ? "warn" : "good"}">${escapeHtml(entry.flag)}</span></td>
          <td>${escapeHtml(entry.via)}</td>
          <td>${escapeHtml(entry.remarks || "-")}</td>
          <td>
            <div class="row-actions">
              <button class="action-btn edit" type="button" data-action="edit" data-index="${index}">Edit</button>
              <button class="action-btn delete" type="button" data-action="delete" data-index="${index}">Delete</button>
            </div>
          </td>
        </tr>
      `,
    )
    .join("");
}

function loadEntries() {
  purchaseEntries.innerHTML = '<tr class="empty-row"><td colspan="11">Loading entries...</td></tr>';

  onPurchaseEntriesSnapshot((data, error) => {
    if (error) {
      purchaseEntries.innerHTML =
        '<tr class="empty-row"><td colspan="11">Firebase data load failed. Check Firestore rules/config.</td></tr>';
      return;
    }
    entries = data;
    renderEntries();
  });
}

function getFormEntry() {
  const formData = new FormData(purchaseForm);

  return {
    entity: formData.get("entity"),
    date: formData.get("date"),
    model: formData.get("model"),
    item: formData.get("item"),
    rate: formData.get("rate"),
    quantity: formData.get("quantity"),
    currency: formData.get("currency"),
    remarks: formData.get("remarks"),
    flag: formData.get("flag"),
    via: formData.get("via"),
  };
}

newPurchaseBtn.addEventListener("click", () => {
  editingIndex = null;
  purchaseForm.reset();
  purchaseSubmitBtn.textContent = "Add Entry";
  purchaseFormPanel.classList.remove("is-hidden");
  purchaseFormPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  purchaseForm.elements.entity.focus();
});

closePurchaseForm.addEventListener("click", () => {
  editingIndex = null;
  purchaseForm.reset();
  purchaseSubmitBtn.textContent = "Add Entry";
  purchaseFormPanel.classList.add("is-hidden");
  purchaseFormStatus.textContent = "";
});

purchaseForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const entry = getFormEntry();
  purchaseSubmitBtn.disabled = true;

  try {
    if (editingIndex === null) {
      await addPurchaseEntry(entry);
      purchaseFormStatus.textContent = "Entry added to Firebase.";
    } else {
      const id = entries[editingIndex].id;
      await updatePurchaseEntry(id, entry);
      editingIndex = null;
      purchaseSubmitBtn.textContent = "Add Entry";
      purchaseFormStatus.textContent = "Entry updated in Firebase.";
    }

    purchaseForm.reset();
  } catch (error) {
    purchaseFormStatus.textContent = "Firebase save failed. Check Firestore rules.";
    console.error(error);
  } finally {
    purchaseSubmitBtn.disabled = false;
  }
});

purchaseEntries.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");

  if (!button) {
    return;
  }

  const index = Number(button.dataset.index);
  const action = button.dataset.action;

  if (action === "delete") {
    try {
      await deletePurchaseEntry(entries[index].id);
      purchaseFormStatus.textContent = "Entry deleted from Firebase.";
    } catch (error) {
      purchaseFormStatus.textContent = "Firebase delete failed. Check Firestore rules.";
      console.error(error);
    }

    return;
  }

  const entry = entries[index];
  editingIndex = index;
  purchaseForm.elements.entity.value = entry.entity;
  purchaseForm.elements.date.value = entry.date;
  purchaseForm.elements.model.value = entry.model;
  purchaseForm.elements.item.value = entry.item || "";
  purchaseForm.elements.rate.value = entry.rate;
  purchaseForm.elements.quantity.value = entry.quantity || 1;
  purchaseForm.elements.currency.value = entry.currency;
  purchaseForm.elements.flag.value = entry.flag;
  purchaseForm.elements.via.value = entry.via;
  purchaseForm.elements.remarks.value = entry.remarks;
  purchaseSubmitBtn.textContent = "Update Entry";
  purchaseFormStatus.textContent = "Editing selected entry.";
  purchaseFormPanel.classList.remove("is-hidden");
  purchaseFormPanel.scrollIntoView({ behavior: "smooth", block: "start" });
});

exportButton?.addEventListener("click", () => exportReport());
loadEntries();
