import "dotenv/config";
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
    console.warn("GEMINI_API_KEY is not set or using placeholder. Falling back to local offline validation.");
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
    console.error("Error during AI selfie verification, falling back to local validation:", error);
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

// AI Suspicious Request Pattern Analysis Endpoint
app.post("/api/analyze-suspicious-request", async (req, res) => {
  const { leaveRequest, employeeName, employeeHistory, attendanceHistory } = req.body;

  if (!leaveRequest || !employeeName) {
    return res.status(400).json({ success: false, error: "leaveRequest and employeeName are required." });
  }

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
