import React, { useState, useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, writeBatch, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { Bell, BellRing, Check, Trash2, X, Clock, AlertTriangle, CheckCircle2, Inbox } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatDistanceToNow } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { toast } from 'react-hot-toast';

export default function NotificationBell() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;

    // Query notifications for current user (without orderBy to avoid index requirement)
    const q = query(
      collection(db, 'notifications'),
      where('user_id', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        list.push({
          id: doc.id,
          ...data,
          // Handle serverTimestamp placeholder on latency
          created_time: data.created_at?.toDate ? data.created_at.toDate().getTime() : Date.now()
        });
      });

      // Sort client-side
      list.sort((a, b) => b.created_time - a.created_time);
      setNotifications(list);
    }, (error) => {
      console.error("Gagal mendengarkan notifikasi:", error);
    });

    return () => unsubscribe();
  }, [user]);

  // Click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleToggleRead = async (notificationId: string, currentRead: boolean) => {
    try {
      await updateDoc(doc(db, 'notifications', notificationId), {
        read: !currentRead
      });
    } catch (error) {
      console.error('Gagal memperbarui notifikasi:', error);
    }
  };

  const handleDelete = async (notificationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteDoc(doc(db, 'notifications', notificationId));
      toast.success('Notifikasi dihapus');
    } catch (error) {
      console.error('Gagal menghapus notifikasi:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    const unreadNotifications = notifications.filter(n => !n.read);
    if (unreadNotifications.length === 0) return;

    try {
      const batch = writeBatch(db);
      unreadNotifications.forEach(n => {
        batch.update(doc(db, 'notifications', n.id), { read: true });
      });
      await batch.commit();
      toast.success('Semua notifikasi ditandai dibaca');
    } catch (error) {
      console.error('Gagal menandai semua dibaca:', error);
    }
  };

  const handleClearAll = async () => {
    if (notifications.length === 0) return;
    if (!window.confirm('Apakah Anda yakin ingin menghapus semua notifikasi?')) return;

    try {
      const batch = writeBatch(db);
      notifications.forEach(n => {
        batch.delete(doc(db, 'notifications', n.id));
      });
      await batch.commit();
      toast.success('Semua notifikasi dihapus');
      setIsOpen(false);
    } catch (error) {
      console.error('Gagal menghapus semua notifikasi:', error);
    }
  };

  // Helper to get formatted relative time
  const getRelativeTime = (timeMs: number) => {
    try {
      return formatDistanceToNow(new Date(timeMs), { addSuffix: true, locale: idLocale });
    } catch (err) {
      return 'baru saja';
    }
  };

  // Render notification icon based on type
  const renderNotificationIcon = (type: string) => {
    switch (type) {
      case 'attendance':
        return (
          <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
            <Clock size={16} />
          </div>
        );
      case 'submission_approved':
        return (
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
            <CheckCircle2 size={16} />
          </div>
        );
      case 'submission_rejected':
        return (
          <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
            <AlertTriangle size={16} />
          </div>
        );
      default:
        return (
          <div className="p-2 bg-slate-50 text-slate-600 rounded-xl">
            <Bell size={16} />
          </div>
        );
    }
  };

  return (
    <div className="relative" ref={dropdownRef} id="notification-bell-container">
      {/* Bell Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-slate-600 hover:text-blue-600 hover:bg-slate-100/80 rounded-xl transition-all cursor-pointer focus:outline-none"
        title="Notifikasi"
        id="notification-bell-button"
      >
        {unreadCount > 0 ? (
          <BellRing size={20} className="text-blue-600 animate-swing" />
        ) : (
          <Bell size={20} />
        )}
        
        {/* Animated Badge */}
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute top-1.5 right-1.5 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white ring-2 ring-white"
            >
              {unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      {/* Notification Dropdown List */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden z-50 origin-top-right"
          >
            {/* Header */}
            <div className="p-4 border-b border-slate-150 flex justify-between items-center bg-slate-50">
              <div>
                <h4 className="font-bold text-slate-800 text-sm">Notifikasi Anda</h4>
                <p className="text-xs text-slate-500">{unreadCount} belum dibaca</p>
              </div>
              <div className="flex gap-1.5">
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllAsRead}
                    className="p-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1"
                    title="Tandai semua dibaca"
                  >
                    <Check size={14} />
                    <span className="hidden sm:inline">Semua Dibaca</span>
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    onClick={handleClearAll}
                    className="p-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg transition-colors flex items-center gap-1"
                    title="Hapus semua"
                  >
                    <Trash2 size={13} />
                    <span className="hidden sm:inline">Hapus Semua</span>
                  </button>
                )}
              </div>
            </div>

            {/* List Body */}
            <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-100 font-sans">
              {notifications.length === 0 ? (
                <div className="p-8 text-center flex flex-col items-center justify-center space-y-2">
                  <div className="p-3 bg-slate-50 text-slate-400 rounded-full">
                    <Inbox size={24} />
                  </div>
                  <p className="text-sm font-semibold text-slate-600">Tidak ada notifikasi</p>
                  <p className="text-xs text-slate-400">Notifikasi log absensi atau status pengajuan Anda akan muncul di sini.</p>
                </div>
              ) : (
                notifications.map((notification) => (
                  <div
                    key={notification.id}
                    onClick={() => handleToggleRead(notification.id, notification.read)}
                    className={`p-4 flex gap-3 cursor-pointer hover:bg-slate-50 transition-all group relative ${
                      !notification.read ? 'bg-blue-50/25 border-l-2 border-blue-500' : ''
                    }`}
                  >
                    {/* Left Icon */}
                    <div className="shrink-0 mt-0.5">
                      {renderNotificationIcon(notification.type)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pr-6">
                      <div className="flex justify-between items-start gap-1">
                        <p className={`text-sm text-slate-800 leading-tight ${!notification.read ? 'font-bold' : 'font-medium'}`}>
                          {notification.title}
                        </p>
                        {!notification.read && (
                          <span className="w-1.5 h-1.5 bg-blue-600 rounded-full shrink-0 mt-1.5"></span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 mt-1.5 leading-relaxed break-words">
                        {notification.message}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-2 font-mono">
                        {getRelativeTime(notification.created_time)}
                      </p>
                    </div>

                    {/* Single Delete Action */}
                    <button
                      onClick={(e) => handleDelete(notification.id, e)}
                      className="absolute right-3 top-3 p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Hapus"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
