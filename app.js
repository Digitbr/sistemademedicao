const DB_NAME = "sistema-medicao-db";
const DB_VERSION = 1;
const RECORD_STORE = "records";
const DEFAULT_CONTRACTOR = "FLASH LOCAÇÃO DE MÃO DE OBRA";
const REPORT_FORMATS = {
  pdf: { label: "PDF", option: "PDF (.pdf)" },
  xlsx: { label: "Excel", option: "Excel (.xlsx)" },
  pptx: { label: "PowerPoint", option: "PowerPoint (.pptx)" },
  docx: { label: "Word", option: "Word (.docx)" }
};
const FORMAT_STORAGE_KEY = "medicao-formato-relatorio";
const MAX_ACTIVITIES = 20;
const MAX_PHOTO_BYTES = 30 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;
const UPLOAD_PART_BYTES = 2 * 1024 * 1024;
const ATTACHMENT_FIELDS = ["fotoAntes", "fotoAntes2", "fotoDepois", "fotoDepois2"];
const MIGRATION_FLAG = "medicao-registros-locais-enviados";
const PHOTO_LABELS = {
  fotoAntes: "A foto antes 1",
  fotoAntes2: "A foto antes 2",
  fotoDepois: "A foto depois 1",
  fotoDepois2: "A foto depois 2"
};

const activityContainer = document.querySelector("#activities");
const activityTemplate = document.querySelector("#activity-template");
const reportForm = document.querySelector("#report-form");
const generateButton = document.querySelector("#generate-button");
const saveRecordButton = document.querySelector("#save-record-button");
const resetRecordButton = document.querySelector("#reset-record-button");
const formStatus = document.querySelector("#form-status");
const activityProgress = document.querySelector("#activity-progress");
const reportPageTitle = document.querySelector("#report-page-title");
const reportPageDescription = document.querySelector("#report-page-description");
const dashboardContent = document.querySelector("#dashboard-content");
const operationsContent = document.querySelector("#operations-content");
const recordsList = document.querySelector("#records-list");
const recordSearch = document.querySelector("#record-search");
const recordTypeFilter = document.querySelector("#record-type-filter");
const recordStatusFilter = document.querySelector("#record-status-filter");
const recordSortFilter = document.querySelector("#record-sort-filter");
const recordsResultCount = document.querySelector("#records-result-count");
const clearRecordFiltersButton = document.querySelector("#clear-record-filters");
const dashboardPeriodFilter = document.querySelector("#dashboard-period-filter");
const dashboardTypeFilter = document.querySelector("#dashboard-type-filter");
const clearDashboardFiltersButton = document.querySelector("#clear-dashboard-filters");
const exportRecordsButton = document.querySelector("#export-records-button");
const importRecordsButton = document.querySelector("#import-records-button");
const recordsImportInput = document.querySelector("#records-import-input");
const reportRecipient = document.querySelector("#report-recipient");
const addOccurrenceButton = document.querySelector("#add-occurrence");
const waitingReminders = document.querySelector("#waiting-reminders");
const waitingReminderList = document.querySelector("#waiting-reminder-list");
const currentViewTitle = document.querySelector("#current-view-title");
const currentDate = document.querySelector("#current-date");
const sidebar = document.querySelector("#sidebar");
const sidebarToggle = document.querySelector("#sidebar-toggle");
const sidebarOverlay = document.querySelector("#sidebar-overlay");
const activityCards = [];

const state = {
  exportFormat: loadExportFormat(),
  view: "report",
  records: [],
  editingRecordId: null,
  config: {
    recipient: "comercial1@primecsg.com.br",
    emailConfigured: false
  }
};

startApp();

async function startApp() {
  const user = await requireSession();
  if (!user) return;

  renderSessionUser(user);
  bindSessionActions();
  bindAddOccurrence();
  bindNavigation();
  bindDashboardFilters();
  bindRecordFilters();
  bindRecordActions();
  bindBackupActions();
  bindReportForm();
  bindFormatSelectors();
  initialize();
}

async function requireSession() {
  try {
    const response = await fetch("/api/session", {
      credentials: "same-origin",
      cache: "no-store"
    });
    if (response.ok) {
      const data = await response.json();
      if (data && data.user) return data.user;
    }
  } catch {
    // Falha de rede: trata como sessão inválida.
  }
  redirectToLogin();
  return null;
}

function redirectToLogin() {
  window.location.replace("/login");
}

function renderSessionUser(user) {
  const container = document.querySelector("#session-user");
  if (!container) return;
  document.querySelector("#session-user-name").textContent = user.name || user.email;
  document.querySelector("#session-user-email").textContent = user.email;
  container.hidden = false;
}

function bindSessionActions() {
  const logoutButton = document.querySelector("#logout-button");
  logoutButton?.addEventListener("click", async () => {
    logoutButton.disabled = true;
    try {
      await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
    } finally {
      redirectToLogin();
    }
  });
}

function currentDateInputValue(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function currentCompetenceLabel(date = new Date()) {
  const label = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric"
  }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

async function initialize() {
  currentDate.textContent = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long"
  }).format(new Date());
  state.config = await getServiceConfig();
  try {
    await sendLocalRecordsToServer();
    state.records = await getAllRecords();
  } catch (error) {
    state.records = [];
    setTimeout(() => {
      setFormMessage(
        `Não foi possível carregar os registros do banco de dados: ${error.message}`,
        "error"
      );
    }, 0);
  }

  // Make recipient editable by creating an input field next to #report-recipient
  ensureRecipientInput();

  resetForm();
  updateGenerateButton();
  renderDashboard();
  renderRecords();
  renderOperations();
  setView("report");
  refreshIcons();
}

function ensureRecipientInput() {
  // Update displayed recipient from loaded config
  if (reportRecipient) reportRecipient.textContent = state.config.recipient || "";

  const existingInput = document.querySelector("#report-recipient-input");
  if (existingInput) {
    existingInput.value = state.config.recipient || "";
    existingInput.addEventListener("input", () => {
      state.config.recipient = existingInput.value.trim();
      if (reportRecipient) reportRecipient.textContent = state.config.recipient;
    });
    return existingInput;
  }

  if (!reportRecipient || !reportRecipient.parentNode) return null;

  const input = document.createElement("input");
  input.type = "email";
  input.id = "report-recipient-input";
  input.placeholder = "E-mail do destinatário (opcional)";
  input.value = state.config.recipient || "";
  input.className = "recipient-input";
  input.addEventListener("input", () => {
    state.config.recipient = input.value.trim();
    if (reportRecipient) reportRecipient.textContent = state.config.recipient;
  });

  // Insert the input after the existing element and hide the original label/span
  reportRecipient.parentNode.insertBefore(input, reportRecipient.nextSibling);
  reportRecipient.hidden = true;
  return input;
}

function bindAddOccurrence() {
  addOccurrenceButton?.addEventListener("click", () => {
    addOccurrenceCard();
  });
}

function addOccurrenceCard(data, options = {}) {
  if (activityCards.length >= MAX_ACTIVITIES) {
    setFormMessage(
      `Limite de ${MAX_ACTIVITIES} ocorrências por medição atingido.`,
      "warning"
    );
    return null;
  }

  const entry = createActivityCard(data);
  if (options.focus !== false) {
    entry.card.classList.add("is-open");
    entry.card.scrollIntoView({ behavior: "smooth", block: "center" });
    entry.fields.atividade.focus({ preventScroll: true });
  }
  return entry;
}

function clearOccurrenceCards() {
  activityCards.length = 0;
  activityContainer.innerHTML = "";
}

function renumberActivityCards() {
  activityCards.forEach((entry, index) => entry.setNumber(index + 1));
}

async function removeOccurrenceCard(entry) {
  const label =
    entry.fields.ordemServico.value.trim() ||
    entry.fields.atividade.value.trim() ||
    "esta ocorrência";
  if (!confirm(`Excluir ${label} deste formulário?`)) return;

  const savedRecordId = entry.getSavedRecordId();
  if (
    savedRecordId &&
    state.records.some((record) => record.id === savedRecordId) &&
    confirm("Esta ocorrência também está salva nos registros. Apagar o registro salvo?")
  ) {
    await deleteRecord(savedRecordId);
    state.records = state.records.filter((record) => record.id !== savedRecordId);
    if (state.editingRecordId === savedRecordId) state.editingRecordId = null;
  }

  entry.card.remove();
  const position = activityCards.indexOf(entry);
  if (position >= 0) activityCards.splice(position, 1);
  if (!activityCards.length) addOccurrenceCard(undefined, { focus: false });

  renumberActivityCards();
  updateProgress();
  renderFormWaitingReminders();
  renderAllDataViews();
  setFormMessage("Ocorrência excluída.", "success");
}

