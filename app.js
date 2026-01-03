const STORAGE_KEYS = {
  entries: "zichoLogEntries",
  outputs: "zichoLlmOutputs",
};

const PROMPT_TEMPLATE = `あなたは体調ログを「観察メモ」に変換する補助者です。
制約:
- 医療的診断や断定はしない
- 危険な運動指示はしない
- 10〜15分以内で終わる低負荷の提案だけ
- 出力は次のフォーマット(1〜6)を守る
- 1)〜6)の番号と見出しを必ず含める（番号の抜け/順序違いは不可）

対象期間: {FROM} 〜 {TO}

ログ:
{LOGS}

出力フォーマット:
1) 5行以内の要約
2) 多い訴え（箇条書き）
3) 悪化しやすい条件（仮説、各1行）
4) 要注意サイン（条件付きで、断定しない）
5) 明日の一歩（1つだけ、10〜15分以内、具体的に）
6) 自嘲の中立化（短文）`;

const navButtons = document.querySelectorAll(".nav-button");
const sections = document.querySelectorAll(".app-section");
const toast = document.getElementById("toast");

const logForm = document.getElementById("log-form");
const entryDateInput = document.getElementById("entry-date");
const complaintInput = document.getElementById("complaint-text");
const weightScoreInput = document.getElementById("weight-score");
const tagOptions = document.getElementById("tag-options");

const logList = document.getElementById("log-list");
const filterFromInput = document.getElementById("filter-from");
const filterToInput = document.getElementById("filter-to");
const applyFilterButton = document.getElementById("apply-filter");

const editForm = document.getElementById("edit-form");
const editIdInput = document.getElementById("edit-id");
const editDateInput = document.getElementById("edit-date");
const editComplaintInput = document.getElementById("edit-complaint");
const editWeightScoreInput = document.getElementById("edit-weight-score");
const editTagOptions = document.getElementById("edit-tag-options");
const deleteLogButton = document.getElementById("delete-log");
const backToListButton = document.getElementById("back-to-list");

const llmFromInput = document.getElementById("llm-from");
const llmToInput = document.getElementById("llm-to");
const llmOutputText = document.getElementById("llm-output-text");
const generateLlmButton = document.getElementById("generate-llm");
const copyLlmButton = document.getElementById("copy-llm");
const copyStatus = document.getElementById("copy-status");

const outputFromInput = document.getElementById("output-from");
const outputToInput = document.getElementById("output-to");
const modelInfoInput = document.getElementById("model-info");
const rawOutputInput = document.getElementById("raw-output");
const saveLlmOutputButton = document.getElementById("save-llm-output");
const parseStatus = document.getElementById("parse-status");
const llmOutputList = document.getElementById("llm-output-list");

const exportFromInput = document.getElementById("export-from");
const exportToInput = document.getElementById("export-to");
const exportJsonButton = document.getElementById("export-json");

const weightScoreValue = document.getElementById("weight-score-value");

function initDateInputs() {
  const today = new Date().toISOString().slice(0, 10);
  entryDateInput.value = today;
  weightScoreInput.value = "1";
  filterToInput.value = today;
  llmToInput.value = today;
  outputToInput.value = today;
  exportToInput.value = today;
  setQuickRange(filterFromInput, filterToInput, 7);
  setQuickRange(llmFromInput, llmToInput, 7);
  setQuickRange(outputFromInput, outputToInput, 7);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2500);
}

function setQuickRange(fromInput, toInput, days) {
  const end = toInput.value ? new Date(toInput.value) : new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  fromInput.value = start.toISOString().slice(0, 10);
}

function activateSection(targetId) {
  sections.forEach((section) => {
    section.classList.toggle("is-active", section.id === targetId);
  });
  navButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.target === targetId);
  });
}

function loadData(key) {
  const raw = localStorage.getItem(key);
  if (!raw) {
    return [];
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    return [];
  }
}

