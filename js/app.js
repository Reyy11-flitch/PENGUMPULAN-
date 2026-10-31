import {
  parseData,
  courses,
  filterTugas,
  findById,
  paragraphs,
  excerpt,
  formatTanggal,
  formatSize,
  fileKind,
  fileUrl,
} from "./logic.js";

// Semua teks dari data ditulis lewat textContent/append (bukan innerHTML).
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
}

export async function loadData() {
  try {
    const res = await fetch("data/tugas.json", { cache: "no-cache" });
    if (!res.ok) return { ok: false, error: `Tidak dapat memuat data/tugas.json (HTTP ${res.status}).` };
    return parseData(await res.text());
  } catch (e) {
    return { ok: false, error: `Tidak dapat memuat data/tugas.json: ${e.message}` };
  }
}

function showMessage(root, title, detail, link) {
  const box = el("div", { class: "message" }, el("h2", { text: title }));
  if (detail) box.append(el("p", { text: detail }));
  if (link) box.append(el("p", {}, el("a", { href: link.href, text: link.label })));
  root.replaceChildren(box);
}

function applySiteInfo(data) {
  const { pemilik, judul_situs } = data;
  document.title = judul_situs;
  document.getElementById("site-title").textContent = judul_situs;
  const owner = [pemilik.nama, pemilik.nim].filter(Boolean).join(" · ");
  document.getElementById("site-owner").textContent = owner;
  const year = new Date().getFullYear();
  document.getElementById("footer-text").textContent = [`© ${year}`, pemilik.nama].filter(Boolean).join(" ");
}

function buildCard(t) {
  const children = [];
  if (t.gambar.length > 0) {
    const img = el("img", { class: "thumb", src: fileUrl(t.gambar[0].file), alt: t.gambar[0].keterangan, loading: "lazy" });
    img.addEventListener("error", () => {
      img.replaceWith(el("div", { class: "thumb-missing", text: "Gambar tidak ditemukan" }));
    });
    children.push(img);
  }
  const body = el(
    "div",
    { class: "card-body" },
    el("h2", { text: t.judul }),
    el("p", { class: "meta", text: `${t.mata_kuliah} · ${formatTanggal(t.tanggal)}` }),
  );
  if (t.teks) body.append(el("p", { class: "excerpt", text: excerpt(t.teks) }));
  if (t.lampiran.length > 0) body.append(el("span", { class: "badge", text: `${t.lampiran.length} lampiran` }));
  children.push(body);
  return el("a", { class: "card", href: `tugas.html?id=${encodeURIComponent(t.id)}` }, ...children);
}

export function renderHome(root, data) {
  if (data.tugas.length === 0) {
    showMessage(root, "Belum ada tugas");
    return;
  }

  const filters = document.getElementById("filters");
  const state = { matkul: "", query: "" };
  const list = el("div", { class: "cards" });

  const chips = ["", ...courses(data.tugas)].map((matkul) => {
    const chip = el("button", { class: "chip", type: "button", text: matkul || "Semua", "aria-pressed": String(matkul === "") });
    chip.addEventListener("click", () => {
      state.matkul = matkul;
      chips.forEach((c) => c.setAttribute("aria-pressed", String(c === chip)));
      renderList();
    });
    return chip;
  });
  const search = el("input", { class: "search", type: "search", placeholder: "Cari judul tugas…", "aria-label": "Cari judul tugas" });
  search.addEventListener("input", () => {
    state.query = search.value;
    renderList();
  });
  filters.replaceChildren(...chips, search);
  filters.hidden = false;

  function renderList() {
    const hasil = filterTugas(data.tugas, state);
    if (hasil.length === 0) {
      list.replaceChildren(el("p", { class: "status", text: "Tidak ada tugas yang cocok." }));
    } else {
      list.replaceChildren(...hasil.map(buildCard));
    }
  }

  renderList();
  root.replaceChildren(list);
}

const KIND_LABEL = { pdf: "PDF", image: "IMG", doc: "DOC", sheet: "XLS", slide: "PPT", archive: "ZIP", other: "FILE" };

export async function fetchFileInfo(url) {
  try {
    const res = await fetch(url, { method: "HEAD" });
    const header = res.headers.get("content-length");
    const size = header === null || !Number.isFinite(Number(header)) ? null : Number(header);
    return { exists: res.ok, size };
  } catch {
    return { exists: false, size: null };
  }
}

