// Logika murni (tanpa DOM) untuk blog tugas. Diuji dengan `node --test`.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[A-Za-z0-9_-]+$/;
const UPLOAD_DIR = "uploads/";

export function isValidDate(s) {
  if (typeof s !== "string" || !DATE_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(0);
  dt.setUTCFullYear(y, m - 1, d);
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function isSafeUploadPath(p) {
  return (
    typeof p === "string" &&
    p.length > UPLOAD_DIR.length &&
    p.startsWith(UPLOAD_DIR) &&
    !p.includes("..") &&
    !p.includes("\\") &&
    !p.includes(":")
  );
}

function text(v) {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  return "";
}

function baseName(path) {
  return path.slice(path.lastIndexOf("/") + 1);
}

function cleanItems(list, labelKey, label, warnings) {
  if (!Array.isArray(list)) return [];
  const out = [];
  list.forEach((item, i) => {
    if (item === null || typeof item !== "object" || !isSafeUploadPath(item.file)) {
      warnings.push(`${label}: item ${labelKey} #${i + 1} dibuang (file tidak valid atau di luar uploads/)`);
      return;
    }
    const key = labelKey === "gambar" ? "keterangan" : "nama";
    out.push({ file: item.file, [key]: text(item[key]) || baseName(item.file) });
  });
  return out;
}

export function parseData(raw) {
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: e.message };
  }
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    return { ok: false, error: "Isi tugas.json harus berupa objek JSON." };
  }
  if (!Array.isArray(obj.tugas)) {
    return { ok: false, error: 'Field "tugas" harus berupa daftar (array).' };
  }

  const warnings = [];
  const seen = new Set();
  const tugas = [];

  obj.tugas.forEach((e, i) => {
    const label = `Entri #${i + 1}`;
    if (e === null || typeof e !== "object") {
      warnings.push(`${label} dilewati: bukan objek`);
      return;
    }
    const id = text(e.id);
    const judul = text(e.judul);
    const mata_kuliah = text(e.mata_kuliah);
    const tanggal = text(e.tanggal);
    if (!ID_RE.test(id)) {
      warnings.push(`${label} dilewati: id kosong atau berisi karakter selain huruf, angka, - dan _`);
      return;
    }
    if (!judul || !mata_kuliah) {
      warnings.push(`${label} ("${id}") dilewati: judul atau mata_kuliah kosong`);
      return;
    }
    if (!isValidDate(tanggal)) {
      warnings.push(`${label} ("${id}") dilewati: tanggal harus berformat YYYY-MM-DD yang valid`);
      return;
    }
    if (seen.has(id)) {
      warnings.push(`${label} dilewati: id "${id}" dobel, entri pertama yang dipakai`);
      return;
    }
    seen.add(id);
    tugas.push({
      id,
      judul,
      mata_kuliah,
      tanggal,
      teks: typeof e.teks === "string" ? e.teks : "",
      gambar: cleanItems(e.gambar, "gambar", `${label} ("${id}")`, warnings),
      lampiran: cleanItems(e.lampiran, "lampiran", `${label} ("${id}")`, warnings),
    });
  });

  tugas.sort((a, b) => (a.tanggal < b.tanggal ? 1 : a.tanggal > b.tanggal ? -1 : 0));

  const pemilik = obj.pemilik && typeof obj.pemilik === "object" ? obj.pemilik : {};
  return {
    ok: true,
    data: {
      pemilik: { nama: text(pemilik.nama), nim: text(pemilik.nim) },
      judul_situs: text(obj.judul_situs) || "Kumpulan Tugas Kuliah",
      tugas,
    },
    warnings,
  };
}

export function courses(list) {
  return [...new Set(list.map((t) => t.mata_kuliah))].sort((a, b) => a.localeCompare(b, "id"));
}

export function filterTugas(list, { matkul, query }) {
  const q = query.trim().toLowerCase();
  return list.filter(
    (t) => (matkul === "" || t.mata_kuliah === matkul) && t.judul.toLowerCase().includes(q),
  );
}

export function findById(list, id) {
  return id === null ? undefined : list.find((t) => t.id === id);
}

export function paragraphs(teks) {
  return teks
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function excerpt(teks, max = 140) {
  const s = paragraphs(teks).join(" ");
  return s.length > max ? s.slice(0, max) + "…" : s;
}

const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export function formatTanggal(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${BULAN[m - 1]} ${y}`;
}

export function formatSize(bytes) {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  const satuan = (n, nama) => `${(n).toFixed(1).replace(".", ",")} ${nama}`;
  if (bytes < 1024 * 1024) return satuan(bytes / 1024, "KB");
  return satuan(bytes / (1024 * 1024), "MB");
}

const JENIS = new Map(
  Object.entries({
    pdf: ["pdf"],
    image: ["png", "jpg", "jpeg", "gif", "webp", "svg"],
    doc: ["doc", "docx"],
    sheet: ["xls", "xlsx", "csv"],
    slide: ["ppt", "pptx"],
    archive: ["zip", "rar", "7z"],
  }).flatMap(([jenis, exts]) => exts.map((e) => [e, jenis])),
);

export function fileUrl(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

export function fileKind(path) {
  const nama = baseName(path);
  const i = nama.lastIndexOf(".");
  return (i < 0 && "other") || JENIS.get(nama.slice(i + 1).toLowerCase()) || "other";
}