function saveData(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function generateId() {
  if (window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toNullableNumber(value) {
  if (value === "" || value === null || Number.isNaN(Number(value))) {
    return null;
  }
  return Number(value);
}

function toNullableString(value) {
  if (!value) {
    return null;
  }
  return value.trim();
}

function formatShortText(text) {
  if (!text) {
    return "";
  }
  return text.length > 30 ? `${text.slice(0, 30)}…` : text;
}

function withinRange(date, from, to) {
  if (from && date < from) {
    return false;
  }
  if (to && date > to) {
    return false;
  }
  return true;
}

function filterEntries(entries, filters) {
  return entries.filter((entry) => {
    if (!withinRange(entry.entryDate, filters.from, filters.to)) {
      return false;
    }
    return true;
  });
}

function renderList() {
  const entries = loadData(STORAGE_KEYS.entries).sort((a, b) => {
    if (a.entryDate === b.entryDate) {
      return b.createdAt.localeCompare(a.createdAt);
    }
    return b.entryDate.localeCompare(a.entryDate);
  });
  const filters = {
    from: filterFromInput.value || null,
    to: filterToInput.value || null,
  };
  const filtered = filterEntries(entries, filters);
  logList.innerHTML = "";
  if (filtered.length === 0) {
    logList.innerHTML = "<p class=\"form-hint\">該当ログがありません。</p>";
    return;
  }
  filtered.forEach((entry) => {
    const item = document.createElement("div");
    item.className = "list-item";
    const tags = entry.tags && entry.tags.length ? entry.tags.join(", ") : "-";
    item.innerHTML = `
      <header>
        <strong>${entry.entryDate}</strong>
        <span>おもみ:${entry.weightScore ?? "-"} / タグ:${tags}</span>
      </header>
      <div>${formatShortText(entry.complaintText)}</div>
      <div class="form-actions">
        <button type="button" data-id="${entry.id}" class="open-detail">編集</button>
      </div>
    `;
    logList.appendChild(item);
  });
}

function populateEdit(entry) {
  editIdInput.value = entry.id;
  editDateInput.value = entry.entryDate;
  editComplaintInput.value = entry.complaintText;
  editWeightScoreInput.value = entry.weightScore ?? "";
  setSelectedTags(editTagOptions, entry.tags);
}

function updateRangeValue() {
  weightScoreValue.textContent = weightScoreInput.value;
}

function getSelectedTags(container) {
  return Array.from(container.querySelectorAll(".tag-button.is-active")).map((button) => button.dataset.tag);
}

function setSelectedTags(container, tags) {
  const active = new Set(tags || []);
  container.querySelectorAll(".tag-button").forEach((button) => {
    button.classList.toggle("is-active", active.has(button.dataset.tag));
  });
}

function getLogsForRange(from, to) {
  const entries = loadData(STORAGE_KEYS.entries);
  return entries
    .filter((entry) => withinRange(entry.entryDate, from, to))
    .sort((a, b) => a.entryDate.localeCompare(b.entryDate));
}

function buildLogsText(entries) {
  if (entries.length === 0) {
    return "- (ログなし)";
  }
  return entries
    .map((entry) => {
      const parts = [];
      if (entry.weightScore !== null) {
        parts.push(`おもみ${entry.weightScore}`);
      }
      if (entry.tags && entry.tags.length) {
        parts.push(`タグ:${entry.tags.join(", ")}`);
      }
      const detail = parts.length ? ` (${parts.join(" / ")})` : "";
      return `- ${entry.entryDate}: ${entry.complaintText}${detail}`;
    })
    .join("\n");
}

function parseLlmOutput(text) {
  const sections = {
    summaryText: "",
    patternsText: "",
    cautionsText: "",
    oneStepText: "",
    rewriteText: "",
  };
  const lines = text.split(/\r?\n/);
  const buffers = {
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
    6: [],
  };
  let current = null;
  lines.forEach((line) => {
    const match = line.match(/^\s*(\d)\)\s*(.*)$/);
    if (match) {
      current = Number(match[1]);
      buffers[current].push(match[2]);
      return;
    }
    if (current) {
      buffers[current].push(line);
    }
  });

  sections.summaryText = buffers[1].join("\n").trim();
  sections.patternsText = buffers[2].join("\n").trim();
  const cautionParts = [buffers[3].join("\n").trim(), buffers[4].join("\n").trim()].filter(Boolean);
  sections.cautionsText = cautionParts.join("\n");
  sections.oneStepText = buffers[5].join("\n").trim();
  sections.rewriteText = buffers[6].join("\n").trim();

  return sections;
}

function renderLlmOutputs() {
  const outputs = loadData(STORAGE_KEYS.outputs).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  llmOutputList.innerHTML = "";
  if (outputs.length === 0) {
    llmOutputList.innerHTML = "<p class=\"form-hint\">まだ保存されていません。</p>";
    return;
  }
  outputs.forEach((output) => {
    const parsed = Boolean(
      output.summaryText ||
        output.patternsText ||
        output.cautionsText ||
        output.oneStepText ||
        output.rewriteText
    );
    const item = document.createElement("div");
    item.className = "list-item";
    item.innerHTML = `
      <header>
        <strong>${output.targetRange.from} 〜 ${output.targetRange.to}</strong>
        <span>解析: ${parsed ? "成功" : "失敗"}</span>
      </header>
      <div>${formatShortText(output.summaryText || output.rawText)}</div>
      <div class="form-actions">
        <button type="button" data-id="${output.id}" class="open-output">開く</button>
      </div>
    `;
    llmOutputList.appendChild(item);
  });
}

function openOutputDetail(output) {
  const parsed = Boolean(
    output.summaryText || output.patternsText || output.cautionsText || output.oneStepText || output.rewriteText
  );
  const detail = `\n1) ${output.summaryText || ""}\n\n2) ${output.patternsText || ""}\n\n3/4) ${output.cautionsText || ""}\n\n5) ${output.oneStepText || ""}\n\n6) ${output.rewriteText || ""}\n\n(raw)\n${output.rawText}`;
  alert(`対象期間: ${output.targetRange.from} 〜 ${output.targetRange.to}\n解析: ${parsed ? "成功" : "失敗"}${detail}`);
}

navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activateSection(button.dataset.target);
  });
});

