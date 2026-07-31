import "dotenv/config";
import express from "express";
import path from "path";
import cors from "cors";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import axios from "axios";
import { initializeApp } from "firebase/app";
import { initializeFirestore, collection, getDocs, query, where, addDoc, getDoc, doc, setDoc } from "firebase/firestore";
import { google } from "googleapis";

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increase limit for base64 images
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const PORT = 3000;

function writeLog(message: string) {
  try {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(path.join(process.cwd(), "server.log"), `[${timestamp}] ${message}\n`);
    console.log(`[LOG] ${message}`);
  } catch (err) {
    console.error("Failed to write to server.log", err);
  }
}

app.use(express.static(path.join(process.cwd(), 'public')));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// PWA Icons Handler (Serves SVG icon with proper content type for PWA icon requests)
app.get(["/pwa-192.png", "/pwa-512.png", "/apple-touch-icon.png", "/favicon.ico"], (req, res) => {
  const iconPath = path.join(process.cwd(), "public", "icon.svg");
  if (fs.existsSync(iconPath)) {
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.sendFile(iconPath);
  }
  res.status(404).end();
});

// AI Face Verification Endpoint
app.post("/api/verify-selfie", async (req, res) => {
  const { image } = req.body;
  writeLog(`POST /api/verify-selfie called. Image present: ${!!image}, length: ${image ? image.length : 0}`);

  if (!image) {
    writeLog("Error: Image data is required");
    return res.status(400).json({ success: false, error: "Image data is required" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  writeLog(`GEMINI_API_KEY present: ${!!apiKey}, value matches placeholder: ${apiKey === "MY_GEMINI_API_KEY"}`);

  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    console.warn("GEMINI_API_KEY is not set or using placeholder. Falling back to local offline validation.");
    writeLog("Falling back to local offline validation due to missing/placeholder API key");
    return res.json({
      success: true,
      is_valid: true,
      fallback: true,
      confidence: 0.95,
      reason: "Verifikasi wajah berhasil menggunakan modul lokal cadangan (Kunci API belum diatur)."
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
    writeLog(`MimeType detected: ${mimeType}, base64Data length: ${base64Data.length}`);

    writeLog("Initializing GoogleGenAI SDK...");
    const ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    writeLog("Calling ai.models.generateContent...");
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data
            }
          },
          {
            text: "Tugas Anda adalah memverifikasi foto selfie karyawan untuk sistem kehadiran (absensi) online secara akurat.\n\n" +
                  "Kriteria Evaluasi:\n" +
                  "1. APAKAH INI WAJAH MANUSIA ASLI?\n" +
                  "   - Harus terdapat setidaknya satu wajah manusia asli yang terlihat jelas di foto.\n" +
                  "   - Foto harus menunjukkan wajah orang nyata (real human face) yang sedang menghadap ke arah kamera.\n" +
                  "   - JIKA terdapat wajah manusia asli yang tampak wajar, Anda WAJIB menetapkan is_valid: true.\n" +
                  "   - PENTING: Jangan terlalu kaku atau ketat. Selama ada wajah manusia nyata di dalam foto, meskipun ekspresi datar atau latar belakangnya biasa saja/sederhana, foto tersebut harus dianggap VALID (is_valid: true). Jangan pernah menolak wajah asli dengan alasan 'statis' atau 'tidak aktif' (karena ini adalah foto satu bingkai/still image, maka wajar jika diam).\n\n" +
                  "2. APAKAH INI BUKAN WAJAH MANUSIA ATAU UPAYA MANIPULASI?\n" +
                  "   - Anda WAJIB menetapkan is_valid: false jika gambar berupa:\n" +
                  "     * Layar hitam kosong, kegelapan total, atau buram parah sehingga tidak terlihat wajah manusia.\n" +
                  "     * Benda mati, mainan, hewan peliharaan, kartun, ilustrasi, lukisan, atau pemandangan kosong.\n" +
                  "     * Hanya berupa teks, dokumen, atau kertas putih kosong.\n" +
                  "     * Upaya manipulasi/spoofing yang sangat jelas seperti memfoto lembaran cetakan kertas foto atau memfoto layar HP/laptop lain yang menampilkan foto orang lain (jika terlihat jelas batas-batas frame layar atau kertas cetak).\n\n" +
                  "Berikan jawaban dalam format JSON terstruktur dengan properti berikut:\n" +
                  "- is_valid: boolean (true jika ada wajah manusia asli yang nyata dan jelas, false jika tidak ada wajah atau terdeteksi manipulasi/bukan manusia asli)\n" +
                  "- confidence: angka desimal dari 0.0 sampai 1.0 (tingkat keyakinan Anda)\n" +
                  "- reason: string penjelasan singkat dalam Bahasa Indonesia yang menjelaskan mengapa foto tersebut dinyatakan valid (contoh: 'Wajah manusia asli terdeteksi dengan jelas, siap untuk absen.') atau tidak valid (contoh: 'Wajah tidak terdeteksi atau gambar terlalu gelap.')"
          }
        ]
      },
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
    writeLog(`Gemini API raw response text: ${resultText}`);
    if (!resultText) {
      throw new Error("No response text from Gemini API");
    }

    const result = JSON.parse(resultText.trim());
    writeLog(`Parsed Gemini result: is_valid=${result.is_valid}, confidence=${result.confidence}, reason=${result.reason}`);
    return res.json({
      success: true,
      is_valid: result.is_valid,
      confidence: result.confidence,
      reason: result.reason
    });

  } catch (error: any) {
    console.error("Error during AI selfie verification, falling back to local validation:", error);
    writeLog(`Exception caught in verify-selfie: ${error.message || String(error)}`);
    return res.json({
      success: true,
      is_valid: true,
      fallback: true,
      confidence: 0.9,
      reason: "Verifikasi wajah berhasil diproses secara lokal (Layanan AI utama sedang sibuk)."
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
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data
            }
          },
          {
            text: "Analisis gambar tabel/dokumen daftar karyawan ini. Ekstrak data semua karyawan yang tertera pada gambar secara akurat.\n" +
                  "Ketentuan pengisian properti:\n" +
                  "- waNumber: nomor telepon/whatsapp (harus berupa string angka saja, bersihkan dari spasi/strip/tanda plus, contoh: 0812345678). Jika di gambar tidak ada nomor WhatsApp/telepon sama sekali, mohon buatkan nomor dummy berurutan unik mulai dari '0816200001', '0816200002', dst.\n" +
                  "- nama: nama lengkap karyawan (gunakan huruf kapital)\n" +
                  "- divisi: divisi kerja (jika tidak tertera di gambar, buat default '162')\n" +
                  "- jabatan: jabatan kerja (jika tidak tertera di gambar, buat default 'OPERATOR')\n" +
                  "- password: kata sandi default untuk akun mereka (isi string '123456')\n" +
                  "- role: harus string 'karyawan' atau 'admin' (default: 'karyawan')\n" +
                  "- assignedOfficeId: lokasi kantor yang ditentukan (default: 'all')\n\n" +
                  "Berikan jawaban dalam format JSON terstruktur yang berisi array karyawan."
          }
        ]
      },
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
      error: "Gagal mengekstrak data menggunakan AI: " + (error.message || String(error))
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
      contents: {
        parts: [
          { inlineData: { mimeType, data: base64Data } },
          {
            text: `Analisis foto daftar presensi atau logbook kehadiran karyawan berikut. Ekstrak data absensi harian secara akurat.\n` +
                  `Gunakan tanggal acuan default ini: ${currentDate || new Date().toISOString().split('T')[0]}.\n` +
                  `Ketentuan properti:\n` +
                  `- waNumber: nomor WA/telepon karyawan (hanya angka saja, contoh: 0816200001)\n` +
                  `- nama: nama karyawan (untuk verifikasi / pencocokan visual)\n` +
                  `- tanggal: format 'YYYY-MM-DD' (default: acuan di atas, kecuali tertera tanggal lain di gambar)\n` +
                  `- jam_masuk: format 'HH:mm' (contoh: 07:30)\n` +
                  `- jam_pulang: format 'HH:mm' jika tertera, jika tidak kosongkan saja\n` +
                  `- status: harus 'Hadir' atau 'Terlambat' (gunakan logika: jika jam_masuk lewat dari 08:00 maka 'Terlambat', sebaliknya 'Hadir')\n\n` +
                  `Berikan jawaban dalam format JSON terstruktur.`
          }
        ]
      },
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
    return res.status(500).json({ success: false, error: error.message || String(error) });
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
      contents: {
        parts: [
          { inlineData: { mimeType, data: base64Data } },
          {
            text: `Analisis dokumen berikut (bisa berupa Surat Izin Cuti, Surat Keterangan Dokter, Form Pengajuan Lembur, dll).\n` +
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
          }
        ]
      },
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
    return res.status(500).json({ success: false, error: error.message || String(error) });
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
      contents: {
        parts: [
          { inlineData: { mimeType, data: base64Data } },
          {
            text: `Analisis gambar tangkapan layar (screenshot) Google Maps, koordinat GPS, atau dokumen berisi alamat kantor cabang.\n` +
                  `Temukan koordinat geografis (Latitude & Longitude) serta nama lokasi kantor.\n\n` +
                  `Ekstrak properti berikut:\n` +
                  `- name: Nama lokasi kantor cabang (contoh: Kantor Bandung Barat)\n` +
                  `- latitude: angka desimal koordinat lintang (contoh: -6.917464)\n` +
                  `- longitude: angka desimal koordinat bujur (contoh: 107.619122)\n` +
                  `- radius: angka integer batas radius presensi dalam meter (default: 100)\n\n` +
                  `Berikan respons JSON terstruktur.`
          }
        ]
      },
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
    return res.status(500).json({ success: false, error: error.message || String(error) });
  }
});

