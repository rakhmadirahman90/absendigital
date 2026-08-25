export const DEFAULT_USERS = [
  {
    id: 'wa-081234567890',
    waNumber: '081234567890',
    nama: 'Admin US BILIBILI 162',
    divisi: 'MANAGEMENT',
    jabatan: 'HEAD ADMIN',
    role: 'admin',
    password: 'admin',
    assignedOfficeId: 'all',
    gaji_type: 'bulanan',
    gaji_bulanan: 5000000,
    gaji_per_jam: 0,
    loginMethod: 'password'
  },
  {
    id: 'wa-0816200001',
    waNumber: '0816200001',
    nama: 'ASMA',
    divisi: '162',
    jabatan: 'OPERATOR',
    role: 'karyawan',
    password: '123456',
    assignedOfficeId: 'all',
    gaji_type: 'per_jam',
    gaji_bulanan: 0,
    gaji_per_jam: 12000,
    gaji_lembur_per_jam: 16000,
    bonus_dryer_1: false
  },
  {
    id: 'wa-0816200002',
    waNumber: '0816200002',
    nama: 'JUNED',
    divisi: '162',
    jabatan: 'OPERATOR',
    role: 'karyawan',
    password: '123456',
    assignedOfficeId: 'all',
    gaji_type: 'per_jam',
    gaji_bulanan: 0,
    gaji_per_jam: 12000,
    gaji_lembur_per_jam: 15000,
    bonus_dryer_1: false
  },
  {
    id: 'wa-0816200003',
    waNumber: '0816200003',
    nama: 'ABI',
    divisi: '162',
    jabatan: 'OPERATOR',
    role: 'karyawan',
    password: '123456',
    assignedOfficeId: 'all',
    gaji_type: 'per_jam',
    gaji_bulanan: 0,
    gaji_per_jam: 13000,
    gaji_lembur_per_jam: 14000,
    bonus_dryer_1: true
  },
  {
    id: 'wa-0816200004',
    waNumber: '0816200004',
    nama: 'JUMA',
    divisi: '162',
    jabatan: 'PENGAWAS GUD',
    role: 'karyawan',
    password: '123456',
    assignedOfficeId: 'all',
    gaji_type: 'per_jam',
    gaji_bulanan: 0,
    gaji_per_jam: 14000,
    gaji_lembur_per_jam: 14000,
    bonus_dryer_1: false
  },
  {
    id: 'wa-0816200005',
    waNumber: '0816200005',
    nama: 'PUNDU',
    divisi: '162',
    jabatan: 'OPERATOR',
    role: 'karyawan',
    password: '123456',
    assignedOfficeId: 'all',
    gaji_type: 'per_jam',
    gaji_bulanan: 0,
    gaji_per_jam: 10000,
    gaji_lembur_per_jam: 14000,
    bonus_dryer_1: false
  }
];

const todayStr = new Date().toISOString().split('T')[0];