function handleTagClick(container, event) {
  const button = event.target.closest(".tag-button");
  if (!button) {
    return;
  }
  button.classList.toggle("is-active");
}

tagOptions.addEventListener("click", (event) => handleTagClick(tagOptions, event));
editTagOptions.addEventListener("click", (event) => handleTagClick(editTagOptions, event));

weightScoreInput.addEventListener("input", updateRangeValue);

logForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const entries = loadData(STORAGE_KEYS.entries);
  const now = new Date().toISOString();
  const entry = {
    id: generateId(),
    createdAt: now,
    entryDate: entryDateInput.value,
    complaintText: complaintInput.value.trim(),
    weightScore: toNullableNumber(weightScoreInput.value),
    tags: getSelectedTags(tagOptions),
    llmSummaryIds: [],
  };
  entries.push(entry);
  saveData(STORAGE_KEYS.entries, entries);
  logForm.reset();
  entryDateInput.value = new Date().toISOString().slice(0, 10);
  weightScoreInput.value = "1";
  setSelectedTags(tagOptions, []);
  updateRangeValue();
  renderList();
  showToast("保存しました");
});

applyFilterButton.addEventListener("click", () => {
  renderList();
});

document.querySelectorAll(".quick-range").forEach((button) => {
  button.addEventListener("click", () => {
    setQuickRange(filterFromInput, filterToInput, Number(button.dataset.range));
    renderList();
  });
});

logList.addEventListener("click", (event) => {
  const target = event.target.closest(".open-detail");
  if (!target) {
    return;
  }
  const entries = loadData(STORAGE_KEYS.entries);
  const entry = entries.find((item) => item.id === target.dataset.id);
  if (!entry) {
    return;
  }
  populateEdit(entry);
  activateSection("detail");
});

editForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const entries = loadData(STORAGE_KEYS.entries);
  const index = entries.findIndex((item) => item.id === editIdInput.value);
  if (index === -1) {
    return;
  }
  entries[index] = {
    ...entries[index],
    entryDate: editDateInput.value,
    complaintText: editComplaintInput.value.trim(),
    weightScore: toNullableNumber(editWeightScoreInput.value),
    tags: getSelectedTags(editTagOptions),
  };
  saveData(STORAGE_KEYS.entries, entries);
  renderList();
  activateSection("list");
  showToast("更新しました");
});

