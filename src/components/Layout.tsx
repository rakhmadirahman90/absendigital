import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Home, MapPin, Clock, LogOut, Shield, ClipboardList, Users, CheckSquare, FileCheck, Settings } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-hot-toast';
import NotificationBell from './NotificationBell';

export default function Layout() {
  const { dbUser, logout } = useAuth();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    toast.success('Anda telah berhasil keluar dari sistem');
  };

  const navItems = [
    { name: 'Dashboard', path: '/', icon: Home },
  ];

  if (dbUser?.role === 'admin') {
    navItems.push({ name: 'Karyawan', path: '/admin/karyawan', icon: Users });
    navItems.push({ name: 'Absensi', path: '/admin/absensi', icon: CheckSquare });
    navItems.push({ name: 'Approval', path: '/admin/approval', icon: FileCheck });
    navItems.push({ name: 'Pengaturan', path: '/admin/settings', icon: Settings });
    navItems.push({ name: 'Absen Mandiri', path: '/checkinout', icon: MapPin });
  } else {
    navItems.push({ name: 'Absen', path: '/checkinout', icon: MapPin });
    navItems.push({ name: 'Pengajuan', path: '/submissions', icon: ClipboardList });
    navItems.push({ name: 'Riwayat', path: '/history', icon: Clock });
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-slate-200 shrink-0">
        <div className="p-6 border-b border-slate-200">
          <h1 className="text-xl font-bold text-slate-800">HRIS System</h1>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                location.pathname === item.path
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <item.icon size={20} />
              <span>{item.name}</span>
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-200">
          <button
            onClick={handleLogout}
            className="flex items-center space-x-3 w-full px-4 py-3 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut size={20} />
            <span>Keluar</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Desktop Header bar */}
        <header className="hidden md:flex items-center justify-between bg-white border-b border-slate-200 px-8 py-4 shrink-0">
          <div className="flex flex-col">
            <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">Selamat datang</span>
            <span className="font-bold text-slate-800 text-sm">
              {dbUser?.nama || 'Karyawan'} <span className="font-normal text-slate-400">| {dbUser?.role === 'admin' ? 'Administrator' : 'Karyawan'}</span>
            </span>
          </div>
          <div className="flex items-center space-x-4">
            <NotificationBell />
            <div className="h-5 w-[1px] bg-slate-200"></div>
            <button
              onClick={handleLogout}
              className="flex items-center space-x-2 text-slate-600 hover:text-red-600 font-medium text-sm transition-colors cursor-pointer p-1.5 hover:bg-slate-50 rounded-lg"
            >
              <LogOut size={16} />
              <span>Keluar</span>
            </button>
          </div>
        </header>

        {/* Mobile Header */}
        <header className="md:hidden bg-white border-b border-slate-200 p-4 flex justify-between items-center shrink-0">
          <h1 className="text-lg font-bold text-slate-800">HRIS System</h1>
          <div className="flex items-center space-x-2">
            <NotificationBell />
            <button onClick={handleLogout} className="text-red-600 p-2 hover:bg-red-50 rounded-lg transition-all">
              <LogOut size={20} />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <div className="p-4 md:p-8 max-w-5xl mx-auto pb-24 md:pb-8">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Bottom Navigation for Mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-around p-2 pb-safe z-40">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`flex flex-col items-center p-2 rounded-lg min-w-[64px] ${
              location.pathname === item.path
                ? 'text-blue-600'
                : 'text-slate-500'
            }`}
          >
            <item.icon size={20} className="mb-1" />
            <span className="text-[10px] font-medium">{item.name}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
