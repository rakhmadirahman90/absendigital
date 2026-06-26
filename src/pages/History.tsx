import React, { useEffect, useState } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { format, parseISO } from 'date-fns';
import { id } from 'date-fns/locale';
import { useAuth } from '../context/AuthContext';

export default function History() {
  const { user } = useAuth();
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    
    setLoading(true);
    const q = query(
      collection(db, 'attendance'),
      where('user_id', '==', user.uid)
    );
    
    const unsub = onSnapshot(q, (snapshot) => {
        const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        records.sort((a: any, b: any) => b.tanggal.localeCompare(a.tanggal));
        setHistory(records);
        setLoading(false);
    }, (error) => {
        console.error(error);
        setLoading(false);
    });

    return () => unsub();
  }, [user]);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-800">Riwayat Kehadiran</h2>
      
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Memuat riwayat...</div>
        ) : history.length === 0 ? (
          <div className="p-8 text-center text-slate-500">Belum ada riwayat absensi.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="p-4 font-medium text-slate-600 text-sm">Tanggal</th>
                  <th className="p-4 font-medium text-slate-600 text-sm">Jam Masuk</th>
                  <th className="p-4 font-medium text-slate-600 text-sm">Jam Pulang</th>
                  <th className="p-4 font-medium text-slate-600 text-sm">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((record) => (
                  <tr key={record.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 text-slate-800">
                      {format(parseISO(record.tanggal), 'dd MMM yyyy', { locale: id })}
                    </td>
                    <td className="p-4 font-mono text-emerald-600 font-medium">
                      {record.jam_masuk || '--:--'}
                    </td>
                    <td className="p-4 font-mono text-slate-600 font-medium">
                      {record.jam_pulang || '--:--'}
                    </td>
                    <td className="p-4">
                      <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium capitalize">
                        {record.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