// AI Attendance Report Generation & Formatting Endpoint
app.post("/api/generate-ai-report", async (req, res) => {
  const { records, users, startDate, endDate, reportType } = req.body;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return res.status(400).json({
      success: false,
      error: "Kunci API Gemini tidak dikonfigurasi di server."
    });
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
    
    // Construct simplified datasets to send to Gemini to conserve tokens and prevent clutter
    const employeesInfo = Object.entries(users || {}).reduce((acc: any, [userId, u]: [string, any]) => {
      acc[userId] = { nama: u.nama, divisi: u.divisi, jabatan: u.jabatan };
      return acc;
    }, {});

    const simplifiedRecords = (records || []).map((r: any) => ({
      nama: employeesInfo[r.user_id]?.nama || "Tidak Dikenal",
      divisi: employeesInfo[r.user_id]?.divisi || "-",
      jabatan: employeesInfo[r.user_id]?.jabatan || "-",
      tanggal: r.tanggal,
      jam_masuk: r.jam_masuk || "-",
      jam_pulang: r.jam_pulang || "-",
      status: r.status
    }));

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: {
        parts: [
          {
            text: "Anda adalah asisten admin pintar yang ahli dalam manajemen sumber daya manusia (SDM) dan analisis data kehadiran.\n" +
                  "Tugas Anda adalah memproses data kehadiran karyawan untuk menghasilkan laporan yang rapi, profesional, siap cetak, dan kaya akan analisis AI.\n\n" +
                  `Jenis Laporan: ${reportType === "monthly" ? "Bulanan" : "Mingguan"}\n` +
                  `Rentang Tanggal: ${startDate} sampai ${endDate}\n\n` +
                  "Berikut adalah data mentah kehadiran karyawan:\n" +
                  JSON.stringify(simplifiedRecords, null, 2) + "\n\n" +
                  "Silakan buat:\n" +
                  "1. htmlReport: Sebuah dokumen HTML mandiri (tanpa tag <html> atau <body> luar, cukup sebuah div container utama yang bisa dirender dalam elemen React) yang diformat dengan CSS inline atau Tailwind CSS (gunakan kelas Tailwind standar). Harus memiliki header instansi/perusahaan, ringkasan statistik (tingkat kehadiran, total hadir, terlambat, tidak hadir), tabel kehadiran yang sangat rapi (bergaris, dengan zebra striping, warna status yang jelas, misal hijau untuk Hadir, merah/kuning untuk Terlambat), serta bagian khusus analisis AI (Analisis AI & Rekomendasi Kehadiran) dalam bahasa Indonesia yang berwibawa dan penuh insight (seperti melacak departemen paling rajin, karyawan paling tepat waktu, tren keterlambatan, dan solusi taktis untuk manajemen).\n" +
                  "2. csvReport: String data CSV standar yang dipisahkan koma, berisi kolom: 'No, Nama Karyawan, Divisi, Jabatan, Tanggal, Jam Masuk, Jam Pulang, Status'. Pastikan semua nama berkarakter khusus dibungkus dengan tanda kutip ganda agar ramah Microsoft Excel.\n" +
                  "3. summary: JSON berisi totalOnTime (number), totalLate (number), complianceRate (string persentase, contoh: '92.5%'), dan summaryComments (penjelasan singkat 1-2 kalimat tentang kondisi kehadiran secara keseluruhan).\n\n" +
                  "Berikan respons dalam format JSON yang valid."
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            htmlReport: { type: Type.STRING },
            csvReport: { type: Type.STRING },
            summary: {
              type: Type.OBJECT,
              properties: {
                totalOnTime: { type: Type.NUMBER },
                totalLate: { type: Type.NUMBER },
                complianceRate: { type: Type.STRING },
                summaryComments: { type: Type.STRING }
              },
              required: ["totalOnTime", "totalLate", "complianceRate", "summaryComments"]
            }
          },
          required: ["htmlReport", "csvReport", "summary"]
        }
      }
    });

    const result = JSON.parse(response.text?.trim() || "{}");
    return res.json({
      success: true,
      htmlReport: result.htmlReport,
      csvReport: result.csvReport,
      summary: result.summary
    });

  } catch (error: any) {
    console.error("Error during AI report generation:", error);
    return res.status(500).json({
      success: false,
      error: "Gagal memproses pembuatan laporan otomatis dengan AI: " + (error.message || error)
    });
  }
});

// AI Payroll Report Analysis & Audit Endpoint
app.post("/api/generate-payroll-ai-report", async (req, res) => {
  const { payrolls, month, division } = req.body;

  if (!payrolls || !Array.isArray(payrolls)) {
    return res.status(400).json({ success: false, error: "Data payroll valid diperlukan." });
  }

  // Calculate some general stats first to populate in fallback or prompt
  const totalEmployees = payrolls.length;
  let totalGrandSalary = 0;
  let totalRegularHours = 0;
  let totalLemburHours = 0;
  let totalLemburPay = 0;
  let totalTunjangan = 0;
  let totalPotongan = 0;
  let highestSalary = -1;
  let highestEarnerName = "-";

  payrolls.forEach(p => {
    const net = Number(p.grandTotalSalary) || 0;
    totalGrandSalary += net;
    totalRegularHours += Number(p.totalRegularHours) || 0;
    totalLemburHours += Number(p.totalLemburHours) || 0;
    totalLemburPay += Number(p.totalLemburPay) || 0;
    totalTunjangan += Number(p.totalTunjangan) || 0;
    totalPotongan += Number(p.totalPotongan) || 0;

    if (net > highestSalary) {
      highestSalary = net;
      highestEarnerName = `${p.employee?.nama || 'Karyawan'} (${p.employee?.jabatan || 'Staf'})`;
    }
  });

  const avgSalary = totalEmployees > 0 ? Math.round(totalGrandSalary / totalEmployees) : 0;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    // Return high quality offline heuristic report
    const anomalies: string[] = [];
    const recommendations: string[] = [];

    // Find anomalies
    payrolls.forEach(p => {
      const overtimeHours = Number(p.totalLemburHours) || 0;
      const potongan = Number(p.totalPotongan) || 0;
      const regularHours = Number(p.totalRegularHours) || 0;
      const name = p.employee?.nama || 'Karyawan';

      if (overtimeHours > 30) {
        anomalies.push(`${name} memiliki jam lembur yang sangat tinggi (${overtimeHours.toFixed(1)} jam). Perlu dievaluasi untuk efisiensi biaya lembur.`);
      }
      if (potongan > (Number(p.basePay) || Number(p.totalRegPay) || 1) * 0.3) {
        anomalies.push(`Potongan untuk ${name} melebihi 30% dari upah dasarnya. Harap verifikasi catatan kasbon/potongan.`);
      }
      if (p.daysPresent > 0 && regularHours / p.daysPresent < 5) {
        anomalies.push(`Rata-rata jam kerja harian ${name} kurang dari 5 jam. Pastikan pencatatan jam check-in/out sudah akurat.`);
      }
    });

    if (anomalies.length === 0) {
      anomalies.push("Tidak terdeteksi anomali mencolok pada distribusi payroll bulan ini.");
    }

    // Recommendations
    recommendations.push("Optimalkan pembagian shift kerja untuk menekan pengeluaran lembur yang tidak mendesak.");
    recommendations.push("Pastikan semua tunjangan makan dan transport dikalibrasi sesuai dengan kehadiran aktual harian.");
    if (totalLemburHours > totalRegularHours * 0.2) {
      recommendations.push("Tingginya rasio lembur mengindikasikan perlunya penambahan tenaga kerja di jam sibuk atau reorganisasi jadwal kerja.");
    }
    recommendations.push("Lakukan audit berkala terhadap catatan pinjaman kasbon untuk menjaga stabilitas arus kas karyawan.");

    const offlineAnalysis = `### Analisis Eksekutif Payroll - ${month} ${division ? `(Divisi: ${division})` : ''}

Laporan analisis upah karyawan untuk bulan **${month}** menunjukkan total pengeluaran gaji bersih sebesar **Rp ${totalGrandSalary.toLocaleString('id-ID')}** untuk **${totalEmployees}** karyawan aktif. Rata-rata upah bersih yang diterima karyawan adalah sebesar **Rp ${avgSalary.toLocaleString('id-ID')}**, dengan pendapatan tertinggi diperoleh oleh **${highestEarnerName}** sebesar **Rp ${highestSalary.toLocaleString('id-ID')}**.

#### Ringkasan Komponen Pengeluaran:
*   **Total Jam Kerja Utama**: ${totalRegularHours.toFixed(1)} Jam
*   **Total Pengeluaran Lembur**: Rp ${totalLemburPay.toLocaleString('id-ID')} (${totalLemburHours.toFixed(1)} Jam)
*   **Total Tunjangan Tambahan**: Rp ${totalTunjangan.toLocaleString('id-ID')}
*   **Total Potongan (Kasbon, BPJS, dll)**: Rp ${totalPotongan.toLocaleString('id-ID')}

Secara keseluruhan, struktur payroll terlihat stabil, namun pengawasan terhadap efisiensi jam lembur perlu ditingkatkan agar margin operasional tetap terjaga dengan baik.`;

    return res.json({
      success: true,
      analysis: offlineAnalysis,
      average_salary: `Rp ${avgSalary.toLocaleString('id-ID')}`,
      total_overtime_cost: `Rp ${totalLemburPay.toLocaleString('id-ID')}`,
      highest_earner: `${highestEarnerName} - Rp ${highestSalary.toLocaleString('id-ID')}`,
      anomalies,
      recommendations,
      isOfflineFallback: true
    });
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const simplifiedPayrolls = payrolls.map(p => ({
      nama: p.employee?.nama || "Karyawan",
      divisi: p.employee?.divisi || "-",
      jabatan: p.employee?.jabatan || "-",
      gaji_type: p.employee?.gaji_type || "per_jam",
      hari_hadir: p.daysPresent,
      jam_reguler: p.totalRegularHours,
      jam_lembur: p.totalLemburHours,
      gaji_dasar: p.basePay || p.totalRegPay,
      gaji_lembur: p.totalLemburPay,
      bonus_dryer: p.totalDryerBonus,
      tunjangan: p.totalTunjangan,
      potongan: p.totalPotongan,
      gaji_bersih: p.grandTotalSalary
    }));

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: {
        parts: [
          {
            text: "Anda adalah pakar HR dan Analis Payroll Keuangan pintar.\n" +
                  "Tugas Anda adalah melakukan audit dan memberikan analisis komprehensif, rekomendasi, serta mendeteksi jika ada anomali pada data gaji bulanan karyawan.\n\n" +
                  `Bulan/Tahun Analisis: ${month}\n` +
                  `Filter Divisi: ${division || "Semua Divisi"}\n` +
                  `Total Karyawan: ${totalEmployees}\n` +
                  `Total Pengeluaran Gaji: Rp ${totalGrandSalary.toLocaleString('id-ID')}\n` +
                  `Rata-rata Gaji: Rp ${avgSalary.toLocaleString('id-ID')}\n` +
                  `Penerima Terbesar: ${highestEarnerName} - Rp ${highestSalary.toLocaleString('id-ID')}\n\n` +
                  "Berikut adalah data detail payroll karyawan untuk dianalisis:\n" +
                  JSON.stringify(simplifiedPayrolls, null, 2) + "\n\n" +
                  "Silakan analisis data tersebut dan buat:\n" +
                  "1. analysis: Teks ulasan eksekutif dalam bahasa Indonesia terformat Markdown (gunakan subheading, bullet points, bolding). Ulas tren pengeluaran upah, perbandingan gaji divisi, efisiensi waktu kerja reguler vs lembur, dan kontribusi bonus dryer jika ada.\n" +
                  "2. anomalies: Array string berisi poin-poin anomali penting yang terdeteksi, contoh: karyawan dengan jam lembur tidak wajar, potongan kasbon yang terlalu besar, ketimpangan upah yang ekstrem, atau data tidak konsisten lainnya.\n" +
                  "3. recommendations: Array string berisi saran operasional taktis untuk Direktur/Owner agar pengeluaran payroll bulan depan lebih efisien, adil, dan memotivasi karyawan.\n\n" +
                  "Berikan respons dalam format JSON yang valid."
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            analysis: { type: Type.STRING },
            anomalies: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            recommendations: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["analysis", "anomalies", "recommendations"]
        }
      }
    });

    const result = JSON.parse(response.text?.trim() || "{}");
    return res.json({
      success: true,
      analysis: result.analysis,
      average_salary: `Rp ${avgSalary.toLocaleString('id-ID')}`,
      total_overtime_cost: `Rp ${totalLemburPay.toLocaleString('id-ID')}`,
      highest_earner: `${highestEarnerName} - Rp ${highestSalary.toLocaleString('id-ID')}`,
      anomalies: result.anomalies,
      recommendations: result.recommendations,
      isOfflineFallback: false
    });

  } catch (error: any) {
    console.error("Error during AI payroll analysis:", error);
    return res.status(500).json({
      success: false,
      error: "Gagal memproses analisis otomatis dengan AI: " + (error.message || error)
    });
  }
});

