import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import AppLogo from './AppLogo';
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
  } else {
    navItems.push({ name: 'Absen', path: '/checkinout', icon: MapPin });
    navItems.push({ name: 'Pengajuan', path: '/submissions', icon: ClipboardList });
    navItems.push({ name: 'Riwayat', path: '/history', icon: Clock });
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row relative overflow-hidden">
      {/* Luxurious Sulawesi Batik Walasuji (Diamond Lattice Motif) Watermark Background */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.03] select-none pointer-events-none z-0" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="layout-walasuji" width="120" height="120" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="120" y2="0" stroke="#2563EB" strokeWidth="1.2" />
            <line x1="0" y1="0" x2="0" y2="120" stroke="#0EA5E9" strokeWidth="1.2" />
            <rect x="20" y="20" width="80" height="80" fill="none" stroke="#2563EB" strokeWidth="0.8" strokeDasharray="4 8" />
            <rect x="45" y="45" width="30" height="30" fill="none" stroke="#0EA5E9" strokeWidth="0.8" />
            <circle cx="0" cy="0" r="3.5" fill="#2563EB" />
            <circle cx="60" cy="60" r="3" fill="#0EA5E9" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#layout-walasuji)" />
      </svg>

      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-white/90 backdrop-blur-md border-r border-slate-200 shrink-0 relative z-10 shadow-sm">
        <div className="p-5 border-b border-slate-200 flex items-center space-x-3">
          <AppLogo size={42} />
          <div className="flex flex-col">
            <span className="text-sm font-bold text-slate-800 leading-tight">US BILIBILI</span>
            <span className="text-[10px] font-mono font-bold tracking-widest text-blue-600 bg-blue-50 px-1 py-0.2 rounded mt-0.5 w-max">HADIR 162</span>
          </div>
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
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        {/* Desktop Header bar */}
        <header className="hidden md:flex items-center justify-between bg-white/80 backdrop-blur-md border-b border-slate-200 px-8 py-4 shrink-0">
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
        <header className="md:hidden bg-white/95 backdrop-blur-md border-b border-slate-200 p-3 px-4 flex justify-between items-center shrink-0">
          <div className="flex items-center space-x-2.5">
            <AppLogo size={36} />
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-800 leading-none">US BILIBILI</span>
              <span className="text-[9px] font-mono font-semibold tracking-wider text-blue-600 mt-0.5">HADIR 162</span>
            </div>
          </div>
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
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200 flex justify-around p-2 pb-safe z-40">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`flex flex-col items-center p-2 rounded-lg min-w-[64px] ${
              location.pathname === item.path
                ? 'text-blue-600 font-bold'
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
