import express from "express";
import path from "path";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increase limit for base64 images

const PORT = 3000;

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// AI Face Verification Endpoint
app.post("/api/verify-selfie", async (req, res) => {
  const { image } = req.body;
  if (!image) {
    return res.status(400).json({ success: false, error: "Image data is required" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    console.warn("GEMINI_API_KEY is not set or using placeholder. Bypassing selfie verification.");
    return res.json({
      success: true,
      is_valid: true,
      confidence: 1.0,
      reason: "Verifikasi wajah berhasil (Mode Sandbox: Lewati verifikasi AI)"
    });
  }

  try {
    let base64Data = image;
    let mimeType = "image/jpeg";

    if (image.includes(";base64,")) {
      const parts = image.split(";base64,");
      mimeType = parts[0].replace("data:", "");
      base64Data = parts[1];
    }

    const ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Data
          }
        },
        "Analisis foto selfie karyawan ini untuk absensi online. Periksa secara detail:\n" +
        "1. Apakah ada wajah manusia yang jelas di dalam foto?\n" +
        "2. Apakah foto ini merupakan foto selfie asli manusia (bukan gambar hitam kosong, bukan gambar kartun, bukan benda mati, bukan foto layar komputer/HP, dan bukan foto wajah terpotong/buram total)?\n\n" +
        "Berikan jawaban dalam format JSON terstruktur dengan properti berikut:\n" +
        "- is_valid: boolean (true jika ada wajah manusia asli yang jelas, false jika tidak valid)\n" +
        "- confidence: angka desimal dari 0.0 sampai 1.0 (tingkat keyakinan Anda)\n" +
        "- reason: string penjelasan singkat dalam Bahasa Indonesia"
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            is_valid: { type: Type.BOOLEAN },
            confidence: { type: Type.NUMBER },
            reason: { type: Type.STRING }
          },
          required: ["is_valid", "confidence", "reason"]
        }
      }
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("No response text from Gemini API");
    }

    const result = JSON.parse(resultText.trim());
    return res.json({
      success: true,
      is_valid: result.is_valid,
      confidence: result.confidence,
      reason: result.reason
    });

  } catch (error: any) {
    console.error("Error during AI selfie verification:", error);
    return res.json({
      success: true,
      is_valid: true,
      confidence: 0.5,
      reason: "Verifikasi wajah dilewati karena kendala layanan AI: " + (error.message || error)
    });
  }
});

// AI Employee Data Extraction Endpoint
app.post("/api/extract-employees", async (req, res) => {
  const { image } = req.body;
  if (!image) {
    return res.status(400).json({ success: false, error: "Image data is required" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    console.warn("GEMINI_API_KEY is not set or using placeholder.");
    return res.status(400).json({
      success: false,
      error: "Kunci API Gemini (GEMINI_API_KEY) tidak dikonfigurasi di server Anda. Silakan tambahkan kunci API di pengaturan AI Studio."
    });
  }

  try {
    let base64Data = image;
    let mimeType = "image/jpeg";

    if (image.includes(";base64,")) {
      const parts = image.split(";base64,");
      mimeType = parts[0].replace("data:", "");
      base64Data = parts[1];
    }

    const ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Data
          }
        },
        "Analisis gambar tabel/dokumen daftar karyawan ini. Ekstrak data semua karyawan yang tertera pada gambar secara akurat.\n" +
        "Ketentuan pengisian properti:\n" +
        "- waNumber: nomor telepon/whatsapp (harus berupa string angka saja, bersihkan dari spasi/strip/tanda plus, contoh: 0812345678). Jika di gambar tidak ada nomor WhatsApp/telepon sama sekali, mohon buatkan nomor dummy berurutan unik mulai dari '0816200001', '0816200002', dst.\n" +
        "- nama: nama lengkap karyawan (gunakan huruf kapital)\n" +
        "- divisi: divisi kerja (jika tidak tertera di gambar, buat default '162')\n" +
        "- jabatan: jabatan kerja (jika tidak tertera di gambar, buat default 'OPERATOR')\n" +
        "- password: kata sandi default untuk akun mereka (isi string '123456')\n" +
        "- role: harus string 'karyawan' atau 'admin' (default: 'karyawan')\n" +
        "- assignedOfficeId: lokasi kantor yang ditentukan (default: 'all')\n\n" +
        "Berikan jawaban dalam format JSON terstruktur yang berisi array karyawan."
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            employees: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  waNumber: { type: Type.STRING },
                  nama: { type: Type.STRING },
                  divisi: { type: Type.STRING },
                  jabatan: { type: Type.STRING },
                  password: { type: Type.STRING },
                  role: { type: Type.STRING },
                  assignedOfficeId: { type: Type.STRING }
                },
                required: ["waNumber", "nama"]
              }
            }
          },
          required: ["employees"]
        }
      }
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("No response text from Gemini API");
    }

    const result = JSON.parse(resultText.trim());
    return res.json({
      success: true,
      employees: result.employees || []
    });

  } catch (error: any) {
    console.error("Error during AI employee extraction:", error);
    return res.status(500).json({
      success: false,
      error: "Gagal mengekstrak data menggunakan AI: " + (error.message || error)
    });
  }
});