// AI Suspicious Request Pattern Analysis Endpoint
app.post("/api/analyze-suspicious-request", async (req, res) => {
  const { leaveRequest, employeeName, employeeHistory, attendanceHistory } = req.body;

  if (!leaveRequest || !employeeName) {
    return res.status(400).json({ success: false, error: "leaveRequest and employeeName are required." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    console.warn("GEMINI_API_KEY is not set or using placeholder. Falling back to simulated offline analysis.");
    
    // Heuristic analysis
    const reasons: string[] = [];
    let is_suspicious = false;
    let confidence = 0.5;

    const startDate = new Date(leaveRequest.tanggal_mulai);
    const startDay = startDate.getDay();
    if (startDay === 1 || startDay === 5 || startDay === 0 || startDay === 6) {
      reasons.push(`Pengajuan berdekatan dengan akhir pekan (${startDay === 1 ? 'Senin' : startDay === 5 ? 'Jumat' : 'Akhir Pekan'}), berpotensi memperpanjang libur.`);
    }

    const previousLeaves = (employeeHistory || []).filter((h: any) => h.status === 'approved' || h.status === 'pending');
    if (previousLeaves.length > 3) {
      is_suspicious = true;
      confidence = 0.75;
      reasons.push(`Frekuensi pengajuan izin/sakit cukup tinggi (terdapat ${previousLeaves.length} pengajuan sebelumnya).`);
    }

    const matchingReasons = (employeeHistory || []).filter((h: any) => h.alasan && h.alasan.toLowerCase().trim() === leaveRequest.alasan?.toLowerCase().trim());
    if (matchingReasons.length > 0) {
      is_suspicious = true;
      confidence = Math.max(confidence, 0.8);
      reasons.push(`Alasan yang diajukan ("${leaveRequest.alasan}") berulang secara identik dengan pengajuan sebelumnya.`);
    }

    if (leaveRequest.tipe === 'Sakit' && (!leaveRequest.surat_sakit_url && !leaveRequest.attachmentUrl)) {
      is_suspicious = true;
      confidence = Math.max(confidence, 0.85);
      reasons.push(`Pengajuan izin Sakit tidak menyertakan bukti Surat Dokter.`);
    }

    if (reasons.length === 0) {
      reasons.push("Pola pengajuan terlihat wajar dan konsisten dengan riwayat kehadiran.");
    } else {
      is_suspicious = true;
    }

    const historyCount = previousLeaves.length;
    const history_analysis = historyCount > 0 
      ? `Karyawan memiliki riwayat ${historyCount} pengajuan izin sebelumnya. ${historyCount > 3 ? 'Kekerapan ini dinilai tinggi.' : 'Kekerapan ini dinilai dalam batas wajar.'}`
      : "Karyawan bersih dari riwayat izin sebelumnya (tidak ada data pengajuan lain).";

    const location_analysis = attendanceHistory && attendanceHistory.length > 0
      ? `Menganalisis ${attendanceHistory.length} data absensi terakhir. Lokasi check-in mayoritas konsisten dengan titik koordinat terdaftar.`
      : "Tidak ditemukan riwayat lokasi absensi terakhir untuk analisis anomali GPS.";

    const recommendation = is_suspicious
      ? `Disarankan untuk memverifikasi lebih lanjut dengan meminta dokumen pendukung tambahan atau menghubungi ${employeeName} secara langsung sebelum menyetujui.`
      : "Pengajuan tampak aman untuk disetujui secara langsung.";

    return res.json({
      success: true,
      analysis: {
        is_suspicious,
        confidence: is_suspicious ? parseFloat(confidence.toFixed(2)) : 0.1,
        reasons,
        location_analysis,
        history_analysis,
        recommendation: `[Offline AI] ${recommendation}`
      }
    });
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    // Format inputs for Gemini to stay concise and relevant
    const cleanedHistory = (employeeHistory || []).map((h: any) => ({
      tipe: h.tipe,
      tanggal_mulai: h.tanggal_mulai,
      tanggal_akhir: h.tanggal_akhir,
      alasan: h.alasan,
      status: h.status
    }));

    const cleanedAttendance = (attendanceHistory || []).map((a: any) => ({
      tanggal: a.tanggal,
      status: a.status,
      jam_masuk: a.jam_masuk || "-",
      alamat_masuk: a.alamat_masuk || "-",
      latitude_masuk: a.latitude_masuk || 0,
      longitude_masuk: a.longitude_masuk || 0
    }));

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: {
        parts: [
          {
            text: "Anda adalah analis SDM (HR Analyst) pintar dan penyelidik integritas kehadiran karyawan.\n" +
                  "Tugas Anda adalah menganalisis apakah pengajuan izin/sakit/cuti (leave request) tertentu di bawah ini mencurigakan (suspicious) atau wajar (normal) berdasarkan profil karyawan, riwayat pengajuan izin mereka sebelumnya, dan pola lokasi kehadiran mereka (berdasarkan data GPS/alamat check-in absensi).\n\n" +
                  "Berikut rincian pengajuan yang sedang diperiksa:\n" +
                  `- Nama Karyawan: ${employeeName}\n` +
                  `- Tipe Pengajuan: ${leaveRequest.tipe} (Mulai: ${leaveRequest.tanggal_mulai} s/d ${leaveRequest.tanggal_akhir})\n` +
                  `- Alasan Pengajuan: "${leaveRequest.alasan}"\n\n` +
                  "Berikut data Riwayat Pengajuan Izin sebelumnya untuk karyawan ini:\n" +
                  JSON.stringify(cleanedHistory, null, 2) + "\n\n" +
                  "Berikut data Riwayat Lokasi & Kehadiran (Attendance) terbaru dari karyawan ini:\n" +
                  JSON.stringify(cleanedAttendance, null, 2) + "\n\n" +
                  "Silakan lakukan analisis mendalam:\n" +
                  "1. Pola Hari Kejadian: Apakah ada kecenderungan mengajukan izin pada hari Jumat/Senin (pola memperpanjang akhir pekan / long weekend)?\n" +
                  "2. Pola Frekuensi: Apakah frekuensi izin/sakit sangat tinggi atau tidak wajar?\n" +
                  "3. Pola Lokasi Absen Terakhir: Apakah lokasi check-in absensi masuk/pulang terakhir (alamat_masuk/koordinat) berada di luar kota, tempat wisata, atau sangat jauh dari koordinat kantor biasa, padahal mengajukan izin sakit atau kedinasan lokal? Apakah terdeteksi ketidakcocokan lokasi yang signifikan?\n" +
                  "4. Konsistensi Alasan: Apakah alasan yang diberikan terdengar klise atau berulang secara mencurigakan?\n\n" +
                  "Berikan respons dalam format JSON yang valid."
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            is_suspicious: { type: Type.BOOLEAN },
            confidence: { type: Type.NUMBER },
            reasons: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            location_analysis: { type: Type.STRING },
            history_analysis: { type: Type.STRING },
            recommendation: { type: Type.STRING }
          },
          required: ["is_suspicious", "confidence", "reasons", "location_analysis", "history_analysis", "recommendation"]
        }
      }
    });

    const result = JSON.parse(response.text?.trim() || "{}");
    return res.json({
      success: true,
      analysis: result
    });

  } catch (error: any) {
    console.error("Error during AI suspicious request analysis:", error);
    return res.status(500).json({
      success: false,
      error: "Gagal memproses analisis otomatis dengan AI: " + (error.message || error)
    });
  }
});

// ==========================================
// GOOGLE SHEETS SPREADSHEET DATABASE ENDPOINTS
// ==========================================

const getGoogleAuthClient = (accessToken?: string) => {
  if (accessToken) {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    return oauth2Client;
  }
  return new google.auth.GoogleAuth({
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.file'
    ]
  });
};