export function openLightbox(images, index) {
  const opener = document.activeElement;
  const many = images.length > 1;
  let i = index;

  const img = el("img", { class: "lb-img", alt: "" });
  const missing = el("p", { class: "lb-missing", text: "Gambar tidak ditemukan" });
  missing.hidden = true;
  const caption = el("figcaption", { class: "lb-caption" });
  const close = el("button", { class: "lb-btn lb-close", type: "button", "aria-label": "Tutup", text: "×" });
  const prev = el("button", { class: "lb-btn lb-prev", type: "button", "aria-label": "Gambar sebelumnya", text: "‹" });
  const next = el("button", { class: "lb-btn lb-next", type: "button", "aria-label": "Gambar berikutnya", text: "›" });
  const controls = many ? [close, prev, next] : [close];
  const overlay = el(
    "div",
    { class: "lightbox", role: "dialog", "aria-modal": "true", "aria-label": "Pratinjau gambar" },
    ...controls,
    el("figure", { class: "lb-figure" }, img, missing, caption),
  );

  function show(n) {
    i = (n + images.length) % images.length;
    const g = images[i];
    img.hidden = false;
    missing.hidden = true;
    img.alt = g.keterangan;
    img.src = fileUrl(g.file);
    caption.textContent = many ? `${g.keterangan} (${i + 1}/${images.length})` : g.keterangan;
  }
  function closeBox() {
    document.removeEventListener("keydown", onKey);
    overlay.remove();
    document.body.classList.remove("no-scroll");
    if (opener && opener.focus) opener.focus();
  }
  function onKey(e) {
    if (e.key === "Escape") closeBox();
    else if (many && e.key === "ArrowLeft") show(i - 1);
    else if (many && e.key === "ArrowRight") show(i + 1);
    else if (e.key === "Tab") {
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (controls.length === 1 || (e.shiftKey && document.activeElement === first)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  img.addEventListener("error", () => {
    img.hidden = true;
    missing.hidden = false;
  });
  close.addEventListener("click", closeBox);
  prev.addEventListener("click", () => show(i - 1));
  next.addEventListener("click", () => show(i + 1));
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeBox();
  });

  document.addEventListener("keydown", onKey);
  document.body.classList.add("no-scroll");
  document.body.append(overlay);
  show(index);
  close.focus();
}

function buildGallery(images) {
  const wrap = el("div", { class: "gallery" });
  images.forEach((g, i) => {
    const img = el("img", { src: fileUrl(g.file), alt: g.keterangan, loading: "lazy" });
    const btn = el("button", { class: "shot-btn", type: "button", "aria-label": `Perbesar gambar: ${g.keterangan}` }, img);
    btn.addEventListener("click", () => openLightbox(images, i));
    img.addEventListener("error", () => btn.replaceWith(el("div", { class: "thumb-missing", text: "Gambar tidak ditemukan" })));
    wrap.append(el("figure", { class: "shot" }, btn, el("figcaption", { text: g.keterangan })));
  });
  return wrap;
}

function buildAttachments(list) {
  const ul = el("ul", { class: "files" });
  list.forEach((l) => {
    const url = fileUrl(l.file);
    const kind = fileKind(l.file);
    const size = el("span", { class: "file-size" });
    const actions = el(
      "span",
      { class: "file-actions" },
      el("a", { class: "btn", href: url, download: l.file.split("/").pop(), text: "Unduh" }),
    );
    if (kind === "pdf") {
      actions.append(el("a", { class: "btn btn-ghost", href: url, target: "_blank", rel: "noopener", text: "Buka" }));
    }
    const row = el(
      "li",
      { class: "file" },
      el("span", { class: "file-icon", "aria-hidden": "true", text: KIND_LABEL[kind] }),
      el("span", { class: "file-main" }, el("span", { class: "file-name", text: l.nama }), size),
      actions,
    );
    fetchFileInfo(url).then(({ exists, size: bytes }) => {
      if (!exists) {
        actions.replaceWith(el("span", { class: "file-missing", text: "File tidak tersedia" }));
        row.classList.add("is-missing");
        return;
      }
      size.textContent = formatSize(bytes);
    });
    ul.append(row);
  });
  return el("section", { class: "attachments" }, el("h3", { text: "Lampiran" }), ul);
}

export function renderDetail(root, data, id) {
  const t = findById(data.tugas, id);
  if (!t) {
    showMessage(root, "Tugas tidak ditemukan", "Tugas yang dicari tidak ada, atau tautannya salah.", {
      href: "index.html",
      label: "← Kembali ke daftar",
    });
    return;
  }
  document.title = `${t.judul} — ${data.judul_situs}`;
  const post = el(
    "article",
    { class: "post" },
    el("h2", { class: "post-title", text: t.judul }),
    el("p", { class: "meta", text: `${t.mata_kuliah} · ${formatTanggal(t.tanggal)}` }),
  );
  paragraphs(t.teks).forEach((p) => post.append(el("p", { class: "post-text", text: p })));
  if (t.gambar.length > 0) post.append(buildGallery(t.gambar));
  if (t.lampiran.length > 0) post.append(buildAttachments(t.lampiran));
  root.replaceChildren(post);
}

async function main() {
  const root = document.getElementById("app");
  const result = await loadData();
  if (!result.ok) {
    showMessage(root, "Data tugas tidak dapat dibaca", result.error);
    return;
  }
  result.warnings.forEach((w) => console.warn("[tugas.json]", w));
  applySiteInfo(result.data);
  const page = document.body.dataset.page;
  if (page === "home") renderHome(root, result.data);
  else if (page === "detail") renderDetail(root, result.data, new URLSearchParams(location.search).get("id"));
}

main();