// AI Attendance Data Extraction Endpoint
app.post("/api/extract-attendance", async (req, res) => {
  const { image, currentDate } = req.body;
  if (!image) {
    return res.status(400).json({ success: false, error: "Image data is required" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return res.status(400).json({
      success: false,
      error: "Kunci API Gemini tidak dikonfigurasi di server."
    });
  }

  try {
    let base64Data = image;
    let mimeType = "image/jpeg";
    if (image.includes(";base64,")) {
      const parts = image.split(";base64,");
      mimeType = parts[0].replace("data:", "");
      base64Data = parts[1];
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        { inlineData: { mimeType, data: base64Data } },
        `Analisis foto daftar presensi atau logbook kehadiran karyawan berikut. Ekstrak data absensi harian secara akurat.\n` +
        `Gunakan tanggal acuan default ini: ${currentDate || new Date().toISOString().split('T')[0]}.\n` +
        `Ketentuan properti:\n` +
        `- waNumber: nomor WA/telepon karyawan (hanya angka saja, contoh: 0816200001)\n` +
        `- nama: nama karyawan (untuk verifikasi / pencocokan visual)\n` +
        `- tanggal: format 'YYYY-MM-DD' (default: acuan di atas, kecuali tertera tanggal lain di gambar)\n` +
        `- jam_masuk: format 'HH:mm' (contoh: 07:30)\n` +
        `- jam_pulang: format 'HH:mm' jika tertera, jika tidak kosongkan saja\n` +
        `- status: harus 'Hadir' atau 'Terlambat' (gunakan logika: jika jam_masuk lewat dari 08:00 maka 'Terlambat', sebaliknya 'Hadir')\n\n` +
        `Berikan jawaban dalam format JSON terstruktur.`
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            records: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  waNumber: { type: Type.STRING },
                  nama: { type: Type.STRING },
                  tanggal: { type: Type.STRING },
                  jam_masuk: { type: Type.STRING },
                  jam_pulang: { type: Type.STRING },
                  status: { type: Type.STRING }
                },
                required: ["waNumber", "tanggal", "jam_masuk", "status"]
              }
            }
          },
          required: ["records"]
        }
      }
    });

    const result = JSON.parse(response.text?.trim() || "{}");
    return res.json({ success: true, records: result.records || [] });
  } catch (error: any) {
    console.error("Error during AI attendance extraction:", error);
    return res.status(500).json({ success: false, error: error.message || error });
  }
});