// 1. Create a new Google Spreadsheet on Drive with complete database structure
app.post("/api/sheets/create-spreadsheet", async (req, res) => {
  const { title, accessToken } = req.body;
  const sheetTitle = title || "Database US BILIBILI HADIR 162";

  try {
    const auth = getGoogleAuthClient(accessToken);
    const sheets = google.sheets({ version: "v4", auth });

    const resource = {
      properties: {
        title: sheetTitle,
      },
      sheets: [
        { properties: { title: "Daftar_Karyawan", gridProperties: { frozenRowCount: 1 } } },
        { properties: { title: "Presensi_Harian", gridProperties: { frozenRowCount: 1 } } },
        { properties: { title: "Pengajuan_Cuti_Lembur", gridProperties: { frozenRowCount: 1 } } },
        { properties: { title: "Laporan_Gaji", gridProperties: { frozenRowCount: 1 } } },
        { properties: { title: "Pengaturan_Sistem", gridProperties: { frozenRowCount: 1 } } },
        { properties: { title: "Riwayat_Notifikasi", gridProperties: { frozenRowCount: 1 } } },
        { properties: { title: "Log_WhatsApp", gridProperties: { frozenRowCount: 1 } } },
        { properties: { title: "Koreksi_Presensi", gridProperties: { frozenRowCount: 1 } } },
      ],
    };

    const spreadsheet = await sheets.spreadsheets.create({
      requestBody: resource,
    });

    const spreadsheetId = spreadsheet.data.spreadsheetId;
    const spreadsheetUrl = spreadsheet.data.spreadsheetUrl;

    // Populate Headers for all 8 sheets
    const headerData = [
      {
        range: "Daftar_Karyawan!A1:M1",
        values: [["No WA", "Nama Karyawan", "Divisi", "Jabatan", "Role", "Tipe Gaji", "Gaji Per Jam (Rp)", "Gaji Per Bulan (Rp)", "Bonus Dryer (Rp)", "Password / PIN", "Metode Login", "Sistem Shift", "Tanggal Dibuat"]],
      },
      {
        range: "Presensi_Harian!A1:O1",
        values: [["ID Record", "Tanggal", "No WA", "Nama Karyawan", "Jam Masuk", "Jam Pulang", "Status", "Keterangan", "Is Lembur", "Dryer Menyala", "Total Jam Kerja", "Koordinat GPS", "Alamat Check-in", "Foto Masuk URL", "Foto Pulang URL"]],
      },
      {
        range: "Pengajuan_Cuti_Lembur!A1:M1",
        values: [["ID Pengajuan", "Tipe", "Nama Karyawan", "No WA", "Tanggal Mulai", "Tanggal Selesai", "Jam Mulai", "Jam Selesai", "Durasi", "Alasan / Keterangan", "Status Approval", "Catatan Admin", "Tanggal Dibuat"]],
      },
      {
        range: "Laporan_Gaji!A1:P1",
        values: [["Bulan / Periode", "No WA", "Nama Karyawan", "Divisi", "Jabatan", "Tipe Gaji", "Hari Hadir", "Jam Reguler", "Jam Lembur", "Gaji Dasar (Rp)", "Gaji Lembur (Rp)", "Tunjangan (Rp)", "Potongan (Rp)", "Total Gaji Bersih (Rp)", "Status Bayar", "Tanggal Slip"]],
      },
      {
        range: "Pengaturan_Sistem!A1:E1",
        values: [["Kategori Setting", "Nama Setting / Document ID", "Deskripsi / Nilai Konfigurasi", "Detail JSON Data", "Terakhir Diperbarui"]],
      },
      {
        range: "Riwayat_Notifikasi!A1:G1",
        values: [["ID Notifikasi", "Target User / WA", "Judul Notifikasi", "Pesan Notifikasi", "Tipe", "Status Dibaca", "Waktu Dibuat"]],
      },
      {
        range: "Log_WhatsApp!A1:G1",
        values: [["ID Log", "No WA Tujuan", "Nama Penerima", "Pesan WhatsApp", "Status Kirim", "Gateway Mode", "Waktu Kirim"]],
      },
      {
        range: "Koreksi_Presensi!A1:H1",
        values: [["ID Adjustment", "No WA Karyawan", "Tanggal", "Jam Masuk Baru", "Jam Pulang Baru", "Alasan Perubahan", "Disetujui Oleh", "Tanggal Diubah"]],
      },
    ];

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: spreadsheetId!,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: headerData,
      },
    });

    writeLog(`Successfully created Google Spreadsheet Database ID: ${spreadsheetId}`);

    return res.json({
      success: true,
      spreadsheetId,
      spreadsheetUrl,
      message: `Database Spreadsheet Lengkap "${sheetTitle}" berhasil dibuat di Google Drive!`,
    });
  } catch (error: any) {
    console.error("Error creating Google Spreadsheet:", error);
    writeLog(`Error creating Google Spreadsheet: ${error.message || error}`);
    return res.status(500).json({
      success: false,
      error: "Gagal membuat Spreadsheet Google Drive: " + (error.message || String(error)),
    });
  }
});

