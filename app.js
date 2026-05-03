import {
  addPurchaseEntry,
  deletePurchaseEntry,
  getPurchaseEntries,
  updatePurchaseEntry,
  getPurchaseEntriesPaged,
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
let lastDoc = null;
const PAGE_SIZE = 20;

const loadMoreBtn = document.createElement("button");

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

async function loadEntries(append = false) {
  if (!append) {
    purchaseEntries.innerHTML = '<tr class="empty-row"><td colspan="11">Loading entries...</td></tr>';
    entries = [];
    lastDoc = null;
  }

  try {
    const result = await getPurchaseEntriesPaged(PAGE_SIZE, lastDoc);
    entries = [...entries, ...result.data];
    lastDoc = result.lastDoc;
    
    renderEntries();
    
    // Load More বাটন কন্ট্রোল
    if (result.data.length === PAGE_SIZE) {
      if (!document.querySelector("#loadMoreBtn")) {
        loadMoreBtn.id = "loadMoreBtn";
        loadMoreBtn.className = "action-btn";
        loadMoreBtn.textContent = "Load More...";
        loadMoreBtn.style.margin = "10px auto";
        loadMoreBtn.style.display = "block";
        purchaseEntries.parentElement.after(loadMoreBtn);
      }
    } else if (document.querySelector("#loadMoreBtn")) {
      loadMoreBtn.remove();
    }
  } catch (error) {
    purchaseEntries.innerHTML =
      '<tr class="empty-row"><td colspan="11">Firebase data load failed. Check Firestore rules/config.</td></tr>';
    console.error(error);
  }
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
      const id = await addPurchaseEntry(entry);
      entries.unshift({ id, ...entry });
      purchaseFormStatus.textContent = "Entry added to Firebase.";
    } else {
      const id = entries[editingIndex].id;
      await updatePurchaseEntry(id, entry);
      entries[editingIndex] = { id, ...entry };
      editingIndex = null;
      purchaseSubmitBtn.textContent = "Add Entry";
      purchaseFormStatus.textContent = "Entry updated in Firebase.";
    }

    renderEntries();
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
      entries.splice(index, 1);
      renderEntries();
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

loadMoreBtn.addEventListener("click", () => loadEntries(true));

exportButton?.addEventListener("click", async () => {
  const originalText = exportButton.textContent;
  exportButton.textContent = "Preparing Report...";
  exportButton.disabled = true;
  // এক্সপোর্টের জন্য সব ডাটা নিয়ে আসা হচ্ছে (ক্যাশ থাকলে ক্যাশ থেকে নিবে)
  const allEntries = await getPurchaseEntries();
  await exportReport(allEntries);
  exportButton.textContent = originalText;
  exportButton.disabled = false;
});

loadEntries();