// AI Leave / Overtime Approval Request Extraction
app.post("/api/extract-approval", async (req, res) => {
  const { image } = req.body;
  if (!image) {
    return res.status(400).json({ success: false, error: "Image data is required" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return res.status(400).json({
      success: false,
      error: "Kunci API Gemini tidak dikonfigurasi di server."
    });
  }

  try {
    let base64Data = image;
    let mimeType = "image/jpeg";
    if (image.includes(";base64,")) {
      const parts = image.split(";base64,");
      mimeType = parts[0].replace("data:", "");
      base64Data = parts[1];
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        { inlineData: { mimeType, data: base64Data } },
        `Analisis dokumen berikut (bisa berupa Surat Izin Cuti, Surat Keterangan Dokter, Form Pengajuan Lembur, dll).\n` +
        `Ekstrak informasi pengajuan tersebut untuk diinput ke database.\n\n` +
        `Tentukan tipenya terlebih dahulu:\n` +
        `- Jika izin/sakit/cuti, gunakan type 'leave'\n` +
        `- Jika lembur, gunakan type 'overtime'\n\n` +
        `Isi properti berikut:\n` +
        `- type: 'leave' atau 'overtime'\n` +
        `- waNumber: nomor WhatsApp karyawan jika tertera, jika tidak ada, kosongkan\n` +
        `- nama: nama lengkap karyawan (gunakan huruf kapital)\n` +
        `- tipe: jika leave, pilih salah satu dari: 'izin', 'sakit', 'cuti' (default: 'izin')\n` +
        `- tanggal_mulai: format 'YYYY-MM-DD' (untuk leave)\n` +
        `- tanggal_akhir: format 'YYYY-MM-DD' (untuk leave)\n` +
        `- alasan: deskripsi alasan pengajuan izin/sakit/cuti secara ringkas\n` +
        `- tanggal: format 'YYYY-MM-DD' (untuk overtime)\n` +
        `- durasi_jam: angka jumlah jam lembur (untuk overtime, default: 2)\n` +
        `- keterangan: deskripsi aktivitas/keterangan lembur\n\n` +
        `Berikan respons JSON terstruktur.`
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING },
            waNumber: { type: Type.STRING },
            nama: { type: Type.STRING },
            tipe: { type: Type.STRING },
            tanggal_mulai: { type: Type.STRING },
            tanggal_akhir: { type: Type.STRING },
            alasan: { type: Type.STRING },
            tanggal: { type: Type.STRING },
            durasi_jam: { type: Type.NUMBER },
            keterangan: { type: Type.STRING }
          },
          required: ["type", "nama"]
        }
      }
    });

    const result = JSON.parse(response.text?.trim() || "{}");
    return res.json({ success: true, data: result });
  } catch (error: any) {
    console.error("Error during AI approval extraction:", error);
    return res.status(500).json({ success: false, error: error.message || error });
  }
});

// AI Office / Map Location Coordinate Extraction
app.post("/api/extract-office", async (req, res) => {
  const { image } = req.body;
  if (!image) {
    return res.status(400).json({ success: false, error: "Image data is required" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return res.status(400).json({
      success: false,
      error: "Kunci API Gemini tidak dikonfigurasi di server."
    });
  }

  try {
    let base64Data = image;
    let mimeType = "image/jpeg";
    if (image.includes(";base64,")) {
      const parts = image.split(";base64,");
      mimeType = parts[0].replace("data:", "");
      base64Data = parts[1];
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        { inlineData: { mimeType, data: base64Data } },
        `Analisis gambar tangkapan layar (screenshot) Google Maps, koordinat GPS, atau dokumen berisi alamat kantor cabang.\n` +
        `Temukan koordinat geografis (Latitude & Longitude) serta nama lokasi kantor.\n\n` +
        `Ekstrak properti berikut:\n` +
        `- name: Nama lokasi kantor cabang (contoh: Kantor Bandung Barat)\n` +
        `- latitude: angka desimal koordinat lintang (contoh: -6.917464)\n` +
        `- longitude: angka desimal koordinat bujur (contoh: 107.619122)\n` +
        `- radius: angka integer batas radius presensi dalam meter (default: 100)\n\n` +
        `Berikan respons JSON terstruktur.`
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            latitude: { type: Type.NUMBER },
            longitude: { type: Type.NUMBER },
            radius: { type: Type.NUMBER }
          },
          required: ["name", "latitude", "longitude", "radius"]
        }
      }
    });

    const result = JSON.parse(response.text?.trim() || "{}");
    return res.json({ success: true, data: result });
  } catch (error: any) {
    console.error("Error during AI office extraction:", error);
    return res.status(500).json({ success: false, error: error.message || error });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