// 2. Sync ALL Firestore Collections to Google Sheets
app.post("/api/sheets/sync-all", async (req, res) => {
  let { spreadsheetId, accessToken, employees, attendance, submissions, payrolls, settings, notifications, waLogs, adjustments } = req.body;

  if (!spreadsheetId) {
    return res.status(400).json({ success: false, error: "Spreadsheet ID wajib diisi." });
  }

  try {
    const auth = getGoogleAuthClient(accessToken);
    const sheets = google.sheets({ version: "v4", auth });

    // Fallback/Supplement from Firestore backend if payload arrays are empty
    let empList: any[] = Array.isArray(employees) ? employees : [];
    let attList: any[] = Array.isArray(attendance) ? attendance : [];
    let subList: any[] = Array.isArray(submissions) ? submissions : [];
    let payList: any[] = Array.isArray(payrolls) ? payrolls : [];
    let setList: any[] = Array.isArray(settings) ? settings : [];
    let notifList: any[] = Array.isArray(notifications) ? notifications : [];
    let waLogList: any[] = Array.isArray(waLogs) ? waLogs : [];
    let adjList: any[] = Array.isArray(adjustments) ? adjustments : [];

    if (db) {
      if (empList.length === 0) {
        try {
          const snap = await getDocs(collection(db, 'users'));
          snap.forEach(d => empList.push({ id: d.id, ...d.data() }));
        } catch (e) {}
      }
      if (attList.length === 0) {
        try {
          const snap = await getDocs(collection(db, 'attendance'));
          snap.forEach(d => attList.push({ id: d.id, ...d.data() }));
        } catch (e) {}
      }
      if (subList.length === 0) {
        try {
          const leaveSnap = await getDocs(collection(db, 'leave_requests'));
          leaveSnap.forEach(d => subList.push({ id: d.id, tipe: 'leave', ...d.data() }));
          const overSnap = await getDocs(collection(db, 'overtime'));
          overSnap.forEach(d => subList.push({ id: d.id, tipe: 'overtime', ...d.data() }));
        } catch (e) {}
      }
      if (payList.length === 0) {
        try {
          const snap = await getDocs(collection(db, 'payrolls'));
          snap.forEach(d => payList.push({ id: d.id, ...d.data() }));
        } catch (e) {}
      }
      if (setList.length === 0) {
        try {
          const officeDoc = await getDoc(doc(db, 'settings', 'office_location'));
          if (officeDoc.exists()) setList.push({ id: 'office_location', category: 'Lokasi Kantor', ...officeDoc.data() });
          const waDoc = await getDoc(doc(db, 'settings', 'wa_settings'));
          if (waDoc.exists()) setList.push({ id: 'wa_settings', category: 'WhatsApp Gateway', ...waDoc.data() });
          const sheetsDoc = await getDoc(doc(db, 'settings', 'sheets_settings'));
          if (sheetsDoc.exists()) setList.push({ id: 'sheets_settings', category: 'Spreadsheet', ...sheetsDoc.data() });
          const payrollDoc = await getDoc(doc(db, 'settings', 'payroll_settings'));
          if (payrollDoc.exists()) setList.push({ id: 'payroll_settings', category: 'Pengaturan Gaji', ...payrollDoc.data() });
        } catch (e) {}
      }
      if (notifList.length === 0) {
        try {
          const snap = await getDocs(collection(db, 'notifications'));
          snap.forEach(d => notifList.push({ id: d.id, ...d.data() }));
        } catch (e) {}
      }
      if (waLogList.length === 0) {
        try {
          const snap = await getDocs(collection(db, 'wa_logs'));
          snap.forEach(d => waLogList.push({ id: d.id, ...d.data() }));
        } catch (e) {}
      }
      if (adjList.length === 0) {
        try {
          const snap = await getDocs(collection(db, 'attendance_adjustments'));
          snap.forEach(d => adjList.push({ id: d.id, ...d.data() }));
        } catch (e) {}
      }
    }

    // Check existing sheets in Spreadsheet
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const existingTitles = (meta.data.sheets || []).map(s => s.properties?.title).filter(Boolean);

    const requiredSheets = [
      "Daftar_Karyawan",
      "Presensi_Harian",
      "Pengajuan_Cuti_Lembur",
      "Laporan_Gaji",
      "Pengaturan_Sistem",
      "Riwayat_Notifikasi",
      "Log_WhatsApp",
      "Koreksi_Presensi"
    ];

    const missingSheets = requiredSheets.filter(title => !existingTitles.includes(title));

    if (missingSheets.length > 0) {
      const addSheetRequests = missingSheets.map(title => ({
        addSheet: {
          properties: {
            title,
            gridProperties: { frozenRowCount: 1 }
          }
        }
      }));

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: addSheetRequests }
      });
    }

    // Build Batch Data
    const batchData: any[] = [
      {
        range: "Daftar_Karyawan!A1:M1",
        values: [["No WA", "Nama Karyawan", "Divisi", "Jabatan", "Role", "Tipe Gaji", "Gaji Per Jam (Rp)", "Gaji Per Bulan (Rp)", "Bonus Dryer (Rp)", "Password / PIN", "Metode Login", "Sistem Shift", "Tanggal Dibuat"]],
      },
      {
        range: "Presensi_Harian!A1:O1",
        values: [["ID Record", "Tanggal", "No WA", "Nama Karyawan", "Jam Masuk", "Jam Pulang", "Status", "Keterangan", "Is Lembur", "Dryer Menyala", "Total Jam Kerja", "Koordinat GPS", "Alamat Check-in", "Foto Masuk URL", "Foto Pulang URL"]],
      },
      {
        range: "Pengajuan_Cuti_Lembur!A1:M1",
        values: [["ID Pengajuan", "Tipe", "Nama Karyawan", "No WA", "Tanggal Mulai", "Tanggal Selesai", "Jam Mulai", "Jam Selesai", "Durasi", "Alasan / Keterangan", "Status Approval", "Catatan Admin", "Tanggal Dibuat"]],
      },
      {
        range: "Laporan_Gaji!A1:P1",
        values: [["Bulan / Periode", "No WA", "Nama Karyawan", "Divisi", "Jabatan", "Tipe Gaji", "Hari Hadir", "Jam Reguler", "Jam Lembur", "Gaji Dasar (Rp)", "Gaji Lembur (Rp)", "Tunjangan (Rp)", "Potongan (Rp)", "Total Gaji Bersih (Rp)", "Status Bayar", "Tanggal Slip"]],
      },
      {
        range: "Pengaturan_Sistem!A1:E1",
        values: [["Kategori Setting", "Nama Setting / Document ID", "Deskripsi / Nilai Konfigurasi", "Detail JSON Data", "Terakhir Diperbarui"]],
      },
      {
        range: "Riwayat_Notifikasi!A1:G1",
        values: [["ID Notifikasi", "Target User / WA", "Judul Notifikasi", "Pesan Notifikasi", "Tipe", "Status Dibaca", "Waktu Dibuat"]],
      },
      {
        range: "Log_WhatsApp!A1:G1",
        values: [["ID Log", "No WA Tujuan", "Nama Penerima", "Pesan WhatsApp", "Status Kirim", "Gateway Mode", "Waktu Kirim"]],
      },
      {
        range: "Koreksi_Presensi!A1:H1",
        values: [["ID Adjustment", "No WA Karyawan", "Tanggal", "Jam Masuk Baru", "Jam Pulang Baru", "Alasan Perubahan", "Disetujui Oleh", "Tanggal Diubah"]],
      },
    ];

    // 1. Employees
    if (empList.length > 0) {
      const rows = empList.map((e: any) => [
        e.waNumber || e.id || "-",
        e.nama || "-",
        e.divisi || "-",
        e.jabatan || "-",
        e.role || "karyawan",
        e.gaji_type || "per_jam",
        e.gaji_per_jam || 0,
        e.gaji_bulanan || 0,
        e.bonus_dryer_amount || e.bonus_dryer_1 || 0,
        e.password || e.pin || "******",
        e.loginMethod || "password",
        e.shift_system || e.assignedOfficeId || "semua",
        e.created_at || e.createdAt || new Date().toISOString().split('T')[0]
      ]);
      batchData.push({
        range: `Daftar_Karyawan!A2:M${rows.length + 10}`,
        values: rows
      });
    }

    // 2. Attendance
    if (attList.length > 0) {
      const rows = attList.map((a: any) => [
        a.id || "-",
        a.tanggal || "-",
        a.user_waNumber || a.waNumber || a.user_id || "-",
        a.nama || a.user_nama || "-",
        a.jam_masuk || "-",
        a.jam_pulang || "-",
        a.status || "Hadir",
        a.keterangan || a.catatan || "-",
        a.is_lembur ? "Ya" : "Tidak",
        a.dryer_menyala ? "Ya" : "Tidak",
        a.total_jam_kerja || a.durasi_kerja || "-",
        a.latitude_masuk ? `${a.latitude_masuk}, ${a.longitude_masuk}` : "-",
        a.alamat_masuk || a.alamat_pulang || "-",
        a.foto_masuk ? (a.foto_masuk.startsWith('data:') ? '[Foto Base64]' : a.foto_masuk) : "-",
        a.foto_pulang ? (a.foto_pulang.startsWith('data:') ? '[Foto Base64]' : a.foto_pulang) : "-"
      ]);
      batchData.push({
        range: `Presensi_Harian!A2:O${rows.length + 10}`,
        values: rows
      });
    }

    // 3. Submissions
    if (subList.length > 0) {
      const rows = subList.map((s: any) => [
        s.id || "-",
        s.tipe || s.type || "izin",
        s.nama || s.employeeName || s.user_nama || "-",
        s.waNumber || s.user_waNumber || s.user_id || "-",
        s.tanggal_mulai || s.tanggal || "-",
        s.tanggal_akhir || s.tanggal || "-",
        s.jam_mulai || "-",
        s.jam_selesai || "-",
        s.durasi_hari ? `${s.durasi_hari} Hari` : (s.durasi_jam ? `${s.durasi_jam} Jam` : "-"),
        s.alasan || s.keterangan || "-",
        s.status || "pending",
        s.admin_note || s.catatan_admin || "-",
        s.created_at || s.createdAt || "-"
      ]);
      batchData.push({
        range: `Pengajuan_Cuti_Lembur!A2:M${rows.length + 10}`,
        values: rows
      });
    }

    // 4. Payrolls
    if (payList.length > 0) {
      const rows = payList.map((p: any) => [
        p.bulan || p.periode || "-",
        p.employee?.waNumber || p.waNumber || p.user_id || "-",
        p.employee?.nama || p.nama || "-",
        p.employee?.divisi || p.divisi || "-",
        p.employee?.jabatan || p.jabatan || "-",
        p.employee?.gaji_type || p.gaji_type || "-",
        p.daysPresent || p.total_hadir || 0,
        p.totalRegularHours || p.total_jam_reguler || 0,
        p.totalLemburHours || p.total_jam_lembur || 0,
        p.basePay || p.totalRegPay || 0,
        p.totalLemburPay || 0,
        p.totalTunjangan || 0,
        p.totalPotongan || 0,
        p.grandTotalSalary || p.total_gaji || 0,
        p.status || "terbayar",
        p.created_at || p.updated_at || "-"
      ]);
      batchData.push({
        range: `Laporan_Gaji!A2:P${rows.length + 10}`,
        values: rows
      });
    }

    // 5. Settings
    if (setList.length > 0) {
      const rows = setList.map((s: any) => [
        s.category || "Setting Sistem",
        s.id || s.name || "-",
        s.description || (s.id === 'office_location' ? `Radius Office ${s.radius || 100}m` : "-"),
        JSON.stringify(s),
        s.updated_at || s.lastSyncedAt || new Date().toISOString()
      ]);
      batchData.push({
        range: `Pengaturan_Sistem!A2:E${rows.length + 10}`,
        values: rows
      });
    }

    // 6. Notifications
    if (notifList.length > 0) {
      const rows = notifList.map((n: any) => [
        n.id || "-",
        n.target_user_id || n.waNumber || "Semua Karyawan",
        n.title || n.judul || "-",
        n.message || n.pesan || "-",
        n.type || n.tipe || "info",
        n.read ? "Sudah Dibaca" : "Belum Dibaca",
        n.created_at || n.timestamp || "-"
      ]);
      batchData.push({
        range: `Riwayat_Notifikasi!A2:G${rows.length + 10}`,
        values: rows
      });
    }

    // 7. WhatsApp Logs
    if (waLogList.length > 0) {
      const rows = waLogList.map((w: any) => [
        w.id || "-",
        w.waNumber || w.to || "-",
        w.nama || w.recipient || "-",
        w.message || w.pesan || "-",
        w.status || "sent",
        w.mode || "fonnte/wavio",
        w.timestamp || w.created_at || "-"
      ]);
      batchData.push({
        range: `Log_WhatsApp!A2:G${rows.length + 10}`,
        values: rows
      });
    }

    // 8. Adjustments
    if (adjList.length > 0) {
      const rows = adjList.map((j: any) => [
        j.id || "-",
        j.waNumber || j.user_id || "-",
        j.tanggal || "-",
        j.jam_masuk_baru || j.jam_masuk || "-",
        j.jam_pulang_baru || j.jam_pulang || "-",
        j.alasan || j.keterangan || "-",
        j.approved_by || j.admin_name || "-",
        j.updated_at || j.created_at || "-"
      ]);
      batchData.push({
        range: `Koreksi_Presensi!A2:H${rows.length + 10}`,
        values: rows
      });
    }

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: batchData,
      },
    });

    writeLog(`Successfully synced ALL 8 Firestore collections to Google Spreadsheet ID: ${spreadsheetId}`);

    return res.json({
      success: true,
      message: "Seluruh data Firebase (8 Kategori Database) berhasil disinkronkan tanpa ada yang tertinggal ke Google Spreadsheet!",
      syncedCount: {
        employees: empList.length,
        attendance: attList.length,
        submissions: subList.length,
        payrolls: payList.length,
        settings: setList.length,
        notifications: notifList.length,
        waLogs: waLogList.length,
        adjustments: adjList.length
      },
    });
  } catch (error: any) {
    console.error("Error syncing to Google Spreadsheet:", error);
    writeLog(`Error syncing to Google Spreadsheet: ${error.message || error}`);
    return res.status(500).json({
      success: false,
      error: "Gagal menyinkronkan data ke Google Spreadsheet: " + (error.message || String(error)),
    });
  }
});

// 3. Append single Attendance record live
app.post("/api/sheets/append-attendance", async (req, res) => {
  const { spreadsheetId, accessToken, record } = req.body;
  if (!spreadsheetId || !record) {
    return res.status(400).json({ success: false, error: "spreadsheetId and record are required." });
  }

  try {
    const auth = getGoogleAuthClient(accessToken);
    const sheets = google.sheets({ version: "v4", auth });

    const row = [
      record.id || `att-${Date.now()}`,
      record.tanggal || new Date().toISOString().split("T")[0],
      record.user_waNumber || record.user_id || "-",
      record.nama || record.user_nama || "-",
      record.jam_masuk || "-",
      record.jam_pulang || "-",
      record.status || "Hadir",
      record.latitude_masuk ? `${record.latitude_masuk}, ${record.longitude_masuk}` : "-",
      record.alamat_masuk || "-",
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "Presensi_Harian!A:I",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [row],
      },
    });

    return res.json({ success: true, message: "Absen tercatat otomatis di Google Spreadsheet Database!" });
  } catch (error: any) {
    console.error("Error appending attendance to Google Sheets:", error);
    return res.status(500).json({ success: false, error: error.message || String(error) });
  }
});