function createActivityCard(data) {
  const fragment = activityTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".activity-card");
  const header = fragment.querySelector(".activity-card__header");
  const number = fragment.querySelector(".activity-number");
  const summary = fragment.querySelector(".activity-summary");
  const meta = fragment.querySelector(".activity-meta");
  const statusBadge = fragment.querySelector(".activity-status");
  const clearButton = fragment.querySelector(".clear-activity");
  const removeButton = fragment.querySelector("[data-remove-occurrence]");
  const saveOccurrenceButton = fragment.querySelector("[data-save-occurrence]");
  const exportOccurrenceButton = fragment.querySelector("[data-export-occurrence]");
  const occurrenceSaveStatus = fragment.querySelector("[data-occurrence-save-status]");
  const waitingReasonField = fragment.querySelector(".waiting-reason-field");
  const statusButtons = [...fragment.querySelectorAll("[data-status]")];
  const fields = Object.fromEntries(
    [...fragment.querySelectorAll("[data-field]")].map((input) => [
      input.dataset.field,
      input
    ])
  );
  const PHOTO_FIELDS = ["fotoAntes", "fotoAntes2", "fotoDepois", "fotoDepois2"];
  const photos = Object.fromEntries(PHOTO_FIELDS.map((name) => [name, ""]));
  const photoMeta = Object.fromEntries(PHOTO_FIELDS.map((name) => [name, { nome: "", tipo: "" }]));
  const photoErrors = {};
  const photoPromises = Object.fromEntries(
    PHOTO_FIELDS.map((name) => [name, Promise.resolve()])
  );
  // Cada nova escolha de arquivo numa caixa invalida o processamento anterior.
  const photoTokens = Object.fromEntries(PHOTO_FIELDS.map((name) => [name, 0]));
  let savedRecordId = "";
  // Ocorrência aberta a partir de uma medição com várias ocorrências:
  // ao salvar, atualiza a ocorrência dentro dessa medição.
  let parentLink = null;

  const setNumber = (position) => {
    number.textContent = String(position).padStart(2, "0");
  };

  const updateSummary = () => {
    const hasContent = Boolean(
      fields.atividade.value.trim() ||
      fields.ordemServico.value.trim() ||
      fields.responsavel.value.trim() ||
      fields.motivo.value.trim() ||
      PHOTO_FIELDS.some((name) => photos[name])
    );
    const statusText =
      fields.status.value === "em-espera" ? "Em espera" : "Concluída";

    const occurrenceOrder = fields.ordemServico.value.trim();
    summary.textContent =
      occurrenceOrder || fields.atividade.value.trim() || "Nova ocorrência";
    meta.textContent = [
      fields.responsavel.value.trim() || "Sem responsável técnico informado",
      fields.atividade.value.trim()
    ]
      .filter(Boolean)
      .join(" · ");
    statusBadge.textContent = hasContent ? statusText : "Pendente";
    statusBadge.className = `activity-status ${
      hasContent
        ? fields.status.value === "em-espera"
          ? "is-waiting"
          : "is-complete"
        : "is-empty"
    }`;
    updateProgress();
    renderFormWaitingReminders();
  };

  const setStatus = (status) => {
    fields.status.value = status;
    statusButtons.forEach((button) => {
      const active = button.dataset.status === status;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    fields.motivo.placeholder =
      status === "em-espera"
        ? "Explique por que o problema ficou em espera"
        : "";
    fields.motivo.required = status === "em-espera";
    waitingReasonField.hidden = status !== "em-espera";
    if (status !== "em-espera") {
      fields.motivo.value = "";
    }
    updateSummary();
    renderFormWaitingReminders();
  };

  const setDefaultEntryDate = (value = currentDateInputValue()) => {
    fields.dataAntes.value = value || currentDateInputValue();
  };

  const applyDefaultDates = () => {
    const today = currentDateInputValue();
    if (!fields.dataAntes.value) setDefaultEntryDate(today);
    if (!fields.dataDepois.value) fields.dataDepois.value = today;
  };

  const syncMaintenanceType = (type = currentMaintenanceType()) => {
    const normalizedType = normalizeText(type);
    if (normalizedType.includes("corretiva")) {
      fields.atividade.placeholder =
        "Ex.: Consertar caixa d'água, corrigir vazamento ou substituir componente danificado";
    } else if (normalizedType.includes("preventiva")) {
      fields.atividade.placeholder =
        "Ex.: Inspecionar, limpar, ajustar ou prevenir falha no equipamento";
    } else if (normalizedType.includes("emergencial")) {
      fields.atividade.placeholder =
        "Ex.: Atender ocorrência emergencial e registrar a solução aplicada";
    } else {
      fields.atividade.placeholder =
        "Descreva o problema, serviço realizado ou ponto inspecionado";
    }
  };

  const setPhotoError = (fieldName, message = "") => {
    const slot = fields[fieldName].closest(".photo-slot");
    let note = slot.querySelector(".photo-error");
    if (message) {
      photoErrors[fieldName] = message;
      if (!note) {
        note = document.createElement("p");
        note.className = "photo-error";
        note.setAttribute("role", "alert");
        slot.querySelector(".photo-input").after(note);
      }
      note.textContent = message;
    } else {
      delete photoErrors[fieldName];
      note?.remove();
    }
  };

  const setPhotoNotice = (fieldName, message = "") => {
    const slot = fields[fieldName].closest(".photo-slot");
    let note = slot.querySelector(".photo-notice");
    if (message) {
      if (!note) {
        note = document.createElement("p");
        note.className = "photo-notice";
        note.setAttribute("role", "status");
        slot.querySelector(".photo-input").after(note);
      }
      note.textContent = message;
    } else {
      note?.remove();
    }
  };

  const setPhoto = (fieldName, value, meta = {}) => {
    photos[fieldName] = value || "";
    photoMeta[fieldName] = photos[fieldName]
      ? { nome: meta.nome || "", tipo: meta.tipo || guessAttachmentType(photos[fieldName]) }
      : { nome: "", tipo: "" };
    if (photos[fieldName]) setPhotoError(fieldName, "");
    setPhotoNotice(fieldName, meta.notice || "");
    const input = fields[fieldName];
    const label = input.closest(".photo-input");
    const preview = label.querySelector("img");
    let documentChip = label.querySelector(".document-chip");
    input.value = "";
    label.classList.remove("has-image", "has-document", "is-uploading");

    if (!photos[fieldName]) {
      preview.removeAttribute("src");
      documentChip?.remove();
      return;
    }

    if (isImageType(photoMeta[fieldName].tipo)) {
      documentChip?.remove();
      preview.src = meta.previewUrl || photos[fieldName];
      label.classList.add("has-image");
    } else {
      preview.removeAttribute("src");
      if (!documentChip) {
        documentChip = document.createElement("span");
        documentChip.className = "document-chip";
        label.append(documentChip);
      }
      documentChip.innerHTML = `<strong>${escapeHtml(documentBadge(photoMeta[fieldName]))}</strong><span>${escapeHtml(photoMeta[fieldName].nome || "Documento anexado")}</span>`;
      label.classList.add("has-document");
    }
  };

  const setSavedRecordId = (id) => {
    savedRecordId = id || "";
    if (occurrenceSaveStatus) {
      occurrenceSaveStatus.textContent = savedRecordId
        ? "Ocorrência salva individualmente. Alterações futuras poderão atualizar este registro."
        : "Ocorrência ainda não salva individualmente.";
    }
    if (saveOccurrenceButton) {
      saveOccurrenceButton.textContent = savedRecordId
        ? "Atualizar ocorrência"
        : "Salvar ocorrência";
    }
    refreshExportLabel();
  };

  const refreshExportLabel = () => {
    if (!exportOccurrenceButton || exportOccurrenceButton.disabled) return;
    exportOccurrenceButton.textContent =
      savedRecordId || parentLink
        ? `Exportar ${reportFormatLabel()}`
        : `Salvar e exportar ${reportFormatLabel()}`;
  };

  const reset = () => {
    for (const field of Object.values(fields)) {
      field.value = field.dataset.field === "status" ? "concluida" : "";
    }
    parentLink = null;
    setSavedRecordId("");
    applyDefaultDates();
    syncMaintenanceType();
    PHOTO_FIELDS.forEach((name) => {
      photoTokens[name] += 1;
      photoPromises[name] = Promise.resolve();
      fields[name].closest(".photo-input").classList.remove("is-uploading");
      setPhoto(name, "");
      setPhotoError(name, "");
    });
    setStatus("concluida");
  };

  const setData = (activity = {}) => {
    setDefaultEntryDate(activity.dataAntes || currentDateInputValue());
    fields.dataDepois.value = activity.dataDepois || "";
    fields.ordemServico.value = activity.ordemServico || activity.os || "";
    fields.responsavel.value = activity.responsavel || "";
    fields.atividade.value = activity.atividade || "";
    fields.motivo.value = activity.motivo || "";
    fields.legendaAntes.value = activity.legendaAntes || "";
    fields.legendaDepois.value = activity.legendaDepois || "";
    fields.legendaAntes2.value = activity.legendaAntes2 || "";
    fields.legendaDepois2.value = activity.legendaDepois2 || "";
    PHOTO_FIELDS.forEach((name) => {
      photoTokens[name] += 1;
      photoPromises[name] = Promise.resolve();
      fields[name].closest(".photo-input").classList.remove("is-uploading");
      setPhoto(name, activity[name] || "", {
        nome: activity[`${name}Nome`] || "",
        tipo: activity[`${name}Tipo`] || ""
      });
      setPhotoError(name, "");
    });
    syncMaintenanceType();
    setStatus(activity.status === "em-espera" ? "em-espera" : "concluida");
    setSavedRecordId(activity.recordId || "");
    parentLink = activity.parentRecordId
      ? { recordId: activity.parentRecordId, index: Number(activity.parentActivityIndex) || 0 }
      : null;
    if ((savedRecordId || parentLink) && occurrenceSaveStatus) {
      occurrenceSaveStatus.textContent =
        "Ocorrência carregada para atualização individual.";
    }
    if (parentLink && saveOccurrenceButton) {
      saveOccurrenceButton.textContent = "Atualizar ocorrência";
    }
    refreshExportLabel();
  };

  const getData = async () => {
    // Espera também arquivos escolhidos enquanto a espera já estava em curso.
    let pending;
    do {
      pending = Object.values(photoPromises);
      await Promise.all(pending);
    } while (pending.some((promise, index) => promise !== Object.values(photoPromises)[index]));
    const hasMeaningfulData = Boolean(
      fields.atividade.value.trim() ||
      fields.ordemServico.value.trim() ||
      fields.responsavel.value.trim() ||
      fields.motivo.value.trim() ||
      PHOTO_FIELDS.some((name) => photos[name])
    );
    return {
      dataAntes: hasMeaningfulData ? fields.dataAntes.value : "",
      dataDepois: hasMeaningfulData ? fields.dataDepois.value : "",
      ordemServico: hasMeaningfulData ? fields.ordemServico.value.trim() : "",
      responsavel: fields.responsavel.value.trim(),
      atividade: fields.atividade.value.trim(),
      status: fields.status.value,
      motivo:
        fields.status.value === "em-espera" ? fields.motivo.value.trim() : "",
      fotoAntes: photos.fotoAntes,
      fotoDepois: photos.fotoDepois,
      fotoAntes2: photos.fotoAntes2,
      fotoDepois2: photos.fotoDepois2,
      ...Object.fromEntries(
        PHOTO_FIELDS.flatMap((name) => [
          [`${name}Nome`, photos[name] ? photoMeta[name].nome : ""],
          [`${name}Tipo`, photos[name] ? photoMeta[name].tipo : ""]
        ])
      ),
      legendaAntes: fields.legendaAntes.value.trim(),
      legendaDepois: fields.legendaDepois.value.trim(),
      legendaAntes2: fields.legendaAntes2.value.trim(),
      legendaDepois2: fields.legendaDepois2.value.trim()
    };
  };

  header.addEventListener("click", () => {
    card.classList.toggle("is-open");
  });

  for (const field of [
    fields.dataAntes,
    fields.dataDepois,
    fields.ordemServico,
    fields.responsavel,
    fields.atividade,
    fields.motivo
  ]) {
    field.addEventListener("input", updateSummary);
    field.addEventListener("change", updateSummary);
  }

  fields.dataAntes.addEventListener("change", renderFormWaitingReminders);

  fields.atividade.addEventListener("input", applyDefaultDates);
  fields.responsavel.addEventListener("input", applyDefaultDates);

  statusButtons.forEach((button) => {
    button.addEventListener("click", () => setStatus(button.dataset.status));
  });

  for (const fieldName of PHOTO_FIELDS) {
    const photoField = fields[fieldName];
    photoField.addEventListener("change", () => {
      const file = photoField.files[0];
      // Sem arquivo (seleção cancelada): mantém o anexo que já estava na caixa.
      if (!file) return;
      applyDefaultDates();
      setPhotoError(fieldName, "");
      const label = photoField.closest(".photo-input");
      const token = ++photoTokens[fieldName];
      const current = () => token === photoTokens[fieldName];
      label.classList.add("is-uploading");
      photoPromises[fieldName] = prepareAttachment(file)
        .then((attachment) => {
          if (current()) setPhoto(fieldName, attachment.value, attachment);
        })
        .catch((error) => {
          if (!current()) return;
          setPhoto(fieldName, "");
          setPhotoError(fieldName, `Arquivo não carregado: ${error.message}`);
          setFormMessage(
            `${PHOTO_LABELS[fieldName]} não foi carregada: ${error.message}`,
            "error"
          );
        })
        .finally(() => {
          if (!current()) return;
          label.classList.remove("is-uploading");
          updateSummary();
        });
    });
  }

  const entry = {
    card,
    fields,
    getData,
    reset,
    setData,
    setNumber,
    syncMaintenanceType,
    updateSummary,
    getSavedRecordId: () => savedRecordId,
    getParentLink: () => parentLink,
    refreshExportLabel,
    getPhotoErrors: () => ({ ...photoErrors }),
    setSavedRecordId
  };

  clearButton.addEventListener("click", () => {
    reset();
    updateSummary();
  });
  removeButton?.addEventListener("click", () => removeOccurrenceCard(entry));
  saveOccurrenceButton?.addEventListener("click", () => saveOccurrenceFromCard(entry));
  exportOccurrenceButton?.addEventListener("click", () =>
    exportOccurrenceFromCard(entry, exportOccurrenceButton)
  );

  activityContainer.append(fragment);
  activityCards.push(entry);
  renumberActivityCards();

  if (data) setData(data);
  else reset();

  updateProgress();
  refreshIcons();
  return entry;
}

function bindNavigation() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      setView(button.dataset.view);
      setSidebarOpen(false);
    });
  });

  document.querySelectorAll("[data-go-to]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.goTo === "report") resetForm();
      setView(button.dataset.goTo);
    });
  });

  sidebarToggle.addEventListener("click", () => {
    setSidebarOpen(!document.body.classList.contains("is-sidebar-open"));
  });
  sidebarOverlay.addEventListener("click", () => setSidebarOpen(false));
}

