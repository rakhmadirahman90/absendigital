import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, orderBy } from 'firebase/firestore';
import { format, parseISO } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-hot-toast';
import { 
  ClipboardList, 
  Calendar, 
  Clock, 
  Plus, 
  Trash2, 
  FileText, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  ChevronRight,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ConfirmDialog } from '../components/ConfirmDialog';

type TipeIzin = 'izin' | 'sakit' | 'cuti';

export default function Submissions() {
  const { user } = useAuth();
  
  const [activeSubTab, setActiveSubTab] = useState<'leave' | 'overtime'>('leave');
  const [leaveSubmissions, setLeaveSubmissions] = useState<any[]>([]);
  const [overtimeSubmissions, setOvertimeSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals status
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [isOvertimeModalOpen, setIsOvertimeModalOpen] = useState(false);
  const [deleteData, setDeleteData] = useState<{ id: string; collection: string } | null>(null);

  // Form states for Leave/Permission
  const [leaveForm, setLeaveForm] = useState({
    tipe: 'izin' as TipeIzin,
    tanggal_mulai: '',
    tanggal_akhir: '',
    alasan: ''
  });

  // Form states for Overtime
  const [overtimeForm, setOvertimeForm] = useState({
    tanggal: '',
    durasi_jam: 1,
    keterangan: ''
  });

  // Fetch submissions on load
  useEffect(() => {
    if (!user) return;

    setLoading(true);

    // Leave queries
    const leaveQuery = query(
      collection(db, 'leave_requests'),
      where('user_id', '==', user.uid),
      orderBy('created_at', 'desc')
    );

    const unsubLeave = onSnapshot(leaveQuery, (snapshot) => {
      const leaves = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLeaveSubmissions(leaves);
    }, (error) => {
      console.error("Error fetching leave requests:", error);
    });

    // Overtime queries
    const overtimeQuery = query(
      collection(db, 'overtime'),
      where('user_id', '==', user.uid)
    );

    const unsubOvertime = onSnapshot(overtimeQuery, (snapshot) => {
      const overtimes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort client side or server side
      overtimes.sort((a: any, b: any) => {
        const bTime = b.created_at ? (b.created_at.seconds || new Date(b.created_at).getTime()) : 0;
        const aTime = a.created_at ? (a.created_at.seconds || new Date(a.created_at).getTime()) : 0;
        return bTime - aTime;
      });
      setOvertimeSubmissions(overtimes);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching overtime requests:", error);
      setLoading(false);
    });

    return () => {
      unsubLeave();
      unsubOvertime();
    };
  }, [user]);

  // Handle Leave Submission
  const handleLeaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const { tipe, tanggal_mulai, tanggal_akhir, alasan } = leaveForm;

    if (!tanggal_mulai || !tanggal_akhir || !alasan.trim()) {
      toast.error('Mohon lengkapi semua field formulir.');
      return;
    }

    if (new Date(tanggal_mulai) > new Date(tanggal_akhir)) {
      toast.error('Tanggal mulai tidak boleh melebihi tanggal akhir.');
      return;
    }

    try {
      await addDoc(collection(db, 'leave_requests'), {
        user_id: user.uid,
        tipe,
        tanggal_mulai,
        tanggal_akhir,
        alasan: alasan.trim(),
        status: 'pending',
        created_at: new Date().toISOString(),
        catatan_admin: ''
      });

      toast.success('Pengajuan izin/cuti berhasil dikirim');
      setIsLeaveModalOpen(false);
      setLeaveForm({
        tipe: 'izin',
        tanggal_mulai: '',
        tanggal_akhir: '',
        alasan: ''
      });
    } catch (err) {
      console.error("Error adding leave request:", err);
      toast.error('Gagal mengirimkan pengajuan.');
    }
  };

  // Handle Overtime Submission
  const handleOvertimeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const { tanggal, durasi_jam, keterangan } = overtimeForm;

    if (!tanggal || !keterangan.trim()) {
      toast.error('Mohon lengkapi semua field formulir.');
      return;
    }

    if (durasi_jam <= 0) {
      toast.error('Durasi jam lembur harus lebih besar dari 0.');
      return;
    }

    try {
      await addDoc(collection(db, 'overtime'), {
        user_id: user.uid,
        tanggal,
        durasi_jam: Number(durasi_jam),
        keterangan: keterangan.trim(),
        status: 'pending',
        created_at: new Date().toISOString(),
        catatan_admin: ''
      });

      toast.success('Pengajuan lembur berhasil dikirim');
      setIsOvertimeModalOpen(false);
      setOvertimeForm({
        tanggal: '',
        durasi_jam: 1,
        keterangan: ''
      });
    } catch (err) {
      console.error("Error adding overtime request:", err);
      toast.error('Gagal mengirimkan pengajuan.');
    }
  };

  // Handle Cancellation/Deletion of Pending Request
  const handleDeleteConfirm = async () => {
    if (!deleteData) return;
    try {
      await deleteDoc(doc(db, deleteData.collection, deleteData.id));
      toast.success('Pengajuan berhasil dibatalkan');
    } catch (err) {
      console.error("Error canceling submission:", err);
      toast.error('Gagal membatalkan pengajuan');
    } finally {
      setDeleteData(null);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <ClipboardList className="text-blue-600" size={26} />
            Pengajuan Saya
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Kirim dan pantau status pengajuan izin, cuti, sakit, dan lembur Anda.
          </p>
        </div>
        
        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setIsLeaveModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl shadow-sm transition-all text-sm"
          >
            <Plus size={18} />
            Pengajuan Izin/Cuti
          </button>
          <button
            onClick={() => setIsOvertimeModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-medium rounded-xl shadow-sm transition-all text-sm"
          >
            <Plus size={18} />
            Pengajuan Lembur
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-6">
          <button
            onClick={() => setActiveSubTab('leave')}
            className={`pb-4 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
              activeSubTab === 'leave'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
          >
            <Calendar size={18} />
            Izin / Sakit / Cuti
            <span className={`ml-1 text-xs px-2 py-0.5 rounded-full ${activeSubTab === 'leave' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
              {leaveSubmissions.length}
            </span>
          </button>
          <button
            onClick={() => setActiveSubTab('overtime')}
            className={`pb-4 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
              activeSubTab === 'overtime'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
          >
            <Clock size={18} />
            Lembur
            <span className={`ml-1 text-xs px-2 py-0.5 rounded-full ${activeSubTab === 'overtime' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
              {overtimeSubmissions.length}
            </span>
          </button>
        </nav>
      </div>

      {/* List Submissions */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-h-[300px]">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 text-slate-500 space-y-3">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm">Memuat data pengajuan...</p>
          </div>
        ) : activeSubTab === 'leave' ? (
          // Leave Requests Table / List
          leaveSubmissions.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center text-slate-500 space-y-4">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
                <Calendar size={28} />
              </div>
              <div>
                <h4 className="font-semibold text-slate-700">Belum Ada Pengajuan Izin/Cuti</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  Semua pengajuan cuti, sakit, maupun izin Anda akan ditampilkan di sini setelah Anda mengirimkannya.
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="p-4 font-semibold text-slate-600 text-sm">Tipe</th>
                    <th className="p-4 font-semibold text-slate-600 text-sm">Rentang Tanggal</th>
                    <th className="p-4 font-semibold text-slate-600 text-sm min-w-[200px]">Alasan</th>
                    <th className="p-4 font-semibold text-slate-600 text-sm">Status</th>
                    <th className="p-4 font-semibold text-slate-600 text-sm text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {leaveSubmissions.map((record) => (
                    <tr key={record.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 text-sm font-medium">
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold capitalize ${
                          record.tipe === 'cuti' 
                            ? 'bg-blue-50 text-blue-700 border border-blue-100' 
                            : record.tipe === 'sakit'
                            ? 'bg-amber-50 text-amber-700 border border-amber-100'
                            : 'bg-purple-50 text-purple-700 border border-purple-100'
                        }`}>
                          {record.tipe}
                        </span>
                      </td>
                      <td className="p-4 text-sm text-slate-700">
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {format(parseISO(record.tanggal_mulai), 'dd MMM yyyy', { locale: idLocale })}
                          </span>
                          <span className="text-xs text-slate-400">
                            s/d {format(parseISO(record.tanggal_akhir), 'dd MMM yyyy', { locale: idLocale })}
                          </span>
                        </div>
                      </td>
                      <td className="p-4 text-sm">
                        <div className="space-y-1">
                          <p className="text-slate-600 text-sm line-clamp-2">{record.alasan}</p>
                          {record.catatan_admin && (
                            <div className="flex gap-1 items-start bg-slate-50 border border-slate-100 p-2 rounded-lg text-xs mt-2 text-slate-500">
                              <Info size={14} className="text-slate-400 shrink-0 mt-0.5" />
                              <div>
                                <span className="font-semibold text-slate-700">Catatan Admin:</span> {record.catatan_admin}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          record.status === 'approved' 
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                            : record.status === 'rejected' 
                            ? 'bg-rose-50 text-rose-700 border border-rose-100' 
                            : 'bg-amber-50 text-amber-700 border border-amber-100'
                        }`}>
                          {record.status === 'approved' && <CheckCircle size={12} />}
                          {record.status === 'rejected' && <XCircle size={12} />}
                          {record.status === 'pending' && <AlertCircle size={12} />}
                          <span className="capitalize">{record.status}</span>
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        {record.status === 'pending' && (
                          <button
                            onClick={() => setDeleteData({ id: record.id, collection: 'leave_requests' })}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                            title="Batalkan Pengajuan"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          // Overtime Submissions Table / List
          overtimeSubmissions.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center text-slate-500 space-y-4">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
                <Clock size={28} />
              </div>
              <div>
                <h4 className="font-semibold text-slate-700">Belum Ada Pengajuan Lembur</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  Semua data lembur Anda akan ditampilkan di sini setelah pengajuan diajukan ke admin.
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="p-4 font-semibold text-slate-600 text-sm">Tanggal Lembur</th>
                    <th className="p-4 font-semibold text-slate-600 text-sm">Durasi</th>
                    <th className="p-4 font-semibold text-slate-600 text-sm min-w-[200px]">Keterangan</th>
                    <th className="p-4 font-semibold text-slate-600 text-sm">Status</th>
                    <th className="p-4 font-semibold text-slate-600 text-sm text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {overtimeSubmissions.map((record) => (
                    <tr key={record.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 text-sm text-slate-800 font-medium">
                        {format(parseISO(record.tanggal), 'dd MMMM yyyy', { locale: idLocale })}
                      </td>
                      <td className="p-4 text-sm text-slate-700 font-semibold font-mono">
                        {record.durasi_jam} Jam
                      </td>
                      <td className="p-4 text-sm">
                        <div className="space-y-1">
                          <p className="text-slate-600 text-sm line-clamp-2">{record.keterangan}</p>
                          {record.catatan_admin && (
                            <div className="flex gap-1 items-start bg-slate-50 border border-slate-100 p-2 rounded-lg text-xs mt-2 text-slate-500">
                              <Info size={14} className="text-slate-400 shrink-0 mt-0.5" />
                              <div>
                                <span className="font-semibold text-slate-700">Catatan Admin:</span> {record.catatan_admin}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          record.status === 'approved' 
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                            : record.status === 'rejected' 
                            ? 'bg-rose-50 text-rose-700 border border-rose-100' 
                            : 'bg-amber-50 text-amber-700 border border-amber-100'
                        }`}>
                          {record.status === 'approved' && <CheckCircle size={12} />}
                          {record.status === 'rejected' && <XCircle size={12} />}
                          {record.status === 'pending' && <AlertCircle size={12} />}
                          <span className="capitalize">{record.status}</span>
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        {record.status === 'pending' && (
                          <button
                            onClick={() => setDeleteData({ id: record.id, collection: 'overtime' })}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                            title="Batalkan Pengajuan"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* Confirm Deletion Dialog */}
      <ConfirmDialog
        isOpen={!!deleteData}
        title="Batalkan Pengajuan"
        message="Apakah Anda yakin ingin membatalkan pengajuan ini? Tindakan ini akan menghapus draf pengajuan."
        confirmText="Batalkan Pengajuan"
        cancelText="Kembali"
        isDestructive={true}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteData(null)}
      />

      {/* --- FORM MODAL: LEAVE / PERMISSION --- */}
      <AnimatePresence>
        {isLeaveModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden"
            >
              <div className="p-5 border-b border-slate-150 flex justify-between items-center bg-slate-50">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <Calendar className="text-blue-600" size={20} />
                  Formulir Pengajuan Izin/Cuti
                </h3>
                <button 
                  onClick={() => setIsLeaveModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-200/50 transition-all"
                >
                  <XCircle size={20} />
                </button>
              </div>

              <form onSubmit={handleLeaveSubmit} className="p-6 space-y-4">
                {/* Tipe Izin */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Tipe Pengajuan</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['izin', 'sakit', 'cuti'] as TipeIzin[]).map((type) => (
                      <button
                        type="button"
                        key={type}
                        onClick={() => setLeaveForm(prev => ({ ...prev, tipe: type }))}
                        className={`py-2 px-3 rounded-xl border text-sm font-medium transition-all capitalize ${
                          leaveForm.tipe === type
                            ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-sm'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Dates */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="tanggal_mulai" className="block text-sm font-semibold text-slate-700 mb-1">Tanggal Mulai</label>
                    <input
                      type="date"
                      id="tanggal_mulai"
                      required
                      value={leaveForm.tanggal_mulai}
                      onChange={(e) => setLeaveForm(prev => ({ ...prev, tanggal_mulai: e.target.value }))}
                      className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm text-slate-700 bg-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="tanggal_akhir" className="block text-sm font-semibold text-slate-700 mb-1">Tanggal Selesai</label>
                    <input
                      type="date"
                      id="tanggal_akhir"
                      required
                      value={leaveForm.tanggal_akhir}
                      onChange={(e) => setLeaveForm(prev => ({ ...prev, tanggal_akhir: e.target.value }))}
                      className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm text-slate-700 bg-white"
                    />
                  </div>
                </div>

                {/* Alasan */}
                <div>
                  <label htmlFor="alasan" className="block text-sm font-semibold text-slate-700 mb-1">Alasan Pengajuan</label>
                  <textarea
                    id="alasan"
                    rows={4}
                    required
                    placeholder="Tuliskan alasan lengkap mengenai pengajuan izin/cuti Anda di sini..."
                    value={leaveForm.alasan}
                    onChange={(e) => setLeaveForm(prev => ({ ...prev, alasan: e.target.value }))}
                    className="w-full p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm text-slate-700 placeholder-slate-400 bg-white"
                  ></textarea>
                </div>

                <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsLeaveModalOpen(false)}
                    className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm shadow-sm transition-all"
                  >
                    Kirim Pengajuan
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- FORM MODAL: OVERTIME / LEMBUR --- */}
      <AnimatePresence>
        {isOvertimeModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden"
            >
              <div className="p-5 border-b border-slate-150 flex justify-between items-center bg-slate-50">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <Clock className="text-blue-600" size={20} />
                  Formulir Pengajuan Lembur
                </h3>
                <button 
                  onClick={() => setIsOvertimeModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-200/50 transition-all"
                >
                  <XCircle size={20} />
                </button>
              </div>

              <form onSubmit={handleOvertimeSubmit} className="p-6 space-y-4">
                {/* Tanggal */}
                <div>
                  <label htmlFor="overtime_tanggal" className="block text-sm font-semibold text-slate-700 mb-1">Tanggal Lembur</label>
                  <input
                    type="date"
                    id="overtime_tanggal"
                    required
                    value={overtimeForm.tanggal}
                    onChange={(e) => setOvertimeForm(prev => ({ ...prev, tanggal: e.target.value }))}
                    className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm text-slate-700 bg-white"
                  />
                </div>

                {/* Durasi Jam */}
                <div>
                  <label htmlFor="durasi_jam" className="block text-sm font-semibold text-slate-700 mb-1">Durasi (Jam)</label>
                  <input
                    type="number"
                    id="durasi_jam"
                    required
                    min={1}
                    max={12}
                    value={overtimeForm.durasi_jam}
                    onChange={(e) => setOvertimeForm(prev => ({ ...prev, durasi_jam: Number(e.target.value) }))}
                    className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-semibold text-slate-700 bg-white"
                  />
                </div>

                {/* Keterangan */}
                <div>
                  <label htmlFor="keterangan" className="block text-sm font-semibold text-slate-700 mb-1">Keterangan Pekerjaan Lembur</label>
                  <textarea
                    id="keterangan"
                    rows={4}
                    required
                    placeholder="Tuliskan detail aktivitas pekerjaan yang dikerjakan saat jam lembur..."
                    value={overtimeForm.keterangan}
                    onChange={(e) => setOvertimeForm(prev => ({ ...prev, keterangan: e.target.value }))}
                    className="w-full p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm text-slate-700 placeholder-slate-400 bg-white"
                  ></textarea>
                </div>

                <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsOvertimeModalOpen(false)}
                    className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm shadow-sm transition-all"
                  >
                    Kirim Pengajuan
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