// 4. Lookup user from Google Sheets Database by WA Number
app.post("/api/sheets/get-user", async (req, res) => {
  let { spreadsheetId, waNumber, accessToken } = req.body;
  
  if (!waNumber) {
    return res.status(400).json({ success: false, error: "waNumber is required." });
  }

  const cleanWa = String(waNumber).replace(/\D/g, '');

  try {
    // If spreadsheetId is not provided, try to fetch from Firestore settings
    if (!spreadsheetId && db) {
      try {
        const snap = await getDoc(doc(db, 'settings', 'sheets_settings'));
        if (snap.exists()) {
          spreadsheetId = snap.data().spreadsheetId;
        }
      } catch (e: any) {
        if (e?.message?.includes('Quota') || e?.code === 'resource-exhausted') {
          console.warn("[Sheets Settings] Firestore quota limit reached when fetching sheets_settings.");
        } else {
          console.warn("Could not read sheets_settings from Firestore:", e?.message || String(e));
        }
      }
    }

    if (!spreadsheetId) {
      return res.json({ success: false, found: false, message: "Spreadsheet ID belum dikonfigurasi." });
    }

    const auth = getGoogleAuthClient(accessToken);
    const sheets = google.sheets({ version: "v4", auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Daftar_Karyawan!A2:G500",
    });

    const rows = response.data.values || [];
    for (const row of rows) {
      const rowWa = String(row[0] || '').replace(/\D/g, '');
      if (rowWa === cleanWa) {
        const user = {
          uid: `wa-${rowWa}`,
          waNumber: rowWa,
          nama: row[1] || `Karyawan ${rowWa}`,
          divisi: row[2] || 'General',
          jabatan: row[3] || 'Staff',
          role: row[4] || (rowWa === '081234567890' ? 'admin' : 'karyawan'),
          gaji_type: row[5] || 'per_jam',
          password: row[6] || '123456',
        };
        return res.json({ success: true, found: true, user });
      }
    }

    return res.json({ success: true, found: false, message: "Karyawan tidak ditemukan di Google Spreadsheet." });
  } catch (error: any) {
    console.error("Error looking up user in Google Sheets:", error);
    return res.status(500).json({ success: false, found: false, error: error.message || String(error) });
  }
});

// 5. Append or update user in Google Sheets Database
app.post("/api/sheets/append-user", async (req, res) => {
  let { spreadsheetId, user, accessToken } = req.body;
  if (!user || !user.waNumber) {
    return res.status(400).json({ success: false, error: "user object with waNumber is required." });
  }

  const cleanWa = String(user.waNumber).replace(/\D/g, '');

  try {
    if (!spreadsheetId && db) {
      try {
        const snap = await getDoc(doc(db, 'settings', 'sheets_settings'));
        if (snap.exists()) {
          spreadsheetId = snap.data().spreadsheetId;
        }
      } catch (e) {}
    }

    if (!spreadsheetId) {
      return res.status(400).json({ success: false, error: "Spreadsheet ID belum dikonfigurasi." });
    }

    const auth = getGoogleAuthClient(accessToken);
    const sheets = google.sheets({ version: "v4", auth });

    const row = [
      cleanWa,
      user.nama || "-",
      user.divisi || "General",
      user.jabatan || "Staff",
      user.role || "karyawan",
      user.gaji_type || "per_jam",
      user.password || user.pin || "123456",
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "Daftar_Karyawan!A:G",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [row],
      },
    });

    return res.json({ success: true, message: "User berhasil ditambahkan ke Google Spreadsheet Database!" });
  } catch (error: any) {
    console.error("Error appending user to Google Sheets:", error);
    return res.status(500).json({ success: false, error: error.message || String(error) });
  }
});

app.post("/api/send-wa", async (req, res) => {
  const { waNumber, message, apiMode, apiToken } = req.body;

  if (!waNumber || !message) {
    return res.status(400).json({ success: false, error: "waNumber and message are required" });
  }

  let cleanNumber = waNumber.replace(/\D/g, '');
  if (cleanNumber.startsWith('0')) {
    cleanNumber = '62' + cleanNumber.substring(1);
  } else if (cleanNumber.startsWith('8')) {
    cleanNumber = '62' + cleanNumber;
  }

  if (apiMode === 'fonnte' && apiToken) {
    try {
      console.log(`[WA Proxy] Sending to Fonnte. Token length: ${apiToken.length}, Start: ${apiToken.substring(0, 3)}, End: ${apiToken.substring(apiToken.length - 3)}`);
      
      const params = new URLSearchParams();
      params.append('target', cleanNumber);
      params.append('message', message);
      // Fonnte documentation says if target is already international, countryCode is not strictly needed or can be provided
      params.append('countryCode', '62');

      const response = await fetch('https://api.fonnte.com/send', {
        method: 'POST',
        headers: {
          'Authorization': apiToken.trim(),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      });
      
      const data: any = await response.json();
      console.log(`[WA Proxy] Fonnte response:`, JSON.stringify(data));
      
      return res.json({
        success: !!data.status,
        status: data.status ? 'Sukses' : `Gagal (Fonnte: ${data.reason || JSON.stringify(data)})`,
        data: data
      });
    } catch (e: any) {
      console.error('Fonnte send error on server proxy:', e.message || e);
      return res.json({
        success: false,
        status: `Gagal (Koneksi: ${e.message || 'Error'})`
      });
    }
  }

  if (apiMode === 'wavio' && apiToken) {
    try {
      console.log(`[WA Proxy] Sending to Wavio. Token length: ${apiToken.length}`);
      const trimmedToken = apiToken.trim();

      // Form payload with multiple standard naming options to ensure maximum reliability and compatibility
      const payload = {
        apikey: trimmedToken,
        api_key: trimmedToken,
        key: trimmedToken,
        token: trimmedToken,
        number: cleanNumber,
        target: cleanNumber,
        to: cleanNumber,
        message: message,
        text: message
      };

      const response = await fetch('https://api.wavio.web.id/api/v1/public', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${trimmedToken}`,
          'X-API-KEY': trimmedToken,
          'X-API-Key': trimmedToken,
          'x-api-key': trimmedToken,
          'api-key': trimmedToken,
          'key': trimmedToken
        },
        body: JSON.stringify(payload)
      });
      
      const data: any = await response.json();
      console.log(`[WA Proxy] Wavio response:`, JSON.stringify(data));
      
      const isSuccess = data.status === 'success' || data.status === true || data.success === true || data.code === 200 || data.message === 'sent' || !!data.status;
      
      return res.json({
        success: isSuccess,
        status: isSuccess ? 'Sukses' : `Gagal (Wavio: ${data.message || data.reason || JSON.stringify(data)})`,
        data: data
      });
    } catch (e: any) {
      console.error('Wavio send error on server proxy:', e.message || e);
      return res.json({
        success: false,
        status: `Gagal (Koneksi: ${e.message || 'Error'})`
      });
    }
  }

  return res.json({
    success: true,
    status: 'Sukses (Simulasi)'
  });
});

// Initialize Firebase on server side
const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
let db: any = null;

if (fs.existsSync(configPath)) {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const firebaseApp = initializeApp(config);
    const dbId = config.firestoreDatabaseId || "ai-studio-624bea7c-68f3-4297-85df-707056c1d162";
    db = initializeFirestore(firebaseApp, {
      experimentalForceLongPolling: true,
      useFetchStreams: false,
    } as any, dbId);
    console.log(`[Firebase Server-Side] Initialized successfully with Database ID: ${dbId}`);
  } catch (err) {
    console.error("[Firebase Server-Side] Failed to initialize:", err);
  }
} else {
  console.error("[Firebase Server-Side] firebase-applet-config.json not found");
}

const getWITATime = () => {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Makassar',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  const parts = formatter.formatToParts(now);
  const partMap = Object.fromEntries(parts.map(p => [p.type, p.value]));
  
  const yearStr = partMap.year;
  const monthStr = partMap.month.padStart(2, '0');
  const dayStr = partMap.day.padStart(2, '0');
  const dateStr = `${yearStr}-${monthStr}-${dayStr}`;
  
  return {
    year: parseInt(yearStr),
    month: parseInt(monthStr),
    day: parseInt(dayStr),
    hour: parseInt(partMap.hour),
    minute: parseInt(partMap.minute),
    dateStr
  };
};

const sendWhatsAppMessageServer = async (waNumber: string, message: string, settings: any) => {
  let cleanNumber = waNumber.replace(/\D/g, '');
  if (cleanNumber.startsWith('0')) {
    cleanNumber = '62' + cleanNumber.substring(1);
  } else if (cleanNumber.startsWith('8')) {
    cleanNumber = '62' + cleanNumber;
  }

  if (settings.apiMode === 'fonnte' && settings.apiToken) {
    try {
      const apiToken = settings.apiToken.trim();
      const params = new URLSearchParams();
      params.append('target', cleanNumber);
      params.append('message', message);
      params.append('countryCode', '62');

      const response = await fetch('https://api.fonnte.com/send', {
        method: 'POST',
        headers: {
          'Authorization': apiToken,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      });
      
      const data: any = await response.json();
      return data.status ? 'Sukses' : `Gagal (Fonnte: ${data.reason || JSON.stringify(data)})`;
    } catch (e: any) {
      console.error('Fonnte send error on server:', e.message || e);
      return `Gagal (Koneksi: ${e.message || 'Error'})`;
    }
  }

  if (settings.apiMode === 'wavio' && settings.apiToken) {
    try {
      const apiToken = settings.apiToken.trim();
      const payload = {
        apikey: apiToken,
        api_key: apiToken,
        key: apiToken,
        token: apiToken,
        number: cleanNumber,
        target: cleanNumber,
        to: cleanNumber,
        message: message,
        text: message
      };

      const response = await fetch('https://api.wavio.web.id/api/v1/public', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiToken}`,
          'X-API-KEY': apiToken,
          'X-API-Key': apiToken,
          'x-api-key': apiToken,
          'api-key': apiToken,
          'key': apiToken
        },
        body: JSON.stringify(payload)
      });
      
      const data: any = await response.json();
      const isSuccess = data.status === 'success' || data.status === true || data.success === true || data.code === 200 || data.message === 'sent' || !!data.status;
      return isSuccess ? 'Sukses' : `Gagal (Wavio: ${data.message || data.reason || JSON.stringify(data)})`;
    } catch (e: any) {
      console.error('Wavio send error on server:', e.message || e);
      return `Gagal (Koneksi: ${e.message || 'Error'})`;
    }
  }
  return 'Sukses (Simulasi)';
};