function bindDashboardFilters() {
  dashboardPeriodFilter.addEventListener("change", renderDashboard);
  dashboardTypeFilter.addEventListener("change", renderDashboard);
  clearDashboardFiltersButton.addEventListener("click", () => {
    dashboardPeriodFilter.value = "all";
    dashboardTypeFilter.value = "all";
    renderDashboard();
  });
}

function bindRecordFilters() {
  recordSearch.addEventListener("input", renderRecords);
  recordTypeFilter.addEventListener("change", renderRecords);
  recordStatusFilter.addEventListener("change", renderRecords);
  recordSortFilter.addEventListener("change", renderRecords);
  clearRecordFiltersButton.addEventListener("click", () => {
    recordSearch.value = "";
    recordTypeFilter.value = "all";
    recordStatusFilter.value = "all";
    recordSortFilter.value = "recent";
    renderRecords();
  });
}

function bindRecordActions() {
  saveRecordButton.addEventListener("click", async () => {
    await saveCurrentRecord();
  });

  resetRecordButton.addEventListener("click", () => {
    if (!confirm("Limpar todos os campos desta medição?")) return;
    resetForm();
  });

  recordsList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-record-action]");
    if (!button) return;
    const record = state.records.find((item) => item.id === button.dataset.recordId);
    if (!record) return;

    const action = button.dataset.recordAction;
    if (action === "edit") {
      loadRecordIntoForm(record);
      setView("report");
      return;
    }

    if (action === "delete") {
      if (!confirm(`Apagar a medição ${recordLabel(record)}?`)) return;
      await deleteRecord(record.id);
      state.records = state.records.filter((item) => item.id !== record.id);
      if (state.editingRecordId === record.id) resetForm();
      renderAllDataViews();
      return;
    }

    if (action === "edit-activity") {
      const activityIndex = Number(button.dataset.activityIndex);
      loadRecordIntoForm(record, { openActivityIndex: activityIndex });
      setView("report");
      return;
    }

    if (action === "delete-activity") {
      const activityIndex = Number(button.dataset.activityIndex);
      await deleteActivityFromRecord(record, activityIndex);
      return;
    }

    if (action === "export-activity") {
      const activityIndex = Number(button.dataset.activityIndex);
      const activity = filledActivities(record)[activityIndex];
      if (!activity) return;
      await exportSavedActivity(record, activity, button);
      return;
    }

    if (action === "export") {
      await exportSavedRecord(record, button);
    }
  });

  const openRecordFromSummary = (event) => {
    const button = event.target.closest("[data-open-record]");
    if (!button) return;
    setView("records");
    const box = recordsList.querySelector(
      `[data-record-box="${CSS.escape(button.dataset.openRecord)}"]`
    );
    if (box) {
      box.open = true;
      box.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  dashboardContent.addEventListener("click", openRecordFromSummary);
  operationsContent.addEventListener("click", openRecordFromSummary);
}

function bindBackupActions() {
  exportRecordsButton.addEventListener("click", exportRecordsBackup);
  importRecordsButton.addEventListener("click", () => recordsImportInput.click());
  recordsImportInput.addEventListener("change", importRecordsBackup);
}

function bindReportForm() {
  reportForm.elements.tipoManutencao.addEventListener("change", () => {
    syncMaintenanceCards();
    activityCards[0]?.card.classList.add("is-open");
  });

  waitingReminders.addEventListener("click", (event) => {
    const button = event.target.closest("[data-open-activity]");
    if (!button) return;
    const activity = activityCards[Number(button.dataset.openActivity)];
    if (!activity) return;
    activity.card.classList.add("is-open");
    activity.card.scrollIntoView({ behavior: "smooth", block: "center" });
    const focusTarget =
      activity.fields.status.value === "em-espera"
        ? activity.fields.motivo
        : activity.fields.atividade;
    focusTarget.focus({ preventScroll: true });
  });
}

function exportRecordsBackup() {
  const payload = JSON.stringify(
    {
      format: "medicao-pro-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      records: state.records
    },
    null,
    2
  );
  const url = URL.createObjectURL(
    new Blob([payload], { type: "application/json;charset=utf-8" })
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `backup-medicoes-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function importRecordsBackup(event) {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;

  try {
    const payload = JSON.parse(await file.text());
    if (payload?.format !== "medicao-pro-backup" || !Array.isArray(payload.records)) {
      throw new Error("O arquivo selecionado não é um backup válido do Medição Pro.");
    }

    const validRecords = payload.records.filter(isValidBackupRecord);
    if (!validRecords.length) {
      throw new Error("O backup não contém medições válidas.");
    }
    if (
      !confirm(
        `Importar ${validRecords.length} medição(ões)? Registros com o mesmo identificador serão atualizados.`
      )
    ) {
      return;
    }

    await Promise.all(validRecords.map((record) => putRecord(record)));
    state.records = await getAllRecords();
    renderAllDataViews();
    alert(`${validRecords.length} medição(ões) importada(s) com sucesso.`);
  } catch (error) {
    alert(error.message || "Não foi possível importar o backup.");
  }
}

function isValidBackupRecord(record) {
  return Boolean(
    record &&
      typeof record.id === "string" &&
      record.metadata &&
      typeof record.metadata === "object" &&
      Array.isArray(record.activities)
  );
}

function setView(view) {
  state.view = view;
  const viewTitles = {
    dashboard: "Dashboard",
    report: state.editingRecordId ? "Editar medição" : "Nova medição",
    records: "Registros",
    operations: "Visão operacional"
  };
  currentViewTitle.textContent = viewTitles[view] || "Medição Pro";
  document.querySelectorAll("[data-view-panel]").forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.viewPanel === view);
  });
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === view);
  });
  if (view === "dashboard") renderDashboard();
  if (view === "records") renderRecords();
  if (view === "operations") renderOperations();
  refreshIcons();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setSidebarOpen(open) {
  document.body.classList.toggle("is-sidebar-open", open);
  sidebarToggle.setAttribute("aria-expanded", String(open));
  sidebarToggle.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
  sidebar.setAttribute("aria-hidden", String(!open && window.innerWidth <= 760));
}

function resetForm() {
  reportForm.reset();
  // reset() também volta o seletor de formato ao padrão; mantém a escolha do usuário.
  syncFormatControls();
  reportForm.elements.competencia.value = currentCompetenceLabel();
  reportForm.elements.contratada.value = DEFAULT_CONTRACTOR;
  reportForm.elements.tipoManutencao.value = "Preventiva";
  state.editingRecordId = null;
  clearOccurrenceCards();
  addOccurrenceCard(undefined, { focus: false });
  activityCards[0]?.card.classList.add("is-open");
  syncMaintenanceCards();
  renderFormWaitingReminders();
  reportPageTitle.textContent = "Nova medição de serviço";
  reportPageDescription.textContent =
    "Preencha os dados, registre o problema, adicione as fotos de antes e depois e gere o relatório.";
  saveRecordButton.textContent = "Salvar medição";
  setFormMessage("Salve a medição ou gere o relatório.");
}

function loadRecordIntoForm(record, options = {}) {
  resetForm();
  state.editingRecordId = record.id;
  reportForm.elements.competencia.value = record.metadata.competencia || "";
  reportForm.elements.ordemServico.value = record.metadata.ordemServico || "";
  reportForm.elements.contratada.value =
    record.metadata.contratada || DEFAULT_CONTRACTOR;
  reportForm.elements.tipoManutencao.value =
    record.metadata.tipoManutencao || "";
  clearOccurrenceCards();
  const activities = filledActivities(record);
  const list = activities.length ? activities : [{}];
  list.forEach((activityData, index) => {
    addOccurrenceCard(
      {
        ...activityData,
        ordemServico:
          activityData.ordemServico || record.metadata.ordemServico || "",
        recordId: list.length === 1 ? record.id : "",
        parentRecordId: list.length > 1 ? record.id : "",
        parentActivityIndex: index
      },
      { focus: false }
    );
  });
  syncMaintenanceCards();
  const openIndex = Number.isInteger(options.openActivityIndex)
    ? Math.min(Math.max(options.openActivityIndex, 0), activityCards.length - 1)
    : 0;
  activityCards.forEach((entry, index) =>
    entry.card.classList.toggle("is-open", index === openIndex)
  );
  if (options.openActivityIndex !== undefined) {
    requestAnimationFrame(() => {
      activityCards[openIndex]?.card.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    });
  }
  reportPageTitle.textContent = `Editar ${recordLabel(record)}`;
  reportPageDescription.textContent =
    "Atualize os dados e salve para manter o histórico sincronizado.";
  saveRecordButton.textContent = "Atualizar medição";
  setFormMessage(`Editando registro salvo em ${formatDateTime(record.updatedAt)}.`);
}


async function saveOccurrenceFromCard(activityCard) {
  if (!activityCard) return null;

  const requiredFields = [
    reportForm.elements.competencia,
    reportForm.elements.contratada,
    reportForm.elements.tipoManutencao
  ];
  const invalidField = requiredFields.find((field) => !field.checkValidity());
  if (invalidField) {
    invalidField.reportValidity();
    return null;
  }

  const activity = await activityCard.getData();
  if (!String(activity.atividade || "").trim()) {
    activityCard.card.classList.add("is-open");
    activityCard.fields.atividade.focus();
    setFormMessage("Descreva a ocorrência antes de salvar individualmente.", "error");
    return null;
  }

  if (activity.status === "em-espera" && !String(activity.motivo || "").trim()) {
    activityCard.card.classList.add("is-open");
    activityCard.fields.motivo.focus();
    setFormMessage("Informe o motivo da espera antes de salvar a ocorrência.", "error");
    return null;
  }

  const formData = new FormData(reportForm);
  const order =
    String(activity.ordemServico || "").trim() ||
    String(formData.get("ordemServico") || "").trim();

  if (!order) {
    activityCard.card.classList.add("is-open");
    activityCard.fields.ordemServico.focus();
    setFormMessage("Informe o número da OS desta ocorrência.", "error");
    return null;
  }

  activity.ordemServico = order;

  const now = new Date().toISOString();
  const parentLink = activityCard.getParentLink?.();
  const parent = parentLink
    ? state.records.find((item) => item.id === parentLink.recordId)
    : null;
  const parentTarget = parent ? filledActivities(parent)[parentLink.index] : null;
  const parentPosition = parentTarget ? parent.activities.indexOf(parentTarget) : -1;

  let record;
  if (parent && parentPosition >= 0) {
    // Atualiza só esta ocorrência dentro da medição de origem.
    parent.activities[parentPosition] = activity;
    parent.updatedAt = now;
    record = parent;
  } else {
    // Só atualiza o registro criado por este mesmo cartão; uma ocorrência nova
    // sempre gera um registro novo, mesmo que a OS se repita.
    const existing = state.records.find(
      (item) => item.id === activityCard.getSavedRecordId()
    );
    record = {
      id: existing?.id || crypto.randomUUID(),
      metadata: {
        competencia: String(formData.get("competencia") || "").trim(),
        ordemServico: order,
        contratada: String(formData.get("contratada") || "").trim(),
        tipoManutencao: String(formData.get("tipoManutencao") || "").trim()
      },
      activities: [activity],
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      lastExportedAt: existing?.lastExportedAt || "",
      lastExportFormat: existing?.lastExportFormat || ""
    };
  }

  await putRecord(record);
  upsertStateRecord(record);
  if (record !== parent) activityCard.setSavedRecordId(record.id);
  renderAllDataViews();
  const photoWarning = photoErrorSummary([activityCard]);
  setFormMessage(
    photoWarning
      ? `Ocorrência ${recordLabel(record)} salva, mas ${photoWarning}`
      : `Ocorrência ${recordLabel(record)} salva individualmente.`,
    photoWarning ? "warning" : "success"
  );
  return { record, activity };
}

function photoErrorSummary(entries = activityCards) {
  const problems = entries.flatMap((entry, index) =>
    Object.entries(entry.getPhotoErrors?.() || {}).map(([field]) => {
      const label = PHOTO_LABELS[field].replace(/^A /, "a ");
      return entries.length > 1 ? `${label} da ocorrência ${index + 1}` : label;
    })
  );
  if (!problems.length) return "";
  const list =
    problems.length === 1
      ? problems[0]
      : `${problems.slice(0, -1).join(", ")} e ${problems.at(-1)}`;
  return `${list} não ${problems.length === 1 ? "foi carregada" : "foram carregadas"}. Veja o aviso na caixa da foto e selecione a imagem novamente.`;
}

async function exportOccurrenceFromCard(activityCard, button) {
  if (!button || !activityCard) return;
  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = "Preparando...";

  try {
    const saved = await saveOccurrenceFromCard(activityCard);
    if (!saved) return;
    button.textContent = "Exportando...";
    const { record, activity } = saved;
    await exportSavedRecord(
      { ...record, activities: [activity] },
      button,
      currentFormat(),
      {
        successMessage: `${reportFormatLabel()} da ocorrência baixado com sucesso.`,
        touchRecord: record
      }
    );
    const photoWarning = photoErrorSummary([activityCard]);
    if (photoWarning) {
      setFormMessage(`${reportFormatLabel()} baixado, mas ${photoWarning}`, "warning");
    }
  } finally {
    button.disabled = false;
    button.textContent = originalText;
    activityCard.refreshExportLabel();
  }
}

async function deleteActivityFromRecord(record, activityIndex) {
  const activities = filledActivities(record);
  const target = activities[activityIndex];
  if (!target) return;

  if (
    !confirm(
      `Excluir a ocorrência ${String(activityIndex + 1).padStart(2, "0")} de ${recordLabel(
        record
      )}?`
    )
  ) {
    return;
  }

  const remaining = (record.activities || []).filter((item) => item !== target);
  const stillFilled = remaining.filter((item) =>
    String(item?.atividade || "").trim()
  );

  if (!stillFilled.length) {
    await deleteRecord(record.id);
    state.records = state.records.filter((item) => item.id !== record.id);
    if (state.editingRecordId === record.id) resetForm();
    renderAllDataViews();
    return;
  }

  record.activities = remaining;
  record.updatedAt = new Date().toISOString();
  await putRecord(record);
  upsertStateRecord(record);
  if (state.editingRecordId === record.id) {
    loadRecordIntoForm(state.records.find((item) => item.id === record.id));
  }
  renderAllDataViews();
}

async function saveCurrentRecord(options = {}) {
  const record = await collectCurrentRecord();
  if (!record) return null;
  await putRecord(record);
  upsertStateRecord(record);
  state.editingRecordId = record.id;
  reportPageTitle.textContent = `Editar ${recordLabel(record)}`;
  reportPageDescription.textContent =
    "Atualize os dados e salve para manter o histórico sincronizado.";
  saveRecordButton.textContent = "Atualizar medição";
  renderAllDataViews();
  if (!options.silent) {
    const photoWarning = photoErrorSummary();
    setFormMessage(
      photoWarning ? `Medição salva, mas ${photoWarning}` : "Medição salva nos registros.",
      photoWarning ? "warning" : "success"
    );
  }
  return record;
}

async function collectCurrentRecord() {
  if (!reportForm.reportValidity()) return null;

  try {
    validateActivities();
  } catch (error) {
    setFormMessage(error.message, "error");
    return null;
  }

  saveRecordButton.disabled = true;
  generateButton.disabled = true;
  setFormMessage("Preparando fotos e salvando a medição...");

  try {
    const formData = new FormData(reportForm);
    const collected = await Promise.all(
      activityCards.map((activity) => activity.getData())
    );
    const activities = collected.filter(
      (activity) =>
        activity.atividade ||
        activity.fotoAntes ||
        activity.fotoDepois ||
        activity.fotoAntes2 ||
        activity.fotoDepois2 ||
        activity.ordemServico ||
        activity.responsavel
    );
    const firstActivityOrder = activities.find((activity) => activity.ordemServico)?.ordemServico || "";
    const existing = state.records.find(
      (record) => record.id === state.editingRecordId
    );
    const now = new Date().toISOString();
    return {
      id: existing?.id || crypto.randomUUID(),
      metadata: {
        competencia: String(formData.get("competencia") || "").trim(),
        ordemServico: String(formData.get("ordemServico") || firstActivityOrder || "").trim(),
        contratada: String(formData.get("contratada") || "").trim(),
        tipoManutencao: String(formData.get("tipoManutencao") || "").trim()
      },
      activities,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      lastExportedAt: existing?.lastExportedAt || ""
    };
  } finally {
    saveRecordButton.disabled = false;
    generateButton.disabled = false;
  }
}

reportForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const record = await saveCurrentRecord({ silent: true });
  if (!record) return;
  await exportSavedRecord(record, generateButton, currentFormat());
  const photoWarning = photoErrorSummary();
  if (photoWarning) setFormMessage(`Relatório gerado, mas ${photoWarning}`, "warning");
});

async function exportSavedActivity(parentRecord, activity, button, format = currentFormat()) {
  const order = String(activity.ordemServico || parentRecord.metadata?.ordemServico || "").trim();
  await exportSavedRecord(
    {
      ...parentRecord,
      metadata: { ...parentRecord.metadata, ordemServico: order },
      activities: [{ ...activity, ordemServico: order }]
    },
    button,
    format,
    {
      successMessage: `${reportFormatLabel(format)} da ocorrência baixado com sucesso.`,
      touchRecord: parentRecord
    }
  );
}

async function exportSavedRecord(record, button, format = currentFormat(), options = {}) {
  const formatLabel = reportFormatLabel(format);
  button.disabled = true;
  setFormMessage(`Gerando ${formatLabel} e preparando a exportação...`);

  try {
    const payload = JSON.stringify({
      metadata: record.metadata,
      activities: reportActivities(record.activities),
      format,
      recipient: state.config.recipient
    });
    if (new Blob([payload]).size > 45 * 1024 * 1024) {
      throw new Error(
        "As fotos ultrapassaram o limite do envio. Remova algumas imagens e tente novamente."
      );
    }

    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload
    });

    if (response.status === 401) {
      redirectToLogin();
      throw new Error("Sessão expirada. Entre novamente.");
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || "Falha ao gerar o relatório.");
    }

    const emailStatus = response.headers.get("X-Report-Email");
    const recipient =
      response.headers.get("X-Report-Recipient") || state.config.recipient;
    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = filenameFromResponse(response);
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(downloadUrl);

    // Marca a exportação no registro salvo (a cópia usada no PDF de uma
    // ocorrência isolada nunca é gravada no lugar dele).
    const exportedRecord = options.touchRecord || record;
    exportedRecord.lastExportedAt = new Date().toISOString();
    exportedRecord.lastExportFormat = format;
    exportedRecord.updatedAt = exportedRecord.lastExportedAt;
    await putRecord(exportedRecord);
    upsertStateRecord(exportedRecord);
    renderAllDataViews();

    if (emailStatus === "sent") {
      setFormMessage(
        `Relatório baixado e enviado para ${recipient}.`,
        "success"
      );
    } else if (emailStatus === "failed") {
      setFormMessage(
        `${formatLabel} baixado, mas o envio por e-mail falhou. Tente novamente.`,
        "warning"
      );
    } else if (emailStatus === "not-configured") {
      setFormMessage(options.successMessage || `${formatLabel} baixado com sucesso.`, "success");
    } else {
      setFormMessage(
        options.successMessage || `${formatLabel} baixado. Não foi possível confirmar o status do envio por e-mail.`,
        options.successMessage ? "success" : "warning"
      );
    }
  } catch (error) {
    setFormMessage(error.message, "error");
  } finally {
    button.disabled = false;
  }
}

// No envio para o relatório, documentos que não são imagem vão só com nome e
// tipo (o PDF mostra o nome); imagens vão como estão salvas.
function reportActivities(activities = []) {
  return activities.map((activity = {}) => {
    const copy = { ...activity };
    for (const field of ATTACHMENT_FIELDS) {
      const tipo = copy[`${field}Tipo`] || guessAttachmentType(copy[field]);
      if (copy[field] && !isImageType(tipo)) copy[field] = "";
    }
    return copy;
  });
}

function renderAllDataViews() {
  renderDashboard();
  renderRecords();
  renderOperations();
}

function currentMaintenanceType() {
  return reportForm.elements.tipoManutencao.value;
}

function syncMaintenanceCards() {
  activityCards.forEach((activity) => activity.syncMaintenanceType(currentMaintenanceType()));
}

function renderFormWaitingReminders() {
  const waiting = activityCards
    .map((activity, index) => ({
      index,
      atividade: activity.fields.atividade.value.trim(),
      responsavel: activity.fields.responsavel.value.trim(),
      motivo: activity.fields.motivo.value.trim(),
      dataAntes: activity.fields.dataAntes.value,
      status: activity.fields.status.value
    }))
    .filter((activity) => activity.status === "em-espera");

  waitingReminders.hidden = !waiting.length;
  if (!waiting.length) {
    waitingReminderList.innerHTML = "";
    return;
  }

  waitingReminderList.innerHTML = waiting
    .map(
      (activity) => `
        <article class="waiting-reminder-card">
          <div>
            <span>Item ${String(activity.index + 1).padStart(2, "0")} em espera</span>
            <strong>${escapeHtml(activity.atividade || "Problema não descrito")}</strong>
            <small>${escapeHtml(activity.responsavel || "Sem responsável técnico")} · Entrada ${formatDate(activity.dataAntes || currentDateInputValue())}</small>
          </div>
          <p>${escapeHtml(activity.motivo || "Informe o motivo da espera para salvar o registro.")}</p>
          <button type="button" class="secondary-action" data-open-activity="${activity.index}">
            Abrir item
          </button>
        </article>
      `
    )
    .join("");
}

function renderRecords() {
  const search = normalizeText(recordSearch.value);
  const type = recordTypeFilter.value;
  const status = recordStatusFilter.value;
  const sort = recordSortFilter.value;
  const filtered = state.records
    .filter((record) => {
      const activities = filledActivities(record);
      const haystack = normalizeText(
        [
          record.metadata.competencia,
          record.metadata.ordemServico,
          record.metadata.contratada,
          record.metadata.tipoManutencao,
          ...activities.flatMap((activity) => [
            activity.ordemServico,
            activity.responsavel,
            activity.atividade,
            activity.motivo
          ])
        ].join(" ")
      );
      if (search && !haystack.includes(search)) return false;
      if (type !== "all" && record.metadata.tipoManutencao !== type) return false;
      if (status === "complete" && activities.some(isWaiting)) return false;
      if (status === "waiting" && !activities.some(isWaiting)) return false;
      return true;
    });

  filtered.sort((a, b) => {
    if (sort === "oldest") {
      return String(a.updatedAt).localeCompare(String(b.updatedAt));
    }
    if (sort === "order") {
      return recordLabel(a).localeCompare(recordLabel(b), "pt-BR", {
        numeric: true
      });
    }
    return String(b.updatedAt).localeCompare(String(a.updatedAt));
  });

  recordsResultCount.textContent = `${filtered.length} ${
    filtered.length === 1 ? "registro" : "registros"
  }`;

  if (!filtered.length) {
    recordsList.innerHTML = `
      <div class="empty-state">
        <strong>Nenhuma medição encontrada</strong>
        <p>Salve uma nova medição ou ajuste os filtros.</p>
        <button type="button" class="primary-action" data-go-to-empty="report">
          Criar medição
        </button>
      </div>
    `;
    refreshIcons();
    recordsList
      .querySelector("[data-go-to-empty]")
      ?.addEventListener("click", () => {
        resetForm();
        setView("report");
      });
    return;
  }

  // Mantém abertas as caixas que o usuário tinha aberto (ex.: depois de baixar).
  const openIds = new Set(
    [...recordsList.querySelectorAll("details.record-box[open]")].map((box) => box.dataset.recordBox)
  );
  recordsList.innerHTML = filtered.map(recordBox).join("");
  openIds.forEach((id) => {
    const box = recordsList.querySelector(`[data-record-box="${CSS.escape(id)}"]`);
    if (box) box.open = true;
  });
  refreshIcons();
}

function recordBox(record) {
  const activities = filledActivities(record);
  const waiting = activities.filter(isWaiting).length;
  const completed = activities.length - waiting;
  const statusClass = waiting ? "is-waiting" : "is-complete";
  const statusText = waiting ? `${waiting} em espera` : "Concluída";

  return `
    <details class="record-box" data-record-box="${escapeAttr(record.id)}">
      <summary>
        <span class="record-main">
          <strong>${escapeHtml(recordLabel(record))}</strong>
          <small>${escapeHtml(record.metadata.competencia || "Sem competência")} · ${escapeHtml(record.metadata.tipoManutencao || "Tipo não informado")}</small>
        </span>
        <span class="record-count">${activities.length} atividade(s)</span>
        <span class="activity-status ${statusClass}">${statusText}</span>
        <span class="record-date">${formatDate(record.updatedAt)}</span>
      </summary>
      <div class="record-box__content">
        <div class="record-brand">
          <img src="/assets/logo-grupo-autoglass.png?v=20260915" alt="Grupo Autoglass" width="915" height="113" loading="lazy" />
          <span>Relatório fotográfico de manutenção</span>
        </div>
        <div class="record-metadata">
          ${metadataItem("Ordem de serviço", record.metadata.ordemServico || "Não informada")}
          ${metadataItem("Contratada", record.metadata.contratada || "Não informada")}
          ${metadataItem("Tipo de manutenção", record.metadata.tipoManutencao || "Não informado")}
          ${metadataItem("Atualizado em", formatDateTime(record.updatedAt))}
        </div>

        <div class="record-activity-list">
          ${activities.map((activity, index) => recordActivity(activity, index, record)).join("")}
        </div>

        <div class="record-actions">
          <span>${completed} concluída(s) · ${waiting} em espera</span>
          <div>
            <button type="button" class="secondary-action" data-record-action="edit" data-record-id="${escapeAttr(record.id)}">Editar medição</button>
            <button type="button" class="secondary-action" data-record-action="export" data-record-id="${escapeAttr(record.id)}">Baixar ${escapeHtml(reportFormatLabel())}</button>
            <button type="button" class="danger-action" data-record-action="delete" data-record-id="${escapeAttr(record.id)}">Apagar medição</button>
          </div>
        </div>
      </div>
    </details>
  `;
}

function recordActivity(activity, index, record = null) {
  const waiting = isWaiting(activity);
  return `
    <article class="saved-activity">
      <div class="saved-activity__heading">
        <span>${String(index + 1).padStart(2, "0")}</span>
        <div>
          <strong>${escapeHtml(activity.atividade)}</strong>
          <small>${escapeHtml(activity.ordemServico || "OS não informada")} · ${escapeHtml(activity.responsavel || "Sem responsável técnico")} · ${formatActivityDates(activity)}</small>
        </div>
        <span class="activity-status ${waiting ? "is-waiting" : "is-complete"}">${waiting ? "Em espera" : "Concluída"}</span>
      </div>
      ${activity.motivo ? `<p><strong>Motivo da espera:</strong> ${escapeHtml(activity.motivo)}</p>` : ""}
      ${savedPhotoGallery(activity)}
      ${record ? `
        <div class="saved-activity__actions">
          <button type="button" class="secondary-action" data-record-action="edit-activity" data-record-id="${escapeAttr(record.id)}" data-activity-index="${index}">Editar ocorrência</button>
          <button type="button" class="secondary-action" data-record-action="export-activity" data-record-id="${escapeAttr(record.id)}" data-activity-index="${index}">Baixar ${escapeHtml(reportFormatLabel())}</button>
          <button type="button" class="danger-action" data-record-action="delete-activity" data-record-id="${escapeAttr(record.id)}" data-activity-index="${index}">Excluir ocorrência</button>
        </div>
      ` : ""}
    </article>
  `;
}

function attachmentEntry(activity, field, label, caption) {
  return {
    label,
    src: activity[field],
    caption,
    nome: activity[`${field}Nome`] || "",
    tipo: activity[`${field}Tipo`] || guessAttachmentType(activity[field])
  };
}

function savedPhotoGallery(activity) {
  const rows = [
    {
      title: "Antes",
      tone: "is-entry",
      photos: [
        attachmentEntry(activity, "fotoAntes", "Antes 1", activity.legendaAntes),
        attachmentEntry(activity, "fotoAntes2", "Antes 2", activity.legendaAntes2)
      ]
    },
    {
      title: "Depois",
      tone: "is-exit",
      photos: [
        attachmentEntry(activity, "fotoDepois", "Depois 1", activity.legendaDepois),
        attachmentEntry(activity, "fotoDepois2", "Depois 2", activity.legendaDepois2)
      ]
    }
  ]
    .map((row) => ({ ...row, photos: row.photos.filter((photo) => photo.src) }))
    .filter((row) => row.photos.length);

  if (!rows.length) return "";

  return `
    <div class="saved-photo-rows">
      ${rows
        .map(
          (row) => `
            <div class="saved-photo-row ${row.tone}">
              <span class="saved-photo-row__title">${escapeHtml(row.title)}</span>
              <div class="saved-photos">
                ${row.photos
                  .map(
                    (photo) => `
                      <figure>
                        ${
                          isImageType(photo.tipo)
                            ? `<img src="${escapeAttr(photo.src)}" alt="${escapeAttr(photo.label)}" loading="lazy">`
                            : `<a class="saved-document" href="${escapeAttr(photo.src)}" target="_blank" rel="noopener" download="${escapeAttr(photo.nome || "documento")}"><strong>${escapeHtml(documentBadge(photo))}</strong><span>${escapeHtml(photo.nome || "Documento anexado")}</span></a>`
                        }
                        <figcaption>
                          <strong>${escapeHtml(photo.label)}</strong>
                          ${photo.caption ? `<span>${escapeHtml(photo.caption)}</span>` : ""}
                        </figcaption>
                      </figure>
                    `
                  )
                  .join("")}
              </div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderDashboard() {
  const records = dashboardFilteredRecords();
  const activities = records.flatMap(filledActivities);
  const waiting = activities.filter(isWaiting);
  const completed = activities.length - waiting.length;
  const completionRate = activities.length
    ? Math.round((completed / activities.length) * 100)
    : 0;
  const average = records.length
    ? (activities.length / records.length).toFixed(1).replace(".", ",")
    : "0";
  const typeCounts = countBy(
    records,
    (record) => record.metadata.tipoManutencao || "Não informado"
  );
  const topType = sortedEntries(typeCounts)[0];
  const monthly = buildMonthlySeries(records);
  const recent = records
    .slice()
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, 5);

  dashboardContent.innerHTML = `
    ${
      records.length !== state.records.length
        ? `<div class="filter-context"><strong>${records.length}</strong> de ${state.records.length} medições consideradas nos indicadores.</div>`
        : ""
    }
    <section class="dashboard-metrics">
      ${dashboardMetric("Medições", records.length, "registros salvos")}
      ${dashboardMetric("Atividades", activities.length, `${average} por medição`)}
      ${dashboardMetric("Concluídas", completed, `${completionRate}% do total`, "green")}
      ${dashboardMetric("Em espera", waiting.length, waiting.length ? "exigem acompanhamento" : "sem pendências", waiting.length ? "amber" : "green")}
      ${dashboardMetric("Taxa de conclusão", `${completionRate}%`, `${completed} de ${activities.length} atividades`, "blue")}
    </section>

    <section class="dashboard-grid">
      <article class="panel dashboard-panel">
        <div class="panel-title">
          <div>
            <h2>Tipos de manutenção</h2>
            <p>Distribuição quantitativa das medições.</p>
          </div>
        </div>
        ${renderBarChart(sortedEntries(typeCounts), records.length, "Nenhuma medição registrada.")}
      </article>

      <article class="panel dashboard-panel">
        <div class="panel-title">
          <div>
            <h2>Evolução mensal</h2>
            <p>Medições salvas nos últimos seis meses.</p>
          </div>
        </div>
        ${renderMonthlyChart(monthly)}
      </article>
    </section>

    <section class="dashboard-grid dashboard-grid--analysis">
      <article class="panel dashboard-panel">
        <div class="panel-title">
          <div>
            <h2>Análise operacional</h2>
            <p>Leitura automática dos dados registrados.</p>
          </div>
        </div>
        <div class="insight-list">
          ${insightItem("Maior demanda", topType ? `${topType[0]} representa ${percentage(topType[1], records.length)}% das medições.` : "Aguardando registros para identificar a maior demanda.")}
          ${insightItem("Acompanhamento", waiting.length ? `${waiting.length} atividade(s) estão em espera em ${records.filter((record) => filledActivities(record).some(isWaiting)).length} medições.` : "Sem atividades em espera atualmente.")}
          ${insightItem("Produtividade", records.length ? `A média atual é de ${average} atividade(s) por medição.` : "A média será calculada após o primeiro registro.")}
        </div>
        ${waiting.length ? `
          <div class="waiting-reasons">
            <strong>Motivos recentes de espera</strong>
            ${waiting.slice(0, 4).map((activity) => `<p>${escapeHtml(activity.motivo || "Motivo não informado")}</p>`).join("")}
          </div>
        ` : ""}
      </article>

      <article class="panel dashboard-panel">
        <div class="panel-title">
          <div>
            <h2>Medições recentes</h2>
            <p>Últimos registros atualizados.</p>
          </div>
        </div>
        ${recent.length ? `
          <div class="recent-records">
            ${recent.map((record) => `
              <button type="button" data-open-record="${escapeAttr(record.id)}">
                <span>
                  <strong>${escapeHtml(recordLabel(record))}</strong>
                  <small>${escapeHtml(record.metadata.tipoManutencao || "Tipo não informado")}</small>
                </span>
                <span>${formatDate(record.updatedAt)} <i data-lucide="chevron-right" aria-hidden="true"></i></span>
              </button>
            `).join("")}
          </div>
        ` : `<div class="chart-empty">Nenhuma medição registrada.</div>`}
      </article>
    </section>
  `;
  refreshIcons();
}

function dashboardFilteredRecords() {
  const period = dashboardPeriodFilter.value;
  const type = dashboardTypeFilter.value;
  const threshold =
    period === "all"
      ? null
      : new Date(Date.now() - Number(period) * 24 * 60 * 60 * 1000);

  return state.records.filter((record) => {
    if (type !== "all" && record.metadata.tipoManutencao !== type) return false;
    if (threshold) {
      const updatedAt = new Date(record.updatedAt || record.createdAt);
      if (Number.isNaN(updatedAt.getTime()) || updatedAt < threshold) return false;
    }
    return true;
  });
}

function renderOperations() {
  const records = state.records
    .slice()
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const activities = records.flatMap((record) =>
    filledActivities(record).map((activity) => ({ activity, record }))
  );
  const waiting = activities.filter(({ activity }) => isWaiting(activity));
  const responsibleCounts = countBy(
    activities.filter(({ activity }) => activity.responsavel),
    ({ activity }) => activity.responsavel
  );
  const latestExports = records.filter((record) => record.lastExportedAt).slice(0, 5);

  operationsContent.innerHTML = `
    <section class="operations-summary">
      ${operationMetric("Pendências abertas", waiting.length, waiting.length ? "requerem acompanhamento" : "operação em dia", waiting.length ? "amber" : "green")}
      ${operationMetric("Responsáveis técnicos ativos", Object.keys(responsibleCounts).length, "nomes identificados", "blue")}
      ${operationMetric("Relatórios exportados", latestExports.length, "entre os registros recentes", "teal")}
    </section>

    <section class="operations-layout">
      <article class="panel operations-primary">
        <div class="panel-title">
          <div>
            <h2>Fila de acompanhamento</h2>
            <p>Atividades em espera, ordenadas pela atualização da medição.</p>
          </div>
          <span class="section-count">${waiting.length}</span>
        </div>
        ${
          waiting.length
            ? `<div class="operations-table">
                <div class="operations-table__head">
                  <span>Ordem / atividade</span>
                  <span>Responsável técnico</span>
                  <span>Motivo</span>
                  <span>Atualização</span>
                </div>
                ${waiting
                  .map(
                    ({ activity, record }) => `
                      <button type="button" class="operations-row" data-open-record="${escapeAttr(record.id)}">
                        <span>
                          <strong>${escapeHtml(recordLabel(record))}</strong>
                          <small>${escapeHtml(activity.atividade)}</small>
                        </span>
                        <span>${escapeHtml(activity.responsavel || "Não informado")}</span>
                        <span>${escapeHtml(activity.motivo || "Motivo não informado")}</span>
                        <span>${formatDate(record.updatedAt)}</span>
                      </button>
                    `
                  )
                  .join("")}
              </div>`
            : `<div class="positive-state">
                <i data-lucide="circle-check-big" aria-hidden="true"></i>
                <strong>Nenhuma atividade em espera</strong>
                <p>As medições registradas não possuem pendências abertas.</p>
              </div>`
        }
      </article>

      <aside class="operations-side">
        <article class="panel">
          <div class="panel-title">
            <div>
              <h2>Distribuição por responsável técnico</h2>
              <p>Quantidade de atividades registradas.</p>
            </div>
          </div>
          ${renderBarChart(sortedEntries(responsibleCounts).slice(0, 6), activities.length, "Nenhum responsável técnico informado.")}
        </article>
        <article class="panel">
          <div class="panel-title">
            <div>
              <h2>Últimas exportações</h2>
              <p>Relatórios gerados recentemente.</p>
            </div>
          </div>
          ${
            latestExports.length
              ? `<div class="export-history">${latestExports
                  .map(
                    (record) => `
                      <button type="button" data-open-record="${escapeAttr(record.id)}">
                        <span>
                          <strong>${escapeHtml(recordLabel(record))}</strong>
                          <small>${escapeHtml(record.metadata.competencia || "Sem competência")}</small>
                        </span>
                        <time>${formatDateTime(record.lastExportedAt)}</time>
                      </button>
                    `
                  )
                  .join("")}</div>`
              : `<div class="compact-empty">Nenhum relatório exportado ainda.</div>`
          }
        </article>
      </aside>
    </section>
  `;
  refreshIcons();
}

function operationMetric(label, value, hint, tone) {
  return `
    <article class="operation-metric is-${tone}">
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${hint}</small>
    </article>
  `;
}

function dashboardMetric(label, value, hint, tone = "") {
  return `
    <article class="dashboard-metric ${tone ? `is-${tone}` : ""}">
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${hint}</small>
    </article>
  `;
}

function renderBarChart(entries, total, emptyMessage) {
  if (!entries.length) return `<div class="chart-empty">${emptyMessage}</div>`;
  const max = Math.max(...entries.map(([, value]) => value), 1);
  return `
    <div class="bar-chart">
      ${entries.map(([label, value]) => `
        <div class="bar-row">
          <span>${escapeHtml(label)}</span>
          <div><i style="width:${Math.round((value / max) * 100)}%"></i></div>
          <strong>${value} <small>(${percentage(value, total)}%)</small></strong>
        </div>
      `).join("")}
    </div>
  `;
}

function renderMonthlyChart(monthly) {
  const max = Math.max(...monthly.map((item) => item.value), 1);
  return `
    <div class="monthly-chart">
      ${monthly.map((item) => `
        <div class="month-column">
          <strong>${item.value}</strong>
          <div><i style="height:${Math.max(6, Math.round((item.value / max) * 100))}%"></i></div>
          <span>${item.label}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function insightItem(title, text) {
  return `<div class="insight-item"><strong>${title}</strong><p>${text}</p></div>`;
}

function buildMonthlySeries(records) {
  const formatter = new Intl.DateTimeFormat("pt-BR", { month: "short" });
  const now = new Date();
  return Array.from({ length: 6 }, (_, offset) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - offset), 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    return {
      key,
      label: formatter.format(date).replace(".", ""),
      value: records.filter((record) => String(record.createdAt).slice(0, 7) === key).length
    };
  });
}

function validateActivities() {
  const filled = activityCards.filter(({ fields }) =>
    fields.atividade.value.trim()
  );
  if (!filled.length) throw new Error("Cadastre ao menos um problema ou serviço executado.");

  const missingOrder = filled.find(
    ({ fields }) =>
      !fields.ordemServico.value.trim() && !reportForm.elements.ordemServico.value.trim()
  );
  if (missingOrder) {
    missingOrder.card.classList.add("is-open");
    missingOrder.fields.ordemServico.focus();
    throw new Error("Informe a OS da ocorrência ou a OS geral do formulário.");
  }

  const waitingWithoutReason = filled.find(
    ({ fields }) =>
      fields.status.value === "em-espera" && !fields.motivo.value.trim()
  );
  if (waitingWithoutReason) {
    waitingWithoutReason.card.classList.add("is-open");
    waitingWithoutReason.fields.motivo.focus();
    throw new Error("Informe o motivo do problema que está em espera.");
  }
}

function updateProgress() {
  const total = activityCards.filter(({ fields }) =>
    fields.atividade.value.trim()
  ).length;
  activityProgress.textContent = `${total} ${
    total === 1 ? "ocorrência" : "ocorrências"
  }`;
}

// Prepara o arquivo escolhido: imagens viram JPEG leve (o que aparece no PDF);
// qualquer outro documento é guardado como veio. No banco de dados (Netlify ou
// servidor próprio) o arquivo é enviado e o registro guarda só o endereço.
async function prepareAttachment(file) {
  if (!file) throw new Error("nenhum arquivo selecionado.");

  let image = null;
  if (file.size <= MAX_PHOTO_BYTES) {
    try {
      image = await imageToJpeg(file);
    } catch {
      image = null;
    }
  }

  const blob = image ? image.blob : file;
  const tipo = image ? "image/jpeg" : file.type || "application/octet-stream";
  const nome = image ? jpegName(file.name) : file.name || "documento";

  if (!image && file.size > MAX_DOCUMENT_BYTES) {
    throw new Error("o documento passa de 15 MB. Escolha um arquivo menor.");
  }

  const looksLikePhoto =
    /^image\//i.test(file.type || "") ||
    /\.(jpe?g|png|webp|heic|heif|gif|bmp|tiff?|avif)$/i.test(file.name || "");
  const notice =
    !image && looksLikePhoto
      ? "Esta foto não abriu neste navegador e foi anexada como documento (no PDF aparece só o nome). Para a imagem aparecer, envie em JPG ou PNG."
      : "";

  if (usesServerStorage()) {
    const value = await uploadAttachment(blob, nome, tipo);
    return { value, nome, tipo, notice, previewUrl: image ? image.dataUrl : "" };
  }

  const value = image ? image.dataUrl : await blobToDataUrl(blob);
  return { value, nome, tipo, notice, previewUrl: image ? image.dataUrl : "" };
}

async function imageToJpeg(file) {
  const dataUrl = await fileToDataUrl(file);
  const blob = await (await fetch(dataUrl)).blob();
  if (!blob.size) throw new Error("imagem vazia");
  return { dataUrl, blob };
}

function jpegName(name = "") {
  const base = String(name || "foto").replace(/\.[^.]+$/, "") || "foto";
  return `${base}.jpg`;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("não foi possível ler o arquivo."));
    reader.readAsDataURL(blob);
  });
}

function usesServerStorage() {
  return Boolean(state.config.storage && state.config.storage !== "none");
}

// Só JPG e PNG contam como imagem: é o que o relatório consegue embutir.
// As fotos escolhidas são sempre convertidas para JPG antes de salvar.
function isImageType(tipo) {
  return /^image\/(jpeg|jpg|png)$/i.test(String(tipo || "").trim());
}

function guessAttachmentType(value) {
  const text = String(value || "");
  const match = text.match(/^data:([^;,]+)/i);
  if (match) return match[1];
  return text ? "image/jpeg" : "";
}

function documentBadge(meta = {}) {
  const fromName = String(meta.nome || "").match(/\.([A-Za-z0-9]{1,5})$/);
  if (fromName) return fromName[1].toUpperCase();
  const fromType = String(meta.tipo || "").split("/")[1];
  return (fromType || "ARQ").slice(0, 5).toUpperCase();
}

async function uploadAttachment(blob, nome, tipo) {
  const id = crypto.randomUUID();
  const parts = Math.max(1, Math.ceil(blob.size / UPLOAD_PART_BYTES));
  for (let part = 0; part < parts; part += 1) {
    const chunk = blob.slice(part * UPLOAD_PART_BYTES, (part + 1) * UPLOAD_PART_BYTES);
    const query = new URLSearchParams({
      id,
      part: String(part),
      parts: String(parts),
      size: String(blob.size),
      name: nome,
      type: tipo
    });
    await fetchWithRetry(`/api/files?${query}`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: chunk
    });
  }
  return `/api/files?id=${id}`;
}

async function fetchWithRetry(url, options, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { credentials: "same-origin", ...options });
      if (response.status === 401) {
        redirectToLogin();
        throw new Error("sessão expirada. Entre novamente.");
      }
      if (response.ok) return response;
      const data = await response.json().catch(() => ({}));
      lastError = new Error(data.error || `falha no envio (${response.status}).`);
      if (response.status < 500 && response.status !== 429) break;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
  }
  throw lastError;
}

async function fileToDataUrl(file) {
  if (!file) return "";
  // Não confia no tipo informado: alguns celulares entregam a foto sem tipo
  // ou sem extensão. Se o navegador conseguir abrir, a foto é aceita.
  if (file.size > MAX_PHOTO_BYTES) {
    throw new Error("a imagem passa de 30 MB. Escolha uma foto menor.");
  }

  const source = await decodeImage(file);
  try {
    const canvas = document.createElement("canvas");
    const targetWidth = 900;
    const targetHeight = 450;
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, targetWidth, targetHeight);
    const scale = Math.min(targetWidth / source.width, targetHeight / source.height);
    const width = source.width * scale;
    const height = source.height * scale;
    context.drawImage(
      source.image,
      (targetWidth - width) / 2,
      (targetHeight - height) / 2,
      width,
      height
    );
    return canvas.toDataURL("image/jpeg", 0.65);
  } finally {
    source.release();
  }
}

// Abre a imagem em qualquer formato que o navegador saiba ler (JPG, PNG, WEBP,
// HEIC em aparelhos compatíveis), respeitando a rotação gravada pela câmera.
async function decodeImage(file) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        image: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close?.()
      };
    } catch {
      // Tenta de novo pelo elemento <img> abaixo.
    }
  }

  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = reject;
      element.src = sourceUrl;
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("vazia");
    return {
      image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(sourceUrl)
    };
  } catch {
    URL.revokeObjectURL(sourceUrl);
    throw new Error(
      "este navegador não conseguiu abrir a imagem (formato não suportado). Envie a foto em JPG ou PNG."
    );
  }
}

async function getServiceConfig() {
  try {
    const response = await fetch("/api/config", { credentials: "same-origin" });
    if (!response.ok) throw new Error("Configuração indisponível.");
    const config = await response.json();
    return {
      recipient: config.recipient || "comercial1@primecsg.com.br",
      emailConfigured: Boolean(config.emailConfigured),
      storage: config.storage || "none"
    };
  } catch {
    return {
      recipient: "comercial1@primecsg.com.br",
      emailConfigured: false,
      storage: "none"
    };
  }
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(RECORD_STORE)) {
        const store = database.createObjectStore(RECORD_STORE, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAllRecords() {
  if (usesServerStorage()) {
    const response = await fetchWithRetry("/api/records", { method: "GET", cache: "no-store" });
    const data = await response.json();
    return Array.isArray(data.records) ? data.records : [];
  }
  return getAllLocalRecords();
}

async function getAllLocalRecords() {
  try {
    const database = await openDatabase();
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(RECORD_STORE, "readonly");
      const request = transaction.objectStore(RECORD_STORE).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => database.close();
      transaction.onerror = () => database.close();
    });
  } catch (error) {
    console.error("Falha ao carregar registros.", error);
    return [];
  }
}

async function putRecord(record) {
  if (usesServerStorage()) {
    const prepared = await uploadInlineAttachments(record);
    if (prepared !== record) {
      record.activities = prepared.activities;
    }
    await fetchWithRetry("/api/records", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ record })
    });
    return;
  }
  return putLocalRecord(record);
}

// Registros antigos (ou backups) guardam as fotos dentro do próprio registro.
// Antes de ir para o banco, cada foto vira um arquivo enviado separadamente.
async function uploadInlineAttachments(record) {
  const hasInline = (record.activities || []).some((activity) =>
    ATTACHMENT_FIELDS.some((field) => String(activity?.[field] || "").startsWith("data:"))
  );
  if (!hasInline) return record;

  const activities = [];
  for (const activity of record.activities || []) {
    const copy = { ...activity };
    for (const field of ATTACHMENT_FIELDS) {
      const value = String(copy[field] || "");
      if (!value.startsWith("data:")) continue;
      const blob = await (await fetch(value)).blob();
      const tipo = copy[`${field}Tipo`] || blob.type || guessAttachmentType(value);
      const nome = copy[`${field}Nome`] || (isImageType(tipo) ? "foto.jpg" : "documento");
      copy[field] = await uploadAttachment(blob, nome, tipo);
      copy[`${field}Nome`] = nome;
      copy[`${field}Tipo`] = tipo;
    }
    activities.push(copy);
  }
  return { ...record, activities };
}

async function putLocalRecord(record) {
  const database = await openDatabase();
  return await new Promise((resolve, reject) => {
    const transaction = database.transaction(RECORD_STORE, "readwrite");
    transaction.objectStore(RECORD_STORE).put(record);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

async function deleteRecord(id) {
  if (usesServerStorage()) {
    await fetchWithRetry(`/api/records?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    return;
  }
  const database = await openDatabase();
  return await new Promise((resolve, reject) => {
    const transaction = database.transaction(RECORD_STORE, "readwrite");
    transaction.objectStore(RECORD_STORE).delete(id);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

// Quando o sistema passa a usar o banco de dados, os registros que estavam só
// neste navegador são enviados uma vez (a cópia local é mantida).
async function sendLocalRecordsToServer() {
  if (!usesServerStorage()) return;
  try {
    if (localStorage.getItem(MIGRATION_FLAG) === "1") return;
  } catch {
    return;
  }
  const local = await getAllLocalRecords();
  if (local.length) {
    const remote = await getAllRecords();
    const remoteIds = new Set(remote.map((record) => record.id));
    for (const record of local) {
      if (!remoteIds.has(record.id)) await putRecord(structuredClone(record));
    }
  }
  try {
    localStorage.setItem(MIGRATION_FLAG, "1");
  } catch {
    // Sem armazenamento local: tenta de novo na próxima vez (ids repetidos são ignorados).
  }
}

function upsertStateRecord(record) {
  const index = state.records.findIndex((item) => item.id === record.id);
  if (index >= 0) state.records[index] = structuredClone(record);
  else state.records.push(structuredClone(record));
}

function filledActivities(record) {
  return (record.activities || []).filter((activity) =>
    String(activity.atividade || "").trim()
  );
}

function isWaiting(activity) {
  return activity.status === "em-espera";
}

function recordLabel(record) {
  const order = String(record.metadata.ordemServico || "").trim();
  if (order) return /^os(?:\s|-)/i.test(order) ? order : `OS ${order}`;
  return `Medição ${record.metadata.competencia || ""}`.trim();
}

function metadataItem(label, value) {
  return `<div><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function formatActivityDates(activity) {
  const before = activity.dataAntes ? formatDate(activity.dataAntes) : "sem data";
  const after = activity.dataDepois ? formatDate(activity.dataDepois) : "sem data";
  return `${before} a ${after}`;
}

function filenameFromResponse(response) {
  const disposition = response.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="([^"]+)"/i);
  return match?.[1] || `Relatorio Fotografico.${currentFormat()}`;
}

function loadExportFormat() {
  try {
    const saved = localStorage.getItem(FORMAT_STORAGE_KEY);
    return REPORT_FORMATS[saved] ? saved : "pdf";
  } catch {
    return "pdf";
  }
}

function currentFormat() {
  return REPORT_FORMATS[state.exportFormat] ? state.exportFormat : "pdf";
}

function reportFormatLabel(format = currentFormat()) {
  return (REPORT_FORMATS[format] || REPORT_FORMATS.pdf).label;
}

function setExportFormat(format) {
  state.exportFormat = REPORT_FORMATS[format] ? format : "pdf";
  try {
    localStorage.setItem(FORMAT_STORAGE_KEY, state.exportFormat);
  } catch {
    // Sem armazenamento local: vale só nesta sessão.
  }
  syncFormatControls();
  updateGenerateButton();
  activityCards.forEach((entry) => entry.refreshExportLabel());
  // Atualiza só os rótulos, sem redesenhar a lista (mantém as caixas abertas).
  recordsList
    .querySelectorAll('[data-record-action="export"], [data-record-action="export-activity"]')
    .forEach((button) => {
      button.textContent = `Baixar ${reportFormatLabel()}`;
    });
}

function bindFormatSelectors() {
  document.querySelectorAll("[data-report-format]").forEach((select) => {
    select.addEventListener("change", () => setExportFormat(select.value));
  });
  document.querySelectorAll("[data-format-option]").forEach((button) => {
    button.addEventListener("click", () => setExportFormat(button.dataset.formatOption));
  });
  syncFormatControls();
}

function syncFormatControls() {
  const format = currentFormat();
  document.querySelectorAll("[data-report-format]").forEach((select) => {
    select.value = format;
  });
  document.querySelectorAll("[data-format-option]").forEach((button) => {
    const active = button.dataset.formatOption === format;
    button.setAttribute("aria-pressed", String(active));
    button.classList.toggle("is-active", active);
  });
}

function updateGenerateButton() {
  generateButton.textContent = `Salvar e gerar ${reportFormatLabel()}`;
}

function setFormMessage(message, type = "") {
  formStatus.textContent = message;
  formStatus.className = type ? `${type}-text` : "";
}

function formatDate(value) {
  if (!value) return "—";
  const date = String(value).includes("T")
    ? new Date(value)
    : new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function countBy(items, selector) {
  return items.reduce((counts, item) => {
    const key = selector(item);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function sortedEntries(counts) {
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function percentage(value, total) {
  return total ? Math.round((value / total) * 100) : 0;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("\n", " ");
}

function refreshIcons() {
  window.lucide?.createIcons({
    attrs: {
      "aria-hidden": "true",
      "stroke-width": 1.8
    }
  });
}