deleteLogButton.addEventListener("click", () => {
  const entries = loadData(STORAGE_KEYS.entries);
  const next = entries.filter((item) => item.id !== editIdInput.value);
  saveData(STORAGE_KEYS.entries, next);
  renderList();
  activateSection("list");
  showToast("削除しました");
});

backToListButton.addEventListener("click", () => {
  activateSection("list");
});

document.querySelectorAll(".quick-llm").forEach((button) => {
  button.addEventListener("click", () => {
    setQuickRange(llmFromInput, llmToInput, Number(button.dataset.range));
  });
});

document.querySelectorAll(".quick-llm-output").forEach((button) => {
  button.addEventListener("click", () => {
    setQuickRange(outputFromInput, outputToInput, Number(button.dataset.range));
  });
});

generateLlmButton.addEventListener("click", () => {
  const from = llmFromInput.value;
  const to = llmToInput.value;
  const entries = getLogsForRange(from, to);
  const logsText = buildLogsText(entries);
  llmOutputText.value = PROMPT_TEMPLATE.replace("{FROM}", from).replace("{TO}", to).replace("{LOGS}", logsText);
});

copyLlmButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(llmOutputText.value);
    copyStatus.textContent = "コピーしました";
    showToast("コピーしました");
  } catch (error) {
    copyStatus.textContent = "コピーに失敗しました";
    showToast("コピーに失敗しました");
  }
});

saveLlmOutputButton.addEventListener("click", () => {
  const rawText = rawOutputInput.value.trim();
  if (!rawText) {
    parseStatus.textContent = "返答テキストを貼り付けてください";
    return;
  }
  const outputs = loadData(STORAGE_KEYS.outputs);
  const parsed = parseLlmOutput(rawText);
  const parsedSuccess = Boolean(
    parsed.summaryText || parsed.patternsText || parsed.cautionsText || parsed.oneStepText || parsed.rewriteText
  );
  const output = {
    id: generateId(),
    createdAt: new Date().toISOString(),
    targetRange: {
      from: outputFromInput.value,
      to: outputToInput.value,
    },
    promptVersion: "v0.1",
    modelInfo: toNullableString(modelInfoInput.value),
    summaryText: parsed.summaryText,
    patternsText: parsed.patternsText,
    cautionsText: parsed.cautionsText,
    oneStepText: parsed.oneStepText,
    rewriteText: parsed.rewriteText,
    rawText,
  };
  outputs.push(output);
  saveData(STORAGE_KEYS.outputs, outputs);

  const entries = loadData(STORAGE_KEYS.entries);
  const updatedEntries = entries.map((entry) => {
    if (!withinRange(entry.entryDate, output.targetRange.from, output.targetRange.to)) {
      return entry;
    }
    const ids = new Set(entry.llmSummaryIds || []);
    ids.add(output.id);
    return { ...entry, llmSummaryIds: Array.from(ids) };
  });
  saveData(STORAGE_KEYS.entries, updatedEntries);

  rawOutputInput.value = "";
  modelInfoInput.value = "";
  parseStatus.textContent = parsedSuccess ? "パース成功" : "パース失敗（rawのみ保存）";
  renderLlmOutputs();
  showToast("LLM返答を保存しました");
});

llmOutputList.addEventListener("click", (event) => {
  const target = event.target.closest(".open-output");
  if (!target) {
    return;
  }
  const outputs = loadData(STORAGE_KEYS.outputs);
  const output = outputs.find((item) => item.id === target.dataset.id);
  if (!output) {
    return;
  }
  openOutputDetail(output);
});

exportJsonButton.addEventListener("click", () => {
  const entries = loadData(STORAGE_KEYS.entries);
  const outputs = loadData(STORAGE_KEYS.outputs);
  const from = exportFromInput.value || null;
  const to = exportToInput.value || null;
  const filteredEntries = from || to ? entries.filter((entry) => withinRange(entry.entryDate, from, to)) : entries;
  const filteredOutputs = from || to
    ? outputs.filter((output) => withinRange(output.targetRange.from, from, to))
    : outputs;
  const payload = {
    exportedAt: new Date().toISOString(),
    logEntries: filteredEntries,
    llmOutputs: filteredOutputs,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "zicho-log-export.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
});

initDateInputs();
updateRangeValue();
renderList();
renderLlmOutputs();