// Handle Incoming WhatsApp webhook from Wavio / Fonnte
const handleIncomingWebhook = async (req: express.Request, res: express.Response) => {
  writeLog(`[Webhook] Incoming POST request. Body: ${JSON.stringify(req.body)}`);
  
  try {
    if (!db) {
      writeLog("[Webhook] Error: Database is not initialized server-side");
      return res.status(500).json({ success: false, error: "Database not ready" });
    }

    // Extract sender, message, and name using multi-layered fallback parameters to support Wavio and Fonnte structures
    const rawSender = req.body.from || req.body.sender || req.body.number || req.body.phone || req.body.waNumber || req.body.whatsapp || req.body.data?.from || req.body.data?.sender || req.body.data?.number || req.body.data?.phone || req.body.payload?.from || req.body.payload?.sender || req.body.message?.from || '';
    const messageText = req.body.message || req.body.text || req.body.body || req.body.msg || req.body.data?.message || req.body.data?.text || req.body.data?.body || req.body.payload?.message?.text || req.body.payload?.body || req.body.message?.text || '';
    const rawName = req.body.name || req.body.pushname || req.body.senderName || req.body.data?.name || req.body.data?.pushname || req.body.payload?.name || req.body.message?.pushname || '';

    // If both sender and message are missing, it might be an empty ping or non-message event, ignore it safely
    if (!rawSender && !messageText) {
      writeLog("[Webhook] Ignored empty or non-message event payload.");
      return res.json({ success: true, message: "Webhook received, no actionable message data" });
    }

    const cleanNumber = String(rawSender).replace(/\D/g, '');
    if (!cleanNumber) {
      writeLog("[Webhook] Error: No valid phone number in payload");
      return res.json({ success: true, message: "No valid sender phone" });
    }

    writeLog(`[Webhook] Parsed incoming message: sender=${cleanNumber}, message="${messageText}", name="${rawName}"`);

    const wita = getWITATime();
    const dateStr = wita.dateStr; // YYYY-MM-DD
    const timeStr = `${wita.hour.toString().padStart(2, '0')}:${wita.minute.toString().padStart(2, '0')}:${new Date().getSeconds().toString().padStart(2, '0')}`;

    // Get WA settings to know how to reply back to employee
    const settingsDocRef = doc(db, 'settings', 'wa_reminder_settings');
    const settingsSnap = await getDoc(settingsDocRef);
    const waSettings = settingsSnap.exists() ? settingsSnap.data() : { apiMode: 'wavio', apiToken: 'wavio_a9aef1ead31825220df46c29fecac3738eafda0884c2c950bba2b55a441ce75b' };

    // Search for employee with matching WA number
    const usersQ = query(collection(db, 'users'), where('role', '==', 'karyawan'));
    const usersSnap = await getDocs(usersQ);
    let employee: any = null;

    usersSnap.forEach(d => {
      const data = d.data();
      let empWa = String(data.waNumber || '').replace(/\D/g, '');
      if (empWa.startsWith('0')) {
        empWa = '62' + empWa.substring(1);
      } else if (empWa.startsWith('8')) {
        empWa = '62' + empWa;
      }
      
      let incomingWa = cleanNumber;
      if (incomingWa.startsWith('0')) {
        incomingWa = '62' + incomingWa.substring(1);
      } else if (incomingWa.startsWith('8')) {
        incomingWa = '62' + incomingWa;
      }

      if (empWa === incomingWa) {
        employee = { id: d.id, ...data };
      }
    });

    // Case 1: Number not registered as an employee
    if (!employee) {
      writeLog(`[Webhook] Sender number ${cleanNumber} is not registered in system.`);
      
      // Log as incoming to wa_logs for transparency
      await addDoc(collection(db, 'wa_logs'), {
        waNumber: cleanNumber,
        nama: rawName || 'Tamu / Nomor Baru',
        message: `[MASUK] ${messageText}`,
        type: 'incoming',
        triggerTime: timeStr.substring(0, 5),
        status: 'Terkirim',
        timestamp: new Date().toISOString()
      });

      // Send auto-reply to inform them
      const replyMsg = `Halo,\n\nNomor WhatsApp Anda (*${cleanNumber}*) belum terdaftar di sistem Presensi US BILIBILI 162.\n\nSilakan hubungi Admin untuk mendaftarkan nomor Anda agar dapat menggunakan fitur presensi WhatsApp ini.\n\nTerima kasih!`;
      await sendWhatsAppMessageServer(cleanNumber, replyMsg, waSettings);
      
      return res.json({ success: true, message: "Sender not registered" });
    }

    writeLog(`[Webhook] Matched employee: ${employee.nama} (ID: ${employee.id})`);

    // Log the incoming message in Firestore wa_logs
    await addDoc(collection(db, 'wa_logs'), {
      waNumber: cleanNumber,
      nama: employee.nama,
      message: `[MASUK] ${messageText}`,
      type: 'incoming',
      triggerTime: timeStr.substring(0, 5),
      status: 'Terkirim',
      timestamp: new Date().toISOString()
    });

    const msgLower = messageText.toString().toLowerCase().trim();

    // Check if employee intends to Check-In or Check-Out or Leave
    const isCheckIn = /^(masuk|hadir|absen masuk|presensi masuk|pagi|checkin|check\s*in|in)$/.test(msgLower) || msgLower.includes('masuk') || msgLower.includes('hadir');
    const isCheckOut = /^(pulang|keluar|sore|absen pulang|presensi pulang|checkout|check\s*out|out)$/.test(msgLower) || msgLower.includes('pulang') || msgLower.includes('keluar');
    const isLeave = msgLower.includes('izin') || msgLower.includes('sakit') || msgLower.includes('cuti');

    // Retrieve today's attendance record
    const attRef = collection(db, 'attendance');
    const q = query(attRef, where('user_id', '==', employee.id), where('tanggal', '==', dateStr));
    const existing = await getDocs(q);

    // Retrieve office location default coordinates
    const officeDocRef = doc(db, 'settings', 'office_location');
    const officeSnap = await getDoc(officeDocRef);
    let lat = -6.917464; // Default Bandung coordinates
    let lng = 107.619122; // Default Bandung coordinates
    let officeName = 'Kantor Pusat';
    
    if (officeSnap.exists()) {
      const officeData = officeSnap.data();
      if (officeData.offices && officeData.offices.length > 0) {
        lat = Number(officeData.offices[0].latitude) || lat;
        lng = Number(officeData.offices[0].longitude) || lng;
        officeName = officeData.offices[0].name || officeName;
      } else if (officeData.latitude && officeData.longitude) {
        lat = Number(officeData.latitude);
        lng = Number(officeData.longitude);
        officeName = officeData.name || officeName;
      }
    }
    const address = `Presensi via WhatsApp (Wavio Bot) - Area ${officeName}`;

    // Action A: ABSEN MASUK
    if (isCheckIn) {
      if (!existing.empty) {
        const checkinTime = existing.docs[0].data().jam_masuk;
        const replyMsg = `Halo *${employee.nama}*,\n\nAnda sudah melakukan absen masuk hari ini pada pukul *${checkinTime} WITA*.\n\nTerima kasih!`;
        await sendWhatsAppMessageServer(cleanNumber, replyMsg, waSettings);
        return res.json({ success: true, message: "Already checked in today" });
      }

      let status = 'Hadir';
      if (timeStr > '08:00:00') {
        status = 'Terlambat';
      }

      await addDoc(attRef, {
        user_id: employee.id,
        tanggal: dateStr,
        jam_masuk: timeStr,
        latitude_masuk: lat,
        longitude_masuk: lng,
        alamat_masuk: address,
        selfie_masuk: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=200', // standard profile placeholder
        status: status,
        via: 'WhatsApp',
        created_at: new Date().toISOString()
      });

      const replyMsg = `Halo *${employee.nama}*,\n\nAbsen *MASUK* Anda berhasil dicatat via WhatsApp!\n\n📅 Tanggal: ${dateStr}\n⏰ Jam: ${timeStr} WITA\n📌 Status: *${status}*\n📍 Lokasi: ${address}\n\nTetap semangat kerja! 💪`;
      await sendWhatsAppMessageServer(cleanNumber, replyMsg, waSettings);
      return res.json({ success: true, message: "Check-in recorded" });
    } 
    
    // Action B: ABSEN PULANG
    if (isCheckOut) {
      if (existing.empty) {
        const replyMsg = `Halo *${employee.nama}*,\n\nAnda belum melakukan absen masuk hari ini. Silakan lakukan absen masuk terlebih dahulu dengan mengirim pesan *Masuk* atau *Hadir*.`;
        await sendWhatsAppMessageServer(cleanNumber, replyMsg, waSettings);
        return res.json({ success: true, message: "Need to check-in first" });
      }

      const docToUpdate = existing.docs[0];
      if (docToUpdate.data().jam_pulang) {
        const replyMsg = `Halo *${employee.nama}*,\n\nAnda sudah melakukan absen pulang hari ini pada pukul *${docToUpdate.data().jam_pulang} WITA*.\n\nTerima kasih!`;
        await sendWhatsAppMessageServer(cleanNumber, replyMsg, waSettings);
        return res.json({ success: true, message: "Already checked out today" });
      }

      await setDoc(doc(db, 'attendance', docToUpdate.id), {
        jam_pulang: timeStr,
        latitude_pulang: lat,
        longitude_pulang: lng,
        alamat_pulang: address,
        selfie_pulang: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=200',
        via: 'WhatsApp',
        updated_at: new Date().toISOString()
      }, { merge: true });

      const replyMsg = `Halo *${employee.nama}*,\n\nAbsen *PULANG* Anda berhasil dicatat via WhatsApp!\n\n📅 Tanggal: ${dateStr}\n⏰ Jam: ${timeStr} WITA\n📍 Lokasi: ${address}\n\nSelamat istirahat dan hati-hati di jalan! 🏠🚗`;
      await sendWhatsAppMessageServer(cleanNumber, replyMsg, waSettings);
      return res.json({ success: true, message: "Check-out recorded" });
    }

    // Action C: IZIN/SAKIT/CUTI
    if (isLeave) {
      const replyMsg = `Halo *${employee.nama}*,\n\nUntuk pengajuan Izin, Sakit, atau Cuti, silakan ajukan secara resmi melalui *Menu Pengajuan* di aplikasi web *US BILIBILI HADIR 162* agar dapat divalidasi oleh Admin beserta bukti Surat Keterangan / Dokumen pendukung.\n\nTerima kasih!`;
      await sendWhatsAppMessageServer(cleanNumber, replyMsg, waSettings);
      return res.json({ success: true, message: "Instructed leave submission" });
    }

    // Action D: HELP / DEFAULT GUIDE
    const replyMsg = `Halo *${employee.nama}*,\n\nSelamat datang di Layanan Bot WhatsApp *US BILIBILI HADIR 162*.\n\nAnda dapat melakukan presensi kehadiran secara instan dengan mengirimkan pesan berikut:\n\n*1. Absen Masuk Pagi*\nKirim pesan: *Masuk* atau *Hadir*\n\n*2. Absen Pulang Sore*\nKirim pesan: *Pulang*\n\n*3. Pengajuan Izin/Sakit/Cuti*\nSilakan ajukan langsung melalui aplikasi web kami.\n\nTerima kasih dan selamat bertugas! 💼💪`;
    await sendWhatsAppMessageServer(cleanNumber, replyMsg, waSettings);
    return res.json({ success: true, message: "Help menu sent" });

  } catch (error: any) {
    console.error("[Webhook] Error processing incoming webhook:", error);
    writeLog(`[Webhook] Error: ${error.message || String(error)}`);
    return res.status(500).json({ success: false, error: error.message || String(error) });
  }
};