export const DEFAULT_ATTENDANCE = [
  {
    id: 'att-abi-today',
    user_id: 'wa-0816200003',
    user_waNumber: '0816200003',
    nama: 'ABI',
    user_nama: 'ABI',
    tanggal: todayStr,
    jam_masuk: '07:30',
    istirahat: 1,
    status: 'Hadir',
    is_lembur: false,
    dryer_menyala: true,
    total_jam_kerja: 0,
    alamat_masuk: 'Kantor Pusat US BILIBILI 162',
    latitude_masuk: -5.147665,
    longitude_masuk: 119.432732
  },
  {
    id: 'att-juma-today',
    user_id: 'wa-0816200004',
    user_waNumber: '0816200004',
    nama: 'JUMA',
    user_nama: 'JUMA',
    tanggal: todayStr,
    jam_masuk: '08:00',
    istirahat: 1,
    status: 'Hadir',
    is_lembur: false,
    dryer_menyala: false,
    total_jam_kerja: 0,
    alamat_masuk: 'Kantor Pusat US BILIBILI 162',
    latitude_masuk: -5.147665,
    longitude_masuk: 119.432732
  },
  {
    id: 'att-pundu-today',
    user_id: 'wa-0816200005',
    user_waNumber: '0816200005',
    nama: 'PUNDU',
    user_nama: 'PUNDU',
    tanggal: todayStr,
    jam_masuk: '08:15',
    istirahat: 1,
    status: 'Hadir',
    is_lembur: false,
    dryer_menyala: false,
    total_jam_kerja: 0,
    alamat_masuk: 'Kantor Pusat US BILIBILI 162',
    latitude_masuk: -5.147665,
    longitude_masuk: 119.432732
  },
  {
    id: 'att-asma-today',
    user_id: 'wa-0816200001',
    user_waNumber: '0816200001',
    nama: 'ASMA',
    user_nama: 'ASMA',
    tanggal: todayStr,
    jam_masuk: '18:00',
    istirahat: 0,
    status: 'Hadir',
    is_lembur: true,
    dryer_menyala: false,
    total_jam_kerja: 0,
    alamat_masuk: 'Kantor Pusat US BILIBILI 162',
    latitude_masuk: -5.147665,
    longitude_masuk: 119.432732
  },
  {
    id: 'att-juned-today',
    user_id: 'wa-0816200002',
    user_waNumber: '0816200002',
    nama: 'JUNED',
    user_nama: 'JUNED',
    tanggal: todayStr,
    jam_masuk: '17:00',
    istirahat: 0,
    status: 'Hadir',
    is_lembur: true,
    dryer_menyala: false,
    total_jam_kerja: 0,
    alamat_masuk: 'Kantor Pusat US BILIBILI 162',
    latitude_masuk: -5.147665,
    longitude_masuk: 119.432732
  }
];

export const DEFAULT_LEAVE_REQUESTS = [
  {
    id: 'leave-sample-1',
    user_id: 'wa-0816200005',
    waNumber: '0816200005',
    nama: 'PUNDU',
    employeeName: 'PUNDU',
    tipe: 'cuti',
    tanggal_mulai: todayStr,
    tanggal_akhir: todayStr,
    durasi_hari: 1,
    alasan: 'Keperluan keluarga mendadak',
    status: 'pending',
    created_at: new Date().toISOString()
  }
];

export const DEFAULT_OVERTIME_REQUESTS = [
  {
    id: 'overtime-sample-1',
    user_id: 'wa-0816200003',
    waNumber: '0816200003',
    nama: 'ABI',
    employeeName: 'ABI',
    tipe: 'lembur',
    tanggal: todayStr,
    jam_mulai: '18:00',
    jam_selesai: '22:00',
    durasi_jam: 4,
    keterangan: 'Lembur pengeringan dryer & sortir bahan',
    status: 'pending',
    created_at: new Date().toISOString()
  }
];

export const DEFAULT_PAYROLLS = [
  {
    id: 'pay-abi-july',
    bulan: '2026-07',
    user_id: 'wa-0816200003',
    waNumber: '0816200003',
    nama: 'ABI',
    daysPresent: 22,
    totalRegularHours: 198,
    totalLemburHours: 24,
    basePay: 2574000,
    totalLemburPay: 336000,
    totalTunjangan: 150000,
    totalPotongan: 0,
    grandTotalSalary: 3060000,
    status: 'terbayar'
  },
  {
    id: 'pay-juma-july',
    bulan: '2026-07',
    user_id: 'wa-0816200004',
    waNumber: '0816200004',
    nama: 'JUMA',
    daysPresent: 24,
    totalRegularHours: 216,
    totalLemburHours: 18,
    basePay: 3024000,
    totalLemburPay: 252000,
    totalTunjangan: 200000,
    totalPotongan: 0,
    grandTotalSalary: 3476000,
    status: 'terbayar'
  }
];