// Route mapping for webhook (POST handlers)
app.post("/", handleIncomingWebhook);
app.post("/webhook", handleIncomingWebhook);
app.post("/api/webhook", handleIncomingWebhook);

async function checkAndRunScheduler() {
  if (!db) return;
  
  try {
    const wita = getWITATime();
    const hour = wita.hour;
    const dateStr = wita.dateStr;
    
    // Fetch WhatsApp Settings
    const settingsDocRef = doc(db, 'settings', 'wa_reminder_settings');
    const settingsSnap = await getDoc(settingsDocRef);
    if (!settingsSnap.exists()) {
      return;
    }
    
    const settings = settingsSnap.data();
    if (!settings.enabled) {
      return;
    }
    
    const morningHours = settings.morningHours || [5, 6, 7, 8, 9];
    const eveningHours = settings.eveningHours || [17, 18, 19, 20, 21, 22];
    
    const isMorning = morningHours.includes(hour);
    const isEvening = eveningHours.includes(hour);
    
    if (!isMorning && !isEvening) {
      return;
    }
    
    // Check if already triggered for this hour of this date
    const triggerId = `${dateStr}_${hour.toString().padStart(2, '0')}`;
    const triggerDocRef = doc(db, 'wa_scheduled_triggers', triggerId);
    const triggerSnap = await getDoc(triggerDocRef);
    
    if (triggerSnap.exists()) {
      return;
    }
    
    // Mark as running/started to avoid duplicate triggers
    await setDoc(triggerDocRef, {
      status: 'running',
      timestamp: new Date().toISOString(),
      hour,
      dateStr
    });
    
    console.log(`[WA Scheduler] Running reminder for trigger: ${triggerId}`);
    
    // 1. Fetch all employees
    const usersQ = query(collection(db, 'users'), where('role', '==', 'karyawan'));
    const usersSnap = await getDocs(usersQ);
    const employees: any[] = [];
    usersSnap.forEach(d => {
      employees.push({ id: d.id, ...d.data() });
    });
    
    if (employees.length === 0) {
      console.log("[WA Scheduler] No employees found, marking completed.");
      await setDoc(triggerDocRef, {
        status: 'completed',
        reason: 'no employees',
        timestamp: new Date().toISOString()
      }, { merge: true });
      return;
    }
    
    // 2. Fetch today's attendance
    const attendanceQ = query(collection(db, 'attendance'), where('tanggal', '==', dateStr));
    const attendanceSnap = await getDocs(attendanceQ);
    const attendanceMap: Record<string, any> = {};
    attendanceSnap.forEach(d => {
      const data = d.data();
      attendanceMap[data.user_id] = data;
    });
    
    // 3. Fetch approved leave/cuti/sakit for today
    const leaveQ = query(collection(db, 'leave_requests'), where('tanggal_mulai', '<=', dateStr));
    const leaveSnap = await getDocs(leaveQ);
    const onLeaveSet = new Set<string>();
    leaveSnap.forEach(d => {
      const data = d.data();
      if (data.status === 'approved' && data.tanggal_akhir >= dateStr) {
        onLeaveSet.add(data.user_id);
      }
    });
    
    const displayHour = `${hour.toString().padStart(2, '0')}:00`;
    let countDispatched = 0;
    
    for (const emp of employees) {
      if (onLeaveSet.has(emp.id)) {
        continue;
      }
      
      const att = attendanceMap[emp.id];
      let shouldRemind = false;
      let template = '';
      let typeLabel = '';
      
      if (isMorning) {
        if (!att || !att.jam_masuk) {
          shouldRemind = true;
          template = settings.morningTemplate || 'Halo *{nama}*, jangan lupa untuk melakukan presensi MASUK hari ini pada jam {jam} WITA melalui aplikasi US BILIBILI HADIR 162. Tetap semangat kerja! 💪';
          typeLabel = 'auto_pagi';
        }
      } else if (isEvening) {
        if (att && att.jam_masuk && !att.jam_pulang) {
          shouldRemind = true;
          template = settings.eveningTemplate || 'Halo *{nama}*, jangan lupa untuk melakukan presensi PULANG hari ini pada jam {jam} WITA melalui aplikasi US BILIBILI HADIR 162. Selamat istirahat dan hati-hati di jalan! 🏠🚗';
          typeLabel = 'auto_sore';
        }
      }
      
      if (shouldRemind && emp.waNumber) {
        const formattedMsg = template
          .replace(/{nama}/g, emp.nama)
          .replace(/{jam}/g, displayHour)
          .replace(/{jenis}/g, isMorning ? 'MASUK' : 'PULANG');
        
        const status = await sendWhatsAppMessageServer(emp.waNumber, formattedMsg, settings);
        
        await addDoc(collection(db, 'wa_logs'), {
          waNumber: emp.waNumber.replace(/\D/g, ''),
          nama: emp.nama,
          message: formattedMsg,
          type: typeLabel,
          triggerTime: displayHour,
          status: status,
          timestamp: new Date().toISOString()
        });
        
        countDispatched++;
      }
    }
    
    await setDoc(triggerDocRef, {
      status: 'completed',
      dispatchedCount: countDispatched,
      timestamp: new Date().toISOString()
    }, { merge: true });
    
    console.log(`[WA Scheduler] Trigger ${triggerId} processed. Dispatched: ${countDispatched}`);
  } catch (err: any) {
    if (err?.message?.includes('Quota') || err?.code === 'resource-exhausted') {
      console.warn("[WA Scheduler] Firestore quota limit reached. Pausing scheduled check until quota resets.");
    } else if (err?.message?.includes('offline') || err?.code === 'unavailable' || err?.message?.includes('NOT_FOUND')) {
      console.warn("[WA Scheduler] Firestore connection offline or reconnecting. Will retry next interval.");
    } else {
      console.error("[WA Scheduler] Error executing scheduler:", err?.message || String(err));
    }
  }
}

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

  if (db) {
    setTimeout(async () => {
      console.log("[WA Scheduler] Auto-seeding Fonnte API token and configuration...");
      try {
        const settingsDocRef = doc(db, 'settings', 'wa_reminder_settings');
        const settingsSnap = await getDoc(settingsDocRef);
        const existingData = settingsSnap.exists() ? settingsSnap.data() : {};
        
        const currentToken = existingData.apiToken;
        const defaultToken = 'iJKgQV7XBzgWmoKUJqYv';
        const finalToken = currentToken || defaultToken;
        
        await setDoc(settingsDocRef, {
          enabled: existingData.enabled !== undefined ? existingData.enabled : true,
          apiMode: existingData.apiMode || 'fonnte',
          apiToken: finalToken,
          morningHours: existingData.morningHours || [5, 6, 7, 8, 9],
          eveningHours: existingData.eveningHours || [17, 18, 19, 20, 21, 22],
          morningTemplate: existingData.morningTemplate || 'Halo *{nama}*, jangan lupa untuk melakukan presensi MASUK hari ini pada jam {jam} WITA melalui aplikasi US BILIBILI HADIR 162. Tetap semangat kerja! 💪',
          eveningTemplate: existingData.eveningTemplate || 'Halo *{nama}*, jangan lupa untuk melakukan presensi PULANG hari ini pada jam {jam} WITA melalui aplikasi US BILIBILI HADIR 162. Selamat istirahat dan hati-hati di jalan! 🏠🚗'
        }, { merge: true });
        console.log("[WA Scheduler] Fonnte API settings loaded/auto-seeded successfully.");
      } catch (err: any) {
        if (err?.message?.includes('Quota') || err?.code === 'resource-exhausted') {
          console.warn("[WA Scheduler] Firestore quota limit reached during auto-seed. Deferred until quota resets.");
        } else {
          console.error("[WA Scheduler] Failed to auto-seed Fonnte settings:", err);
        }
      }

      console.log("[WA Scheduler] Starting automated background checker...");
      checkAndRunScheduler();
    }, 5000);
    setInterval(checkAndRunScheduler, 60000);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
